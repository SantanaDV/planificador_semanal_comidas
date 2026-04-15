from __future__ import annotations

import json
import re
from typing import Any, Literal, Protocol
from urllib.parse import urljoin

import httpx

from .. import ai as legacy_ai
from ..config import settings
from ..demo_fallback import build_replacement_item, build_weekly_menu
from ..logging_service import record_exception

GenerationContext = dict[str, Any]
MenuPayload = dict[str, Any]
RecipePayload = dict[str, Any]

OLLAMA_WEEKLY_TIMEOUT_SECONDS = 180
OLLAMA_REPLACEMENT_TIMEOUT_SECONDS = 90
OLLAMA_MAX_RECIPES_IN_CONTEXT = 8

WEEKLY_MENU_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "day_index": {"type": "integer"},
                    "day_name": {"type": "string"},
                    "meal_type": {"type": "string"},
                    "explanation": {"type": "string"},
                    "recipe": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "ingredients": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["title", "ingredients"],
                    },
                },
                "required": ["day_index", "day_name", "meal_type", "explanation", "recipe"],
            },
        }
    },
    "required": ["items"],
}

REPLACEMENT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "explanation": {"type": "string"},
        "recipe": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "ingredients": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["title", "ingredients"],
        },
    },
    "required": ["explanation", "recipe"],
}

WEEKLY_BLOCK_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "explanation": {"type": "string"},
                    "recipe": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "ingredients": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["title", "ingredients"],
                    },
                },
                "required": ["explanation", "recipe"],
            },
        }
    },
    "required": ["items"],
}


