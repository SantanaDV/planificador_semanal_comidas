from __future__ import annotations

from functools import lru_cache
from typing import Any

from .. import ai as legacy_ai
from ..config import settings
from ..logging_service import record_log
from ..providers.text import (
    DeterministicTextProvider,
    GeminiTextProvider,
    LocalOllamaTextProvider,
    TextProvider,
    TextProviderError,
)

GenerationContext = dict[str, Any]
MenuPayload = dict[str, Any]
RecipePayload = dict[str, Any]
WeeklyMenuResolutionError = legacy_ai.WeeklyMenuResolutionError
OLLAMA_WEEKLY_SPLIT_THRESHOLD = 2


class TextGenerationService:
    def __init__(self, provider: TextProvider) -> None:
        self.provider = provider

    @property
    def provider_name(self) -> str:
        return self.provider.provider_name

    @property
    def model_name(self) -> str:
        return self.provider.model_name

    @property
    def is_configured(self) -> bool:
        return self.provider.is_configured

    @property
    def mode(self) -> str:
        return self.provider.mode

    def status_message(self, *, image_provider_name: str | None = None) -> str:
        suffix = (
            f" La resolucion de imagenes usa {image_provider_name} bajo demanda."
            if image_provider_name
            else ""
        )
        if self.provider_name == "ollama":
            return (
                f"Proveedor de texto actual: Ollama ({self.model_name}). El menu semanal y las sustituciones "
                "usan IA local y mantienen las mismas reglas de validacion del backend. "
                "Ollama debe estar levantado en LOCAL_TEXT_BASE_URL para que la generacion funcione."
                f"{suffix}"
            )
        if self.provider_name == "gemini":
            if self.is_configured:
                return (
                    "Proveedor de texto actual: Gemini. El menu semanal se genera con IA real, "
                    "prioriza la nevera y admite una despensa basica limitada."
                    f"{suffix}"
                )
            return (
                "Proveedor de texto actual: Gemini, pero no esta configurado. "
                "La generacion usara fallback local de demo."
                f"{suffix}"
            )
        return (
            "Proveedor de texto actual: deterministic-local. La generacion textual usa el proveedor "
            "local determinista de demo."
            f"{suffix}"
        )

    def generate_weekly_menu(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
    ) -> MenuPayload:
        if self.provider_name == "ollama":
            return self._generate_weekly_menu_with_local_provider(ingredients, generation_context)
        payload = self.provider.generate_weekly_menu(ingredients, generation_context)
        if isinstance(payload, dict) and not payload.get("ai_model"):
            payload["ai_model"] = self.model_name
        return payload

    def generate_replacement(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        day_index: int,
        meal_type: str,
    ) -> RecipePayload:
        if self.provider_name == "ollama":
            return self._generate_replacement_with_local_provider(
                ingredients,
                generation_context,
                day_index,
                meal_type,
            )
        payload = self.provider.generate_replacement(ingredients, generation_context, day_index, meal_type)
        if isinstance(payload, dict) and not payload.get("ai_model"):
            payload["ai_model"] = self.model_name
        return payload

    def normalize_menu_item(
        self,
        item: dict[str, Any],
        fallback_index: int,
        ingredients: list[dict[str, str | None]],
    ) -> RecipePayload:
        return legacy_ai.normalize_menu_item(item, fallback_index, ingredients)

    def _generate_weekly_menu_with_local_provider(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
    ) -> MenuPayload:
        final_items: list[dict[str, Any]] = []
        blocked_titles: list[str] = []
        slot_attempt_count = 0
        unresolved_indices: list[int] = []
        repair_failures: list[dict[str, Any]] = []

        for index in range(legacy_ai.EXPECTED_WEEKLY_ITEMS):
            slot_attempt_count += 1
            repaired_item, failure = self._repair_single_slot_with_provider(
                index=index,
                ingredients=ingredients,
                generation_context=generation_context,
                blocked_titles=blocked_titles,
            )
            if repaired_item:
                final_items.append(repaired_item)
                legacy_ai._register_used_title(blocked_titles, repaired_item)
                continue
            unresolved_indices.append(index)
            repair_failures.append(failure)

        if not unresolved_indices and len(final_items) == legacy_ai.EXPECTED_WEEKLY_ITEMS:
            final_items = self._sort_weekly_items(final_items)
            record_log(
                "info",
                "ai",
                "Menu semanal de Ollama completado con estrategia slot-first",
                {
                    "provider": self.provider_name,
                    "model": self.model_name,
                    "slot_attempt_count": slot_attempt_count,
                },
            )
            return {
                "items": final_items,
                "ai_model": self.model_name,
                "notes": f"Menu generado con {self.provider_name} mediante generacion local por slot.",
            }

        raise WeeklyMenuResolutionError(
            "No se pudo cerrar un menu semanal 100% IA con las reglas actuales",
            {
                "error_type": "unresolved_slots_after_repair",
                "provider": self.provider_name,
                "model": self.model_name,
                "unresolved_indices": unresolved_indices,
                "slot_attempt_count": slot_attempt_count,
                "repair_failures": repair_failures,
            },
        )

    def _resolve_weekly_block(
        self,
        *,
        block_slots: list[int],
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        blocked_titles: list[str],
    ) -> dict[str, Any]:
        result = {
            "items": [],
            "repaired_item_count": 0,
            "block_attempt_count": 1,
            "slot_attempt_count": 0,
            "unresolved_indices": [],
            "repair_failures": [],
        }
        block_context = legacy_ai._generation_context_for_slot_repair(generation_context, blocked_titles)
        slot_descriptors = [self._slot_descriptor(index) for index in block_slots]
        block_error: dict[str, Any] | None = None
        try:
            block_payload = self.provider.generate_weekly_menu_block(ingredients, block_context, slot_descriptors)
            block_items = legacy_ai._payload_items(block_payload)
        except TextProviderError as exc:
            block_items = []
            block_error = {
                "error_type": exc.error_type,
                "provider_context": exc.context,
            }
            if len(block_slots) > OLLAMA_WEEKLY_SPLIT_THRESHOLD:
                record_log(
                    "warning",
                    "ai",
                    "Bloque semanal de Ollama fallido; se divide en bloques menores",
                    {
                        "provider": self.provider_name,
                        "model": self.model_name,
                        "slots": block_slots,
                        "error_type": exc.error_type,
                        **exc.context,
                    },
                )
                split_result = self._resolve_split_weekly_blocks(
                    block_slots=block_slots,
                    ingredients=ingredients,
                    generation_context=generation_context,
                    blocked_titles=blocked_titles,
                )
                split_result["block_attempt_count"] += 1
                return split_result
            record_log(
                "warning",
                "ai",
                "Fallo generando un bloque semanal con Ollama; se intentaran sustituciones por slot",
                {
                    "provider": self.provider_name,
                    "model": self.model_name,
                    "slots": block_slots,
                    "error_type": exc.error_type,
                    **exc.context,
                },
            )

        invalid_slots: list[tuple[int, dict[str, Any]]] = []
        for position, slot_index in enumerate(block_slots):
            current_context = legacy_ai._generation_context_for_slot_repair(generation_context, blocked_titles)
            candidate = block_items[position] if position < len(block_items) else None
            accepted_item, failure = self._coerce_weekly_block_item(
                index=slot_index,
                candidate=candidate,
                ingredients=ingredients,
                generation_context=current_context,
            )
            if accepted_item:
                result["items"].append(accepted_item)
                legacy_ai._register_used_title(blocked_titles, accepted_item)
                continue
            if failure and block_error:
                failure = {**failure, "block_error": block_error}
            invalid_slots.append((slot_index, failure))

        invalid_slot_indices = [slot_index for slot_index, _ in invalid_slots]
        if invalid_slot_indices and len(invalid_slot_indices) == len(block_slots):
            record_log(
                "info",
                "ai",
                "Bloque semanal sin candidatos validos; se pasa directamente a reparacion por slot",
                {
                    "provider": self.provider_name,
                    "model": self.model_name,
                    "slots": block_slots,
                },
            )
        elif len(invalid_slot_indices) >= 2 and len(block_slots) > OLLAMA_WEEKLY_SPLIT_THRESHOLD:
            record_log(
                "info",
                "ai",
                "Bloque semanal parcialmente invalido; se reintenta por subbloques",
                {
                    "provider": self.provider_name,
                    "model": self.model_name,
                    "slots": block_slots,
                    "invalid_slots": invalid_slot_indices,
                },
            )
            split_result = self._resolve_split_weekly_blocks(
                block_slots=invalid_slot_indices,
                ingredients=ingredients,
                generation_context=generation_context,
                blocked_titles=blocked_titles,
            )
            result["items"].extend(split_result["items"])
            result["repaired_item_count"] += split_result["repaired_item_count"]
            result["block_attempt_count"] += split_result["block_attempt_count"]
            result["slot_attempt_count"] += split_result["slot_attempt_count"]
            result["unresolved_indices"].extend(split_result["unresolved_indices"])
            result["repair_failures"].extend(split_result["repair_failures"])
            return result

        for slot_index, failure in invalid_slots:
            result["slot_attempt_count"] += 1
            repaired_item, repair_failure = self._repair_single_slot_with_provider(
                index=slot_index,
                ingredients=ingredients,
                generation_context=legacy_ai._generation_context_for_slot_repair(generation_context, blocked_titles),
                blocked_titles=blocked_titles,
            )
            if repaired_item:
                result["items"].append(repaired_item)
                result["repaired_item_count"] += 1
                legacy_ai._register_used_title(blocked_titles, repaired_item)
                continue
            result["unresolved_indices"].append(slot_index)
            result["repair_failures"].append(repair_failure or failure)

        return result

    def _resolve_split_weekly_blocks(
        self,
        *,
        block_slots: list[int],
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        blocked_titles: list[str],
    ) -> dict[str, Any]:
        merged = {
            "items": [],
            "repaired_item_count": 0,
            "block_attempt_count": 0,
            "slot_attempt_count": 0,
            "unresolved_indices": [],
            "repair_failures": [],
        }
        for subset in self._split_slot_group(block_slots):
            subset_result = self._resolve_weekly_block(
                block_slots=subset,
                ingredients=ingredients,
                generation_context=generation_context,
                blocked_titles=blocked_titles,
            )
            merged["items"].extend(subset_result["items"])
            merged["repaired_item_count"] += subset_result["repaired_item_count"]
            merged["block_attempt_count"] += subset_result["block_attempt_count"]
            merged["slot_attempt_count"] += subset_result["slot_attempt_count"]
            merged["unresolved_indices"].extend(subset_result["unresolved_indices"])
            merged["repair_failures"].extend(subset_result["repair_failures"])
        return merged

    def _generate_replacement_with_local_provider(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        day_index: int,
        meal_type: str,
    ) -> RecipePayload:
        payload = self.provider.generate_replacement(ingredients, generation_context, day_index, meal_type)
        if isinstance(payload, dict) and isinstance(payload.get("recipe"), dict) and legacy_ai._recipe_respects_context(
            payload["recipe"],
            ingredients,
            generation_context,
        ):
            item = legacy_ai.normalize_menu_item(
                {
                    "day_index": day_index,
                    "day_name": legacy_ai.DAYS[day_index],
                    "meal_type": meal_type,
                    "recipe": payload["recipe"],
                    "explanation": payload.get("explanation", "Alternativa ajustada a tus preferencias."),
                },
                day_index * 2 + legacy_ai.MEAL_TYPES.index(meal_type),
                ingredients,
            )
            item["ai_model"] = self.model_name
            item["recipe"]["source"] = self.model_name
            return item

        record_log(
            "warning",
            "ai",
            "La sustitucion generada por Ollama no paso validacion; se usa respaldo determinista",
            {"provider": self.provider_name, "model": self.model_name, "day_index": day_index, "meal_type": meal_type},
        )
        deterministic_payload = DeterministicTextProvider().generate_replacement(
            ingredients,
            generation_context,
            day_index,
            meal_type,
        )
        deterministic_payload["ai_model"] = DeterministicTextProvider.model_name
        return deterministic_payload

    def _build_ai_weekly_response(
        self,
        payload: dict[str, Any],
        *,
        retried: bool,
        repaired_slots: int = 0,
    ) -> MenuPayload:
        payload["ai_model"] = self.model_name
        if repaired_slots > 0:
            payload["notes"] = (
                f"Menu generado con {self.provider_name} tras reparar huecos invalidos con IA local. "
                f"Huecos reparados: {repaired_slots}."
            )
        elif retried:
            payload["notes"] = f"Menu generado con {self.provider_name} tras un reintento de validacion."
        else:
            payload["notes"] = f"Menu generado con {self.provider_name} a partir de ingredientes y preferencias."
        return payload

    def _accept_or_repair_weekly_slot(
        self,
        *,
        index: int,
        candidate: dict[str, Any] | None,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        blocked_titles: list[str],
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        candidate_item, failure = self._coerce_weekly_block_item(
            index=index,
            candidate=candidate,
            ingredients=ingredients,
            generation_context=generation_context,
        )
        if candidate_item:
            return candidate_item, None

        repaired_item, repair_failure = self._repair_single_slot_with_provider(
            index=index,
            ingredients=ingredients,
            generation_context=generation_context,
            blocked_titles=blocked_titles,
        )
        if repaired_item:
            return repaired_item, failure
        return None, repair_failure or failure

    def _coerce_weekly_block_item(
        self,
        *,
        index: int,
        candidate: dict[str, Any] | None,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
    ) -> tuple[dict[str, Any] | None, dict[str, Any]]:
        if not isinstance(candidate, dict):
            return None, {
                "index": index,
                "day_name": legacy_ai.DAYS[index // 2],
                "meal_type": legacy_ai.MEAL_TYPES[index % 2],
                "failure_stage": "structure",
                "invalid_reason": "block_item_not_object",
                "provider": self.provider_name,
                "model": self.model_name,
            }
        recipe = candidate.get("recipe")
        if not isinstance(recipe, dict):
            return None, {
                "index": index,
                "day_name": legacy_ai.DAYS[index // 2],
                "meal_type": legacy_ai.MEAL_TYPES[index % 2],
                "failure_stage": "structure",
                "invalid_reason": "recipe_not_object",
                "provider": self.provider_name,
                "model": self.model_name,
            }

        recipe_report = legacy_ai._validate_recipe_context(recipe, ingredients, generation_context)
        if not recipe_report["valid"]:
            return None, {
                "index": index,
                "day_name": legacy_ai.DAYS[index // 2],
                "meal_type": legacy_ai.MEAL_TYPES[index % 2],
                "failure_stage": recipe_report["validation_stage"],
                "invalid_reason": recipe_report["invalid_reason"],
                "title": recipe_report["title"],
                "invalid_ingredients": recipe_report["invalid_ingredients"],
                "provider": self.provider_name,
                "model": self.model_name,
            }

        item = legacy_ai.normalize_menu_item(
            {
                "day_index": index // 2,
                "day_name": legacy_ai.DAYS[index // 2],
                "meal_type": legacy_ai.MEAL_TYPES[index % 2],
                "recipe": recipe,
                "explanation": candidate.get("explanation", "Plato ajustado a tus ingredientes disponibles."),
            },
            index,
            ingredients,
        )
        legacy_ai._annotate_item_recipe_source(item, self.model_name)
        return item, {
            "index": index,
            "day_name": legacy_ai.DAYS[index // 2],
            "meal_type": legacy_ai.MEAL_TYPES[index % 2],
            "failure_stage": None,
            "invalid_reason": None,
            "provider": self.provider_name,
            "model": self.model_name,
        }

    def _weekly_slot_blocks(self) -> list[list[int]]:
        return [
            list(range(0, legacy_ai.EXPECTED_WEEKLY_ITEMS, 2)),
            list(range(1, legacy_ai.EXPECTED_WEEKLY_ITEMS, 2)),
        ]

    def _split_slot_group(self, slot_indices: list[int]) -> list[list[int]]:
        midpoint = max(1, len(slot_indices) // 2)
        left = slot_indices[:midpoint]
        right = slot_indices[midpoint:]
        return [group for group in (left, right) if group]

    def _sort_weekly_items(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        meal_order = {meal_type: index for index, meal_type in enumerate(legacy_ai.MEAL_TYPES)}
        return sorted(
            items,
            key=lambda item: (
                int(item.get("day_index") or 0),
                meal_order.get(str(item.get("meal_type") or ""), 99),
            ),
        )

    def _slot_descriptor(self, index: int) -> dict[str, Any]:
        return {
            "index": index,
            "day_index": index // 2,
            "day_name": legacy_ai.DAYS[index // 2],
            "meal_type": legacy_ai.MEAL_TYPES[index % 2],
        }

    def _repair_weekly_slots_with_provider(
        self,
        *,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        initial_payload: dict[str, Any] | None,
        initial_report: dict[str, Any],
        retry_payload: dict[str, Any] | None,
        retry_report: dict[str, Any],
    ) -> dict[str, Any]:
        initial_items = legacy_ai._payload_items(initial_payload)
        retry_items = legacy_ai._payload_items(retry_payload)
        final_items: list[dict[str, Any]] = []
        blocked_titles: list[str] = []
        repaired_item_count = 0
        slot_attempt_count = 0
        unresolved_indices: list[int] = []
        repair_failures: list[dict[str, Any]] = []

        for index in range(legacy_ai.EXPECTED_WEEKLY_ITEMS):
            selected_item = legacy_ai._select_valid_weekly_item(
                index=index,
                initial_items=initial_items,
                initial_report=initial_report,
                retry_items=retry_items,
                retry_report=retry_report,
            )
            if selected_item:
                legacy_ai._annotate_item_recipe_source(selected_item, self.model_name)
                final_items.append(selected_item)
                legacy_ai._register_used_title(blocked_titles, selected_item)
                continue

            slot_attempt_count += 1
            repaired_item, failure = self._repair_single_slot_with_provider(
                index=index,
                ingredients=ingredients,
                generation_context=generation_context,
                blocked_titles=blocked_titles,
            )
            if repaired_item:
                final_items.append(repaired_item)
                repaired_item_count += 1
                legacy_ai._register_used_title(blocked_titles, repaired_item)
                continue

            unresolved_indices.append(index)
            repair_failures.append(failure)

        return {
            "items": final_items,
            "repaired_item_count": repaired_item_count,
            "slot_attempt_count": slot_attempt_count,
            "unresolved_count": len(unresolved_indices),
            "unresolved_indices": unresolved_indices,
            "repair_failures": repair_failures,
        }

    def _repair_single_slot_with_provider(
        self,
        *,
        index: int,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        blocked_titles: list[str],
    ) -> tuple[dict[str, Any] | None, dict[str, Any]]:
        day_index = index // 2
        meal_type = legacy_ai.MEAL_TYPES[index % 2]
        repair_context = legacy_ai._generation_context_for_slot_repair(generation_context, blocked_titles)
        payload = self.provider.generate_replacement(ingredients, repair_context, day_index, meal_type)

        if not isinstance(payload, dict) or not isinstance(payload.get("recipe"), dict):
            return None, {
                "index": index,
                "day_name": legacy_ai.DAYS[day_index],
                "meal_type": meal_type,
                "failure_stage": "structure",
                "invalid_reason": "replacement_recipe_not_object",
                "provider": self.provider_name,
                "model": self.model_name,
            }

        recipe_report = legacy_ai._validate_recipe_context(payload["recipe"], ingredients, repair_context)
        if not recipe_report["valid"]:
            return None, {
                "index": index,
                "day_name": legacy_ai.DAYS[day_index],
                "meal_type": meal_type,
                "failure_stage": recipe_report["validation_stage"],
                "invalid_reason": recipe_report["invalid_reason"],
                "title": recipe_report["title"],
                "invalid_ingredients": recipe_report["invalid_ingredients"],
                "provider": self.provider_name,
                "model": self.model_name,
            }

        item = legacy_ai.normalize_menu_item(
            {
                "day_index": day_index,
                "day_name": legacy_ai.DAYS[day_index],
                "meal_type": meal_type,
                "recipe": payload["recipe"],
                "explanation": payload.get("explanation", "Plato reparado con IA para completar el menu semanal."),
            },
            index,
            ingredients,
        )
        legacy_ai._annotate_item_recipe_source(item, self.model_name)
        return item, {
            "index": index,
            "day_name": legacy_ai.DAYS[day_index],
            "meal_type": meal_type,
            "failure_stage": None,
            "invalid_reason": None,
            "provider": self.provider_name,
            "model": self.model_name,
        }


@lru_cache
def get_text_generation_service() -> TextGenerationService:
    provider_name = (settings.text_ai_provider or "").strip().lower()
    if provider_name == "ollama":
        return TextGenerationService(LocalOllamaTextProvider())
    if provider_name == "deterministic":
        return TextGenerationService(DeterministicTextProvider())
    if provider_name not in {"", "gemini"}:
        record_log(
            "warning",
            "backend",
            "Proveedor de texto no reconocido; se usa Ollama por defecto",
            {"requested_provider": settings.text_ai_provider},
        )
        return TextGenerationService(LocalOllamaTextProvider())
    return TextGenerationService(GeminiTextProvider())