class TextProviderError(Exception):
    def __init__(self, message: str, *, error_type: str, context: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.error_type = error_type
        self.context = context or {}


class TextProvider(Protocol):
    provider_name: str
    model_name: str
    mode: Literal["ai", "fallback"]
    is_configured: bool

    def generate_weekly_menu(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
    ) -> MenuPayload: ...

    def generate_weekly_menu_retry(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        validation_report: dict[str, Any],
    ) -> MenuPayload: ...

    def generate_weekly_menu_block(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        slots: list[dict[str, Any]],
    ) -> MenuPayload: ...

    def generate_replacement(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        day_index: int,
        meal_type: str,
    ) -> RecipePayload: ...


class GeminiTextProvider:
    provider_name = "gemini"

    @property
    def model_name(self) -> str:
        return settings.gemini_model

    @property
    def mode(self) -> Literal["ai", "fallback"]:
        return "ai" if self.is_configured else "fallback"

    @property
    def is_configured(self) -> bool:
        return settings.has_valid_gemini_api_key

    def generate_weekly_menu(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
    ) -> MenuPayload:
        return legacy_ai.generate_weekly_menu(ingredients, generation_context)

    def generate_weekly_menu_retry(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        validation_report: dict[str, Any],
    ) -> MenuPayload:
        return legacy_ai.generate_weekly_menu(ingredients, generation_context)

    def generate_replacement(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        day_index: int,
        meal_type: str,
    ) -> RecipePayload:
        return legacy_ai.generate_replacement(ingredients, generation_context, day_index, meal_type)

    def generate_weekly_menu_block(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        slots: list[dict[str, Any]],
    ) -> MenuPayload:
        payload = legacy_ai.generate_weekly_menu(ingredients, generation_context)
        items = payload.get("items") if isinstance(payload, dict) else []
        selected_items = []
        for slot in slots:
            index = int(slot.get("index") or 0)
            if isinstance(items, list) and index < len(items):
                selected_items.append(items[index])
        return {"items": selected_items}


class LocalOllamaTextProvider:
    provider_name = "ollama"
    mode: Literal["ai"] = "ai"

    def __init__(self) -> None:
        self._model_warmed = False

    @property
    def model_name(self) -> str:
        return settings.local_text_model

    @property
    def is_configured(self) -> bool:
        return bool((settings.local_text_base_url or "").strip() and (settings.local_text_model or "").strip())

    def generate_weekly_menu(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
    ) -> MenuPayload:
        prompt = _build_ollama_weekly_prompt(ingredients, generation_context)
        return self._weekly_payload_from_prompt(prompt, operation="weekly_menu", timeout_seconds=OLLAMA_WEEKLY_TIMEOUT_SECONDS)

    def generate_weekly_menu_retry(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        validation_report: dict[str, Any],
    ) -> MenuPayload:
        prompt = _build_ollama_weekly_retry_prompt(ingredients, generation_context, validation_report)
        return self._weekly_payload_from_prompt(prompt, operation="weekly_menu_retry", timeout_seconds=OLLAMA_WEEKLY_TIMEOUT_SECONDS)

    def _weekly_payload_from_prompt(
        self,
        prompt: str,
        *,
        operation: str,
        timeout_seconds: int,
    ) -> MenuPayload:
        payload = self._chat_json(
            prompt=prompt,
            schema=WEEKLY_MENU_SCHEMA,
            timeout_seconds=timeout_seconds,
            operation=operation,
        )
        if not isinstance(payload, dict):
            raise TextProviderError(
                "Ollama devolvio una respuesta no valida al generar el menu semanal.",
                error_type="provider_invalid_response",
                context={"operation": operation, "model": self.model_name},
            )
        return payload

    def generate_weekly_menu_block(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        slots: list[dict[str, Any]],
    ) -> MenuPayload:
        prompt = _build_ollama_weekly_block_prompt(ingredients, generation_context, slots)
        content = self._chat_text(
            prompt=prompt,
            timeout_seconds=OLLAMA_WEEKLY_TIMEOUT_SECONDS,
            operation="weekly_menu_block",
            num_predict=_num_predict_for_weekly_block(len(slots)),
        )
        payload = _parse_weekly_block_text(content, slots)
        if not isinstance(payload, dict):
            raise TextProviderError(
                "Ollama devolvio una respuesta no valida al generar un bloque semanal.",
                error_type="provider_invalid_response",
                context={"operation": "weekly_menu_block", "model": self.model_name},
            )
        return payload

    def _chat_text(
        self,
        *,
        prompt: str,
        timeout_seconds: int,
        operation: str,
        num_predict: int | None = None,
    ) -> str:
        url = urljoin(f"{settings.local_text_base_url.rstrip('/')}/", "api/chat")
        self._warm_model(url)
        prompts = [prompt, _strengthen_delimited_prompt(prompt)]
        with httpx.Client(timeout=timeout_seconds) as client:
            for attempt_index, prompt_variant in enumerate(prompts, start=1):
                payload = {
                    "model": self.model_name,
                    "messages": [{"role": "user", "content": prompt_variant}],
                    "stream": False,
                    "keep_alive": "30m",
                    "options": {
                        "temperature": 0.1,
                        "num_predict": num_predict if num_predict is not None else _num_predict_for_operation(operation),
                    },
                }
                try:
                    response = client.post(url, json=payload)
                    response.raise_for_status()
                    raw = response.json()
                    content = str(((raw.get("message") or {}).get("content")) or "").strip()
                    if content:
                        return content
                    if attempt_index < len(prompts):
                        continue
                    raise TextProviderError(
                        "Ollama respondio sin contenido util.",
                        error_type="provider_empty_response",
                        context={
                            "operation": operation,
                            "model": self.model_name,
                            "base_url": settings.local_text_base_url,
                            "attempt": attempt_index,
                        },
                    )
                except TextProviderError:
                    raise
                except httpx.ConnectError as exc:
                    context = {
                        "operation": operation,
                        "model": self.model_name,
                        "base_url": settings.local_text_base_url,
                        "attempt": attempt_index,
                    }
                    record_exception("ai", "No se pudo conectar con Ollama", exc, context)
                    raise TextProviderError(
                        "No se pudo conectar con Ollama. Comprueba que el proveedor local este levantado.",
                        error_type="provider_unavailable",
                        context=context,
                    ) from exc
                except httpx.TimeoutException as exc:
                    context = {
                        "operation": operation,
                        "model": self.model_name,
                        "base_url": settings.local_text_base_url,
                        "timeout_seconds": timeout_seconds,
                        "attempt": attempt_index,
                    }
                    record_exception("ai", "Ollama agoto el tiempo de espera", exc, context)
                    raise TextProviderError(
                        "Ollama ha tardado demasiado en responder.",
                        error_type="provider_timeout",
                        context=context,
                    ) from exc
                except httpx.HTTPStatusError as exc:
                    context = {
                        "operation": operation,
                        "model": self.model_name,
                        "base_url": settings.local_text_base_url,
                        "status_code": exc.response.status_code,
                        "attempt": attempt_index,
                    }
                    record_exception("ai", "Ollama devolvio un error HTTP", exc, context)
                    raise TextProviderError(
                        "Ollama devolvio un error HTTP al generar texto.",
                        error_type="provider_http_error",
                        context=context,
                    ) from exc
                except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
                    if attempt_index < len(prompts):
                        continue
                    context = {
                        "operation": operation,
                        "model": self.model_name,
                        "base_url": settings.local_text_base_url,
                        "attempt": attempt_index,
                    }
                    record_exception("ai", "Ollama devolvio una respuesta no interpretable", exc, context)
                    raise TextProviderError(
                        "Ollama devolvio una respuesta no interpretable.",
                        error_type="provider_invalid_response",
                        context=context,
                    ) from exc
        raise TextProviderError(
            "Ollama no devolvio contenido interpretable.",
            error_type="provider_empty_response",
            context={"operation": operation, "model": self.model_name},
        )

    def generate_replacement(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        day_index: int,
        meal_type: str,
    ) -> RecipePayload:
        prompt = _build_ollama_replacement_prompt(ingredients, generation_context, day_index, meal_type)
        payload = self._chat_json(
            prompt=prompt,
            schema=REPLACEMENT_SCHEMA,
            timeout_seconds=OLLAMA_REPLACEMENT_TIMEOUT_SECONDS,
            operation="replacement",
        )
        if not isinstance(payload, dict):
            raise TextProviderError(
                "Ollama devolvio una respuesta no valida al generar la sustitucion.",
                error_type="provider_invalid_response",
                context={"operation": "replacement", "model": self.model_name},
            )
        return payload

    def _chat_json(
        self,
        *,
        prompt: str,
        schema: dict[str, Any],
        timeout_seconds: int,
        operation: str,
        num_predict: int | None = None,
    ) -> dict[str, Any] | None:
        url = urljoin(f"{settings.local_text_base_url.rstrip('/')}/", "api/chat")
        self._warm_model(url)
        prompts = [prompt, _strengthen_json_prompt(prompt)]
        with httpx.Client(timeout=timeout_seconds) as client:
            for attempt_index, prompt_variant in enumerate(prompts, start=1):
                payload = {
                    "model": self.model_name,
                    "messages": [{"role": "user", "content": prompt_variant}],
                    "stream": False,
                    "format": "json",
                    "keep_alive": "30m",
                    "options": {
                        "temperature": 0.2,
                        "num_predict": num_predict if num_predict is not None else _num_predict_for_operation(operation),
                    },
                }
                try:
                    response = client.post(url, json=payload)
                    response.raise_for_status()
                    raw = response.json()
                    content = str(((raw.get("message") or {}).get("content")) or "").strip()
                    if not content:
                        if attempt_index < len(prompts):
                            continue
                        raise TextProviderError(
                            "Ollama respondio sin contenido util.",
                            error_type="provider_empty_response",
                            context={
                                "operation": operation,
                                "model": self.model_name,
                                "base_url": settings.local_text_base_url,
                                "attempt": attempt_index,
                            },
                        )
                    return legacy_ai._parse_json(content)
                except TextProviderError:
                    raise
                except httpx.ConnectError as exc:
                    context = {
                        "operation": operation,
                        "model": self.model_name,
                        "base_url": settings.local_text_base_url,
                        "attempt": attempt_index,
                    }
                    record_exception("ai", "No se pudo conectar con Ollama", exc, context)
                    raise TextProviderError(
                        "No se pudo conectar con Ollama. Comprueba que el proveedor local este levantado.",
                        error_type="provider_unavailable",
                        context=context,
                    ) from exc
                except httpx.TimeoutException as exc:
                    context = {
                        "operation": operation,
                        "model": self.model_name,
                        "base_url": settings.local_text_base_url,
                        "timeout_seconds": timeout_seconds,
                        "attempt": attempt_index,
                    }
                    record_exception("ai", "Ollama agoto el tiempo de espera", exc, context)
                    raise TextProviderError(
                        "Ollama ha tardado demasiado en responder.",
                        error_type="provider_timeout",
                        context=context,
                    ) from exc
                except httpx.HTTPStatusError as exc:
                    context = {
                        "operation": operation,
                        "model": self.model_name,
                        "base_url": settings.local_text_base_url,
                        "status_code": exc.response.status_code,
                        "attempt": attempt_index,
                    }
                    record_exception("ai", "Ollama devolvio un error HTTP", exc, context)
                    raise TextProviderError(
                        "Ollama devolvio un error HTTP al generar texto.",
                        error_type="provider_http_error",
                        context=context,
                    ) from exc
                except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
                    if attempt_index < len(prompts):
                        continue
                    context = {
                        "operation": operation,
                        "model": self.model_name,
                        "base_url": settings.local_text_base_url,
                        "attempt": attempt_index,
                    }
                    record_exception("ai", "Ollama devolvio una respuesta no interpretable", exc, context)
                    raise TextProviderError(
                        "Ollama devolvio una respuesta no interpretable.",
                        error_type="provider_invalid_response",
                        context=context,
                    ) from exc
        return None

    def _warm_model(self, url: str) -> None:
        if self._model_warmed:
            return
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": "Responde solo ok."}],
            "stream": False,
            "keep_alive": "30m",
            "options": {"temperature": 0, "num_predict": 8},
        }
        try:
            with httpx.Client(timeout=20) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()
        except httpx.ConnectError as exc:
            context = {"operation": "warmup", "model": self.model_name, "base_url": settings.local_text_base_url}
            record_exception("ai", "No se pudo conectar con Ollama durante el calentamiento del modelo", exc, context)
            raise TextProviderError(
                "No se pudo conectar con Ollama. Comprueba que el proveedor local este levantado.",
                error_type="provider_unavailable",
                context=context,
            ) from exc
        except httpx.TimeoutException as exc:
            context = {
                "operation": "warmup",
                "model": self.model_name,
                "base_url": settings.local_text_base_url,
                "timeout_seconds": 20,
            }
            record_exception("ai", "Ollama agoto el tiempo de espera durante el calentamiento del modelo", exc, context)
            raise TextProviderError(
                "Ollama ha tardado demasiado en cargar el modelo local.",
                error_type="provider_timeout",
                context=context,
            ) from exc
        except httpx.HTTPStatusError as exc:
            context = {
                "operation": "warmup",
                "model": self.model_name,
                "base_url": settings.local_text_base_url,
                "status_code": exc.response.status_code,
            }
            record_exception("ai", "Ollama devolvio un error HTTP durante el calentamiento del modelo", exc, context)
            raise TextProviderError(
                "Ollama devolvio un error HTTP al preparar el modelo local.",
                error_type="provider_http_error",
                context=context,
            ) from exc
        self._model_warmed = True


class DeterministicTextProvider:
    provider_name = "deterministic"
    model_name = "deterministic-local"
    mode: Literal["fallback"] = "fallback"
    is_configured = True

    def generate_weekly_menu(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
    ) -> MenuPayload:
        payload = build_weekly_menu(ingredients, generation_context)
        payload["ai_model"] = self.model_name
        return payload

    def generate_weekly_menu_retry(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        validation_report: dict[str, Any],
    ) -> MenuPayload:
        return self.generate_weekly_menu(ingredients, generation_context)

    def generate_replacement(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        day_index: int,
        meal_type: str,
    ) -> RecipePayload:
        payload = build_replacement_item(day_index, meal_type, ingredients, generation_context, offset=5)
        payload["ai_model"] = self.model_name
        return payload

    def generate_weekly_menu_block(
        self,
        ingredients: list[dict[str, str | None]],
        generation_context: GenerationContext,
        slots: list[dict[str, Any]],
    ) -> MenuPayload:
        payload = self.generate_weekly_menu(ingredients, generation_context)
        items = payload.get("items") if isinstance(payload, dict) else []
        selected_items = []
        for slot in slots:
            index = int(slot.get("index") or 0)
            if isinstance(items, list) and index < len(items):
                selected_items.append(items[index])
        return {"items": selected_items}


def _ollama_prompt_context(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> dict[str, Any]:
    saved_recipes = generation_context.get("compatible_saved_recipes") or []
    prioritized_saved_recipes = sorted(
        saved_recipes,
        key=lambda recipe: (
            not bool(recipe.get("is_favorite")),
            bool(recipe.get("is_recent")),
            str(recipe.get("title") or "").lower(),
        ),
    )[:OLLAMA_MAX_RECIPES_IN_CONTEXT]
    return {
        "ingredientes_principales_permitidos": [
            str(ingredient.get("name"))
            for ingredient in ingredients
            if ingredient.get("name")
        ],
        "ingredientes_excluidos": generation_context.get("excluded_ingredient_names") or [],
        "preferencias_usuario": generation_context.get("preferences_text") or "sin preferencias adicionales",
        "resumen_preferencias": generation_context.get("preferences_summary") or "",
        "recetas_recientes_a_evitar": generation_context.get("recent_recipe_titles") or [],
        "despensa_basica_permitida": generation_context.get("pantry_basics") or [],
        "despensa_basica_apoyo_libre": generation_context.get("pantry_free_support_basics") or [],
        "despensa_basica_estructural_limitada": generation_context.get("pantry_structural_basics") or [],
        "politica_despensa": generation_context.get("pantry_policy") or {},
        "recetas_guardadas_prioritarias": [
            {
                "title": recipe.get("title"),
                "is_favorite": bool(recipe.get("is_favorite")),
                "matched_ingredient_names": (recipe.get("matched_ingredient_names") or [])[:4],
            }
            for recipe in prioritized_saved_recipes
            if recipe.get("title")
        ],
    }


def _build_ollama_weekly_prompt(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
) -> str:
    prompt_context = _ollama_prompt_context(ingredients, generation_context)
    return (
        "Actua como planificador de menus semanales para una app domestica. "
        "Devuelve solo JSON valido, sin markdown ni texto extra. "
        "Genera exactamente 14 platos: comida y cena para lunes a domingo.\n"
        "Reglas criticas:\n"
        "1. Usa como base principal solo ingredientes de `ingredientes_principales_permitidos`.\n"
        "2. En `ingredients` solo puedes usar ingredientes de esa lista o de `despensa_basica_permitida`.\n"
        "3. No uses sinonimos, variantes ni ingredientes externos.\n"
        "4. Prioriza `recetas_guardadas_prioritarias` si encajan y evita `recetas_recientes_a_evitar`.\n"
        "5. La despensa solo apoya; nunca debe definir el plato.\n"
        "6. Los ingredientes de `despensa_basica_apoyo_libre` no cuentan para el limite de despensa si siguen siendo secundarios.\n"
        "7. Respeta `politica_despensa` y evita platos donde la despensa pese mas que la nevera.\n"
        "8. Si faltan ideas, reutiliza tecnicas o combinaciones con los ingredientes permitidos.\n"
        "Salida compacta obligatoria por receta:\n"
        "- `title`: nombre corto y claro.\n"
        "- `ingredients`: 3 a 6 items.\n"
        "- `explanation`: 1 frase corta.\n"
        "No anadas description, steps, tags, tiempos ni raciones.\n"
        f"Contexto: {json.dumps(prompt_context, ensure_ascii=False)}\n"
        "Formato exacto: "
        "{\"items\":[{\"day_index\":0,\"day_name\":\"Lunes\",\"meal_type\":\"comida\",\"explanation\":\"...\","
        "\"recipe\":{\"title\":\"...\",\"ingredients\":[\"...\"]}}]}"
    )


def _build_ollama_weekly_retry_prompt(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
    report: dict[str, Any],
) -> str:
    prompt_context = _ollama_prompt_context(ingredients, generation_context)
    invalid_slots = [
        {
            "slot_index": issue["index"],
            "day_name": legacy_ai.DAYS[issue["index"] // 2],
            "meal_type": legacy_ai.MEAL_TYPES[issue["index"] % 2],
            "invalid_reason": issue["invalid_reason"],
            "invalid_ingredients": issue["invalid_ingredients"],
            "title": issue["title"],
        }
        for issue in (report.get("invalid_items") or [])[: legacy_ai.EXPECTED_WEEKLY_ITEMS]
    ]
    return (
        "La respuesta anterior para el menu semanal no paso validacion. "
        "Genera el menu completo otra vez desde cero y corrige los huecos rechazados. "
        "Devuelve solo JSON valido y exactamente 14 items.\n"
        f"Motivo principal del rechazo: {report.get('invalid_reason') or 'respuesta fuera de contexto'}.\n"
        f"Huecos invalidos: {json.dumps(invalid_slots, ensure_ascii=False)}\n"
        "Reglas criticas:\n"
        "1. Usa solo ingredientes principales de `ingredientes_principales_permitidos`.\n"
        "2. En `ingredients` solo puedes usar ingredientes permitidos o `despensa_basica_permitida`.\n"
        "3. No uses sinonimos, variantes ni ingredientes externos.\n"
        "4. Respeta `politica_despensa`.\n"
        "5. Mantén la salida compacta: solo `title`, `ingredients` y `explanation`.\n"
        f"Contexto: {json.dumps(prompt_context, ensure_ascii=False)}\n"
        "Formato exacto: "
        "{\"items\":[{\"day_index\":0,\"day_name\":\"Lunes\",\"meal_type\":\"comida\",\"explanation\":\"...\","
        "\"recipe\":{\"title\":\"...\",\"ingredients\":[\"...\"]}}]}"
    )


def _build_ollama_replacement_prompt(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
    day_index: int,
    meal_type: str,
) -> str:
    prompt_context = _ollama_prompt_context(ingredients, generation_context)
    return (
        "Propone un unico plato de sustitucion para un menu semanal. "
        "Devuelve solo JSON valido, sin markdown ni texto extra.\n"
        f"Dia: {legacy_ai.DAYS[day_index]}, tipo: {meal_type}.\n"
        "Usa solo ingredientes principales de `ingredientes_principales_permitidos` y, como apoyo, "
        "`despensa_basica_permitida`.\n"
        "No uses sinonimos, variantes ni ingredientes externos. Respeta `politica_despensa`.\n"
        "Salida compacta: solo `title`, `ingredients` y una `explanation` breve.\n"
        f"Contexto: {json.dumps(prompt_context, ensure_ascii=False)}\n"
        "Formato exacto: "
        "{\"explanation\":\"...\",\"recipe\":{\"title\":\"...\",\"ingredients\":[\"...\"]}}"
    )


def _build_ollama_weekly_block_prompt(
    ingredients: list[dict[str, str | None]],
    generation_context: GenerationContext,
    slots: list[dict[str, Any]],
) -> str:
    prompt_context = _ollama_prompt_context(ingredients, generation_context)
    slot_lines = [
        f"{slot['index']} -> {slot['day_name']} {slot['meal_type']}"
        for slot in slots
    ]
    return (
        "Actua como planificador de menus semanales para una app domestica. "
        "Devuelve solo lineas de texto, sin markdown ni comentarios.\n"
        "Genera exactamente un plato por cada hueco pedido.\n"
        "Huecos a completar:\n"
        f"{chr(10).join(slot_lines)}\n"
        "Reglas criticas:\n"
        "1. Usa como base principal solo ingredientes de `ingredientes_principales_permitidos`.\n"
        "2. En `ingredients` solo puedes usar ingredientes de esa lista o de `despensa_basica_permitida`.\n"
        "3. No uses sinonimos, variantes ni ingredientes externos.\n"
        "4. Prioriza `recetas_guardadas_prioritarias` si encajan y evita `recetas_recientes_a_evitar`.\n"
        "5. La despensa solo apoya; nunca debe definir el plato.\n"
        "6. Respeta `politica_despensa` y evita platos donde la despensa pese mas que la nevera.\n"
        "7. Salida compacta: solo indice, title, ingredients y explanation.\n"
        "8. Usa exactamente una linea por hueco con este formato:\n"
        "indice|title|ingrediente 1; ingrediente 2; ingrediente 3|explanation\n"
        "9. Mantén el mismo indice del hueco en cada linea.\n"
        f"Contexto: {json.dumps(prompt_context, ensure_ascii=False)}\n"
        "Formato de ejemplo:\n"
        "0|Pollo con arroz|Pechuga de pollo; Arroz basmati; Tomate cherry|Aprovecha el pollo y el arroz con verduras cercanas a caducar"
    )


def _strengthen_json_prompt(prompt: str) -> str:
    return (
        f"{prompt}\n"
        "Revision final obligatoria: devuelve un unico objeto JSON valido, sin fences, sin comentarios, "
        "sin texto antes o despues del JSON."
    )


def _strengthen_delimited_prompt(prompt: str) -> str:
    return (
        f"{prompt}\n"
        "Revision final obligatoria: devuelve solo lineas con el formato "
        "indice|title|ingrediente 1; ingrediente 2; ingrediente 3|explanation. "
        "No anadas numeraciones, bullets, JSON, markdown ni texto antes o despues."
    )


def _num_predict_for_operation(operation: str) -> int:
    if operation == "replacement":
        return 220
    if operation == "weekly_menu_block":
        return 500
    if operation in {"weekly_menu", "weekly_menu_retry"}:
        return 1200
    return 350


def _num_predict_for_weekly_block(slot_count: int) -> int:
    if slot_count >= 7:
        return 800
    if slot_count >= 4:
        return 600
    if slot_count >= 2:
        return 420
    return 260


def _parse_weekly_block_text(content: str, slots: list[dict[str, Any]]) -> dict[str, Any]:
    slot_order = [int(slot.get("index") or 0) for slot in slots]
    slot_set = set(slot_order)
    parsed_by_index: dict[int, dict[str, Any]] = {}
    ordered_candidates: list[dict[str, Any]] = []

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        line = re.sub(r"^[-*\s]+", "", line)
        parts = [part.strip() for part in line.split("|", 3)]
        if len(parts) != 4:
            continue
        index_match = re.search(r"\\d+", parts[0])
        if not index_match:
            continue
        slot_index = int(index_match.group())
        title = parts[1].strip()
        ingredients_raw = parts[2].strip()
        explanation = parts[3].strip()
        ingredients = [item.strip(" -") for item in ingredients_raw.split(";") if item.strip(" -")]
        if not title or not ingredients:
            continue
        candidate = {
            "explanation": explanation or "Plato ajustado a tus ingredientes disponibles.",
            "recipe": {
                "title": title,
                "ingredients": ingredients,
            },
        }
        ordered_candidates.append(candidate)
        if slot_index in slot_set:
            parsed_by_index[slot_index] = candidate

    items: list[dict[str, Any]] = []
    fallback_iter = iter(ordered_candidates)
    used_fallback_ids: set[int] = set()
    for slot_index in slot_order:
        candidate = parsed_by_index.get(slot_index)
        if candidate is not None:
            items.append(candidate)
            continue
        for ordered_candidate in fallback_iter:
            candidate_id = id(ordered_candidate)
            if candidate_id in used_fallback_ids:
                continue
            used_fallback_ids.add(candidate_id)
            items.append(ordered_candidate)
            break

    return {"items": items}
