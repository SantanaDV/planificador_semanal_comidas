"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import {
  buildRecipeEditForm,
  buildRecipePayloadFromDraft,
  canAutoResolveRecipeImage,
  formatRetryCountdown,
  getRecipeAltText,
  getRecipeDifficulty,
  getRecipeImage,
  getRecipeImageCaption,
  getRecipeImageReason,
  getRecipeImageSourceUrl,
  getRecipeImageStatus,
  getRecipeServings,
  getRecipeSourceLabel,
  getRecipeTip,
  getRetryAfterSeconds,
  parseIngredientLine,
  recipeDifficultyOptions,
  type Recipe,
  type RecipeImageCandidate,
  type RecipeEditForm,
  type RecipeIngredientDraft,
  type RecipeUpdatePayload,
} from "../../home-shared";
import { RecipeVisualSurface } from "./recipe-visual-surface";

export function RecipeDetailView({
  imageResolutionEnabled,
  imageResolutionPending,
  loading,
  onBack,
  onResolveRecipeImage,
  onUpdateRecipe,
  onUseInMenu,
  recipe,
}: {
  imageResolutionEnabled: boolean;
  imageResolutionPending: boolean;
  loading: boolean;
  onBack: () => void;
  onResolveRecipeImage: (recipeId: string, force?: boolean) => Promise<Recipe | null>;
  onUpdateRecipe: (recipeId: string, payload: RecipeUpdatePayload) => Promise<Recipe | null>;
  onUseInMenu: (recipe: Recipe) => void;
  recipe: Recipe | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [localError, setLocalError] = useState("");
  const [autoResolveRequestedFor, setAutoResolveRequestedFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeEditForm | null>(() => (recipe ? buildRecipeEditForm(recipe) : null));
  const [imageStatusNow, setImageStatusNow] = useState(() => Date.now());
  const [previewCandidateIndex, setPreviewCandidateIndex] = useState<number | null>(null);

  useEffect(() => {
    setIsEditing(false);
    setLocalError("");
    setAutoResolveRequestedFor(null);
    setPreviewCandidateIndex(null);
  }, [recipe?.id]);

  useEffect(() => {
    setDraft(recipe ? buildRecipeEditForm(recipe) : null);
    setPreviewCandidateIndex((current) => {
      if (!recipe) return null;
      const candidates = recipe.image_candidates ?? [];
      if (!candidates.length) return null;
      if (current !== null && current >= 0 && current < candidates.length) return current;
      if (
        typeof recipe.image_candidate_index === "number" &&
        recipe.image_candidate_index >= 0 &&
        recipe.image_candidate_index < candidates.length
      ) {
        return recipe.image_candidate_index;
      }
      return 0;
    });
  }, [recipe]);

  useEffect(() => {
    if (!recipe || !imageResolutionEnabled || imageResolutionPending) return;
    if (autoResolveRequestedFor === recipe.id) return;
    if (!canAutoResolveRecipeImage(recipe)) return;
    setAutoResolveRequestedFor(recipe.id);
    void onResolveRecipeImage(recipe.id);
  }, [imageResolutionEnabled, autoResolveRequestedFor, imageResolutionPending, onResolveRecipeImage, recipe]);

  const imageRetryCountdown =
    !imageResolutionPending && recipe?.image_lookup_status === "upstream_error"
      ? getRetryAfterSeconds(recipe.image_lookup_retry_after, imageStatusNow)
      : null;

  useEffect(() => {
    if (!imageRetryCountdown) return;
    const timer = window.setInterval(() => {
      setImageStatusNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [imageRetryCountdown]);

  if (!recipe || !draft) {
    return (
      <section className="rounded-lg border border-dashed border-line bg-white p-8 text-ink/75 shadow-soft">
        <button className="mb-4 text-sm font-semibold text-leaf hover:text-ink" onClick={onBack} type="button">
          Volver a recetas
        </button>
        No se ha seleccionado ninguna receta.
      </section>
    );
  }

  const difficulty = getRecipeDifficulty(recipe.prep_time_minutes, recipe.difficulty);
  const servings = getRecipeServings(recipe);
  const ingredientRows = recipe.ingredients.length ? recipe.ingredients.map(parseIngredientLine) : [];
  const candidates = recipe.image_candidates ?? [];
  const hasImageCandidates = candidates.length > 0;
  const persistedCandidateIndex =
    typeof recipe.image_candidate_index === "number" && recipe.image_candidate_index >= 0 && recipe.image_candidate_index < candidates.length
      ? recipe.image_candidate_index
      : null;
  const effectivePreviewCandidateIndex =
    previewCandidateIndex !== null && previewCandidateIndex >= 0 && previewCandidateIndex < candidates.length
      ? previewCandidateIndex
      : null;
  const previewCandidate: RecipeImageCandidate | null =
    effectivePreviewCandidateIndex !== null ? candidates[effectivePreviewCandidateIndex] : null;
  const previewRecipe: Recipe =
    previewCandidate && !imageResolutionPending
      ? {
          ...recipe,
          image_url: previewCandidate.image_url,
          image_source_url: previewCandidate.image_source_url,
          image_alt_text: previewCandidate.image_alt_text ?? `Imagen de ${recipe.title}.`,
        }
      : recipe;
  const canResolveImage = imageResolutionEnabled && !isEditing && !hasImageCandidates && Boolean(recipe.image_can_retry);
  const imageRetryLabel = imageRetryCountdown ? formatRetryCountdown(imageRetryCountdown) : null;
  const imageActionLabel =
    imageRetryLabel
      ? `Reintentar en ${imageRetryLabel}`
      : recipe.image_lookup_status === "pending" || recipe.image_lookup_status === null || recipe.image_lookup_status === undefined
        ? "Buscar imagen"
        : "Reintentar imagen";
  const detailImageStatus = imageResolutionPending
    ? "Buscando imagen real"
    : previewCandidate
      ? persistedCandidateIndex === effectivePreviewCandidateIndex && getRecipeImage(recipe)
        ? "Imagen seleccionada"
        : "Vista previa de alternativa"
      : getRecipeImageStatus(recipe);
  const detailImageCaption = imageResolutionPending
    ? "Estamos buscando paginas relevantes para esta receta y validando sus imagenes."
    : previewCandidate
      ? recipe.description || `Vista previa de una alternativa de imagen para ${recipe.title}.`
      : getRecipeImageCaption(recipe);
  const detailImageAltText = imageResolutionPending
    ? "Buscando una imagen real para esta receta."
    : previewCandidate
      ? previewCandidate.image_alt_text?.trim() || `Imagen de ${recipe.title}.`
      : getRecipeAltText(recipe);
  const detailImageReason = imageResolutionPending
    ? "Consultando paginas externas por HTTP y validando que la imagen sea real y reutilizable."
    : previewCandidate && effectivePreviewCandidateIndex !== null
      ? persistedCandidateIndex === effectivePreviewCandidateIndex && getRecipeImage(recipe)
        ? `Esta es la imagen actualmente seleccionada para la receta (${effectivePreviewCandidateIndex + 1} de ${candidates.length}).`
        : `Estas previsualizando la alternativa ${effectivePreviewCandidateIndex + 1} de ${candidates.length}. Puedes seleccionarla o seguir navegando.`
    : imageRetryLabel && recipe.image_lookup_status === "upstream_error"
      ? `La resolucion de imagen encontro un error temporal. Conviene esperar ${imageRetryLabel} antes de reintentar.`
      : getRecipeImageReason(recipe);
  const detailImageSourceUrl = imageResolutionPending ? null : previewCandidate?.image_source_url || getRecipeImageSourceUrl(recipe);
  const imageCandidateSummary =
    hasImageCandidates && effectivePreviewCandidateIndex !== null
      ? `Alternativa ${effectivePreviewCandidateIndex + 1} de ${candidates.length}`
      : null;
  const canDiscardImage = imageResolutionEnabled && !isEditing && (hasImageCandidates || Boolean(getRecipeImage(recipe)));
  const canGoToPreviousCandidate = hasImageCandidates && effectivePreviewCandidateIndex !== null && effectivePreviewCandidateIndex > 0;
  const canGoToNextCandidate =
    hasImageCandidates && effectivePreviewCandidateIndex !== null && effectivePreviewCandidateIndex < candidates.length - 1;
  const canPersistPreviewCandidate =
    hasImageCandidates &&
    effectivePreviewCandidateIndex !== null &&
    (persistedCandidateIndex !== effectivePreviewCandidateIndex || !getRecipeImage(recipe));
  const discardImageLabel = getRecipeImage(recipe) ? "Quitar foto" : "Dejar sin foto";

  function updateIngredient(index: number, field: keyof RecipeIngredientDraft, value: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            ingredients: current.ingredients.map((ingredient, itemIndex) =>
              itemIndex === index ? { ...ingredient, [field]: value } : ingredient,
            ),
          }
        : current,
    );
  }

  function removeIngredient(index: number) {
    setDraft((current) =>
      current
        ? {
            ...current,
            ingredients: current.ingredients.filter((_, itemIndex) => itemIndex !== index),
          }
        : current,
    );
  }

  function updateStep(index: number, value: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            steps: current.steps.map((step, itemIndex) => (itemIndex === index ? value : step)),
          }
        : current,
    );
  }

  function removeStep(index: number) {
    setDraft((current) =>
      current
        ? {
            ...current,
            steps: current.steps.filter((_, itemIndex) => itemIndex !== index),
          }
        : current,
    );
  }

  async function saveRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipe) return;
    if (!draft) return;
    const payload = buildRecipePayloadFromDraft(draft);
    if ("error" in payload) {
      setLocalError(payload.error);
      return;
    }

    const updated = await onUpdateRecipe(recipe.id, payload);
    if (!updated) {
      setLocalError("No se pudo guardar la receta.");
      return;
    }
    setLocalError("");
    setIsEditing(false);
    setDraft(buildRecipeEditForm(updated));
  }

  async function toggleDetailFavorite() {
    if (!recipe) return;
    if (isEditing) {
      setDraft((current) => (current ? { ...current, isFavorite: !current.isFavorite } : current));
      return;
    }
    const updated = await onUpdateRecipe(recipe.id, { is_favorite: !recipe.is_favorite });
    if (updated) {
      setDraft(buildRecipeEditForm(updated));
    }
  }

  async function selectPreviewCandidate() {
    if (!recipe || effectivePreviewCandidateIndex === null) return;
    const updated = await onUpdateRecipe(recipe.id, {
      image_candidate_index: effectivePreviewCandidateIndex,
    });
    if (updated) {
      setDraft(buildRecipeEditForm(updated));
      setPreviewCandidateIndex(
        typeof updated.image_candidate_index === "number" ? updated.image_candidate_index : effectivePreviewCandidateIndex,
      );
    }
  }

  async function discardRecipeImage() {
    if (!recipe) return;
    const updated = await onUpdateRecipe(recipe.id, { image_candidate_index: null });
    if (updated) {
      setDraft(buildRecipeEditForm(updated));
    }
  }

  return (
    <form className="space-y-6" onSubmit={saveRecipe}>
      <button className="text-sm font-semibold text-leaf hover:text-ink" onClick={onBack} type="button">
        Volver a recetas
      </button>

      <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <div className="grid gap-6 xl:grid-cols-[1fr_auto] xl:items-start">
          <div>
            <p className="text-sm font-semibold uppercase text-leaf">Detalle de receta</p>
            {isEditing ? (
              <div className="mt-3 grid gap-3">
                <label className="grid gap-2 text-sm font-semibold text-ink/70">
                  Nombre
                  <input
                    className="rounded-lg border border-line bg-paper px-4 py-3 text-2xl font-bold text-ink"
                    onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                    value={draft.title}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-ink/70">
                  Descripcion
                  <textarea
                    className="min-h-24 rounded-lg border border-line bg-paper px-4 py-3 text-sm font-normal leading-6 text-ink"
                    onChange={(event) => setDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                    value={draft.description}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-ink/70">
                  Foto
                  <input
                    className="rounded-lg border border-line bg-paper px-4 py-3 text-sm font-normal text-ink"
                    onChange={(event) => setDraft((current) => (current ? { ...current, imageUrl: event.target.value } : current))}
                    placeholder="https://images.unsplash.com/..."
                    value={draft.imageUrl}
                  />
                </label>
              </div>
            ) : (
              <>
                <h2 className="mt-2 text-3xl font-bold leading-tight">{recipe.title}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/70">{recipe.description}</p>
              </>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:max-w-2xl">
              <label className="rounded-lg border border-line bg-paper px-4 py-3">
                <span className="block text-xs font-semibold uppercase text-ink/55">Tiempo</span>
                {isEditing ? (
                  <input
                    className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 font-semibold"
                    min={5}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, prepTimeMinutes: event.target.value } : current))
                    }
                    type="number"
                    value={draft.prepTimeMinutes}
                  />
                ) : (
                  <span className="mt-2 block font-semibold">{recipe.prep_time_minutes} min</span>
                )}
              </label>
              <label className="rounded-lg border border-line bg-paper px-4 py-3">
                <span className="block text-xs font-semibold uppercase text-ink/55">Dificultad</span>
                {isEditing ? (
                  <select
                    className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 font-semibold"
                    onChange={(event) => setDraft((current) => (current ? { ...current, difficulty: event.target.value } : current))}
                    value={draft.difficulty}
                  >
                    {recipeDifficultyOptions.filter((item) => item !== "Todas").map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="mt-2 block font-semibold">{difficulty}</span>
                )}
              </label>
              <label className="rounded-lg border border-line bg-paper px-4 py-3">
                <span className="block text-xs font-semibold uppercase text-ink/55">Raciones</span>
                {isEditing ? (
                  <input
                    className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 font-semibold"
                    min={1}
                    onChange={(event) => setDraft((current) => (current ? { ...current, servings: event.target.value } : current))}
                    type="number"
                    value={draft.servings}
                  />
                ) : (
                  <span className="mt-2 block font-semibold">{servings} personas</span>
                )}
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 xl:justify-end">
            <span className="inline-flex items-center rounded-lg border border-leaf/30 bg-leaf/10 px-4 py-3 text-sm font-semibold text-leaf">
              {getRecipeSourceLabel(recipe)}
            </span>
            <span className="inline-flex items-center rounded-lg border border-line bg-white px-4 py-3 text-sm font-semibold text-tomato">
              {recipe.is_favorite ? "Favorita" : "Guardada"}
            </span>
            <button
              className="rounded-lg border border-tomato/40 bg-white px-5 py-3 font-semibold text-tomato disabled:opacity-60"
              disabled={loading}
              onClick={toggleDetailFavorite}
              type="button"
            >
              {draft.isFavorite ? "Quitar favorito" : "Marcar favorita"}
            </button>
            <button
              className="rounded-lg bg-leaf px-5 py-3 font-semibold text-white disabled:opacity-60"
              disabled={loading}
              onClick={() => onUseInMenu(recipe)}
              type="button"
            >
              Usar en menu
            </button>
            {isEditing ? (
              <>
                <button
                  className="rounded-lg border border-line px-5 py-3 font-semibold text-ink/70"
                  onClick={() => {
                    setIsEditing(false);
                    setLocalError("");
                    setDraft(buildRecipeEditForm(recipe));
                  }}
                  type="button"
                >
                  Cancelar
                </button>
                <button className="rounded-lg border border-leaf bg-white px-5 py-3 font-semibold text-leaf disabled:opacity-60" disabled={loading} type="submit">
                  Guardar cambios
                </button>
              </>
            ) : (
              <button
                className="rounded-lg border border-leaf bg-white px-5 py-3 font-semibold text-leaf"
                onClick={() => setIsEditing(true)}
                type="button"
              >
                Editar receta
              </button>
            )}
          </div>
        </div>

        {localError ? <p className="mt-4 rounded-lg border border-tomato/30 bg-tomato/5 px-4 py-3 text-sm text-tomato">{localError}</p> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-5">
          <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
            <div className="h-80 w-full">
              <RecipeVisualSurface loading={imageResolutionPending} recipe={previewRecipe} />
            </div>
          </div>

          <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">Etiquetas</h3>
              {isEditing ? <span className="text-xs font-semibold uppercase text-leaf">Editable</span> : null}
            </div>
            {isEditing ? (
              <label className="mt-4 grid gap-2 text-sm font-semibold text-ink/70">
                Separadas por coma
                <input
                  className="rounded-lg border border-line bg-paper px-4 py-3 font-normal text-ink"
                  onChange={(event) => setDraft((current) => (current ? { ...current, tagsText: event.target.value } : current))}
                  value={draft.tagsText}
                />
              </label>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {recipe.tags.length ? (
                  recipe.tags.map((tag) => (
                    <span className="rounded-lg border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink/70" key={tag}>
                      {tag}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-ink/70">Sin etiquetas.</p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">Imagen de la receta</h3>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs font-semibold uppercase text-ink/55">{detailImageStatus}</span>
                {imageCandidateSummary ? (
                  <span className="text-xs font-semibold uppercase text-ink/45">{imageCandidateSummary}</span>
                ) : null}
                {hasImageCandidates ? (
                  <>
                    <button
                      className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink/70 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={imageResolutionPending || loading || !canGoToPreviousCandidate}
                      onClick={() => setPreviewCandidateIndex((current) => (current === null ? 0 : Math.max(current - 1, 0)))}
                      type="button"
                    >
                      Anterior
                    </button>
                    <button
                      className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink/70 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={imageResolutionPending || loading || !canGoToNextCandidate}
                      onClick={() =>
                        setPreviewCandidateIndex((current) => {
                          if (current === null) return 0;
                          return Math.min(current + 1, candidates.length - 1);
                        })
                      }
                      type="button"
                    >
                      Siguiente
                    </button>
                    <button
                      className="rounded-lg border border-leaf px-3 py-2 text-xs font-semibold text-leaf disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={imageResolutionPending || loading || !canPersistPreviewCandidate}
                      onClick={() => void selectPreviewCandidate()}
                      type="button"
                    >
                      {persistedCandidateIndex === effectivePreviewCandidateIndex && getRecipeImage(recipe) ? "Imagen activa" : "Usar esta imagen"}
                    </button>
                  </>
                ) : null}
                {canResolveImage ? (
                  <button
                    className="rounded-lg border border-leaf px-3 py-2 text-xs font-semibold text-leaf disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={imageResolutionPending || loading || Boolean(imageRetryLabel) || !recipe.image_can_retry}
                    onClick={() => void onResolveRecipeImage(recipe.id, true)}
                    type="button"
                  >
                    {imageResolutionPending ? "Buscando..." : imageActionLabel}
                  </button>
                ) : null}
                {canDiscardImage ? (
                  <button
                    className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink/70 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={imageResolutionPending || loading}
                    onClick={() => void discardRecipeImage()}
                    type="button"
                  >
                    {discardImageLabel}
                  </button>
                ) : null}
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-ink/75">{detailImageCaption}</p>
            {hasImageCandidates ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {candidates.map((candidate, index) => {
                  const isPreviewActive = effectivePreviewCandidateIndex === index;
                  const isPersisted = persistedCandidateIndex === index && Boolean(getRecipeImage(recipe));
                  return (
                    <button
                      className={`relative h-14 w-14 overflow-hidden rounded-lg border ${isPreviewActive ? "border-leaf shadow-soft" : "border-line opacity-85 hover:opacity-100"} ${isPersisted ? "ring-2 ring-leaf/35" : ""}`}
                      key={`${candidate.image_url}-${index}`}
                      onClick={() => setPreviewCandidateIndex(index)}
                      title={`Alternativa ${index + 1}`}
                      type="button"
                    >
                      <img
                        alt={candidate.image_alt_text?.trim() || `Alternativa ${index + 1} de ${recipe.title}`}
                        className="h-full w-full object-cover"
                        src={candidate.image_url}
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}
            <p className="mt-3 text-xs font-semibold uppercase text-ink/55">Texto alternativo</p>
            <p className="mt-1 text-sm leading-6 text-ink/70">{detailImageAltText}</p>
            {detailImageSourceUrl ? (
              <>
                <p className="mt-3 text-xs font-semibold uppercase text-ink/55">Fuente</p>
                <a
                  className="mt-1 inline-flex text-sm font-semibold text-leaf hover:text-ink"
                  href={detailImageSourceUrl || "#"}
                  rel="noreferrer"
                  target="_blank"
                >
                  Abrir pagina fuente
                </a>
              </>
            ) : null}
            <p className="mt-3 text-xs font-semibold uppercase text-ink/55">Estado</p>
            <p className="mt-1 text-sm leading-6 text-ink/70">{detailImageReason}</p>
          </div>

          <div className="rounded-lg border border-leaf/20 bg-leaf/5 p-5">
            <p className="font-semibold">Consejo del chef</p>
            <p className="mt-2 text-sm leading-6 text-ink/75">{getRecipeTip(recipe)}</p>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase text-leaf">Bloque editable</p>
              <h3 className="text-2xl font-semibold">Ingredientes</h3>
            </div>
            {isEditing ? (
              <button
                className="rounded-lg border border-leaf px-3 py-2 text-sm font-semibold text-leaf"
                onClick={() => setDraft((current) => (current ? { ...current, ingredients: [...current.ingredients, { name: "", quantity: "" }] } : current))}
                type="button"
              >
                Añadir ingrediente
              </button>
            ) : null}
          </div>

          {isEditing ? (
            <div className="mt-5 grid gap-3">
              {draft.ingredients.map((ingredient, index) => (
                <div className="grid gap-2 rounded-lg border border-line bg-paper p-3 md:grid-cols-[1fr_160px_auto]" key={index}>
                  <input
                    className="rounded-lg border border-line bg-white px-3 py-2"
                    onChange={(event) => updateIngredient(index, "name", event.target.value)}
                    placeholder="Ingrediente"
                    value={ingredient.name}
                  />
                  <input
                    className="rounded-lg border border-line bg-white px-3 py-2"
                    onChange={(event) => updateIngredient(index, "quantity", event.target.value)}
                    placeholder="Cantidad"
                    value={ingredient.quantity}
                  />
                  <button className="rounded-lg border border-tomato px-3 py-2 text-sm font-semibold text-tomato" onClick={() => removeIngredient(index)} type="button">
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 divide-y divide-line">
              {ingredientRows.length ? (
                ingredientRows.map((ingredient, index) => (
                  <div className="grid gap-3 py-4 sm:grid-cols-[1fr_auto]" key={`${ingredient.name}-${index}`}>
                    <p className="font-semibold">{ingredient.name}</p>
                    <p className="text-sm font-semibold text-ink/60">{ingredient.quantity || "Al gusto"}</p>
                  </div>
                ))
              ) : (
                <p className="py-4 text-sm text-ink/70">Sin ingredientes registrados.</p>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase text-leaf">Preparacion</p>
            <h3 className="text-2xl font-semibold">Pasos de la receta</h3>
          </div>
          {isEditing ? (
            <button
              className="rounded-lg border border-leaf px-3 py-2 text-sm font-semibold text-leaf"
              onClick={() => setDraft((current) => (current ? { ...current, steps: [...current.steps, ""] } : current))}
              type="button"
            >
              Anadir paso
            </button>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4">
          {isEditing ? (
            draft.steps.map((step, index) => (
              <div className="grid gap-3 rounded-lg border border-line bg-paper p-4 md:grid-cols-[42px_1fr_auto]" key={index}>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-leaf/10 text-sm font-semibold text-leaf">{index + 1}</span>
                <textarea
                  className="min-h-24 rounded-lg border border-line bg-white px-4 py-3 text-sm leading-6"
                  onChange={(event) => updateStep(index, event.target.value)}
                  placeholder="Describe este paso"
                  value={step}
                />
                <button className="rounded-lg border border-tomato px-3 py-2 text-sm font-semibold text-tomato md:self-start" onClick={() => removeStep(index)} type="button">
                  Quitar
                </button>
              </div>
            ))
          ) : recipe.steps.length ? (
            recipe.steps.map((step, index) => (
              <article className="grid gap-4 rounded-lg border border-line bg-paper p-4 md:grid-cols-[42px_1fr]" key={`${step}-${index}`}>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-leaf/10 text-sm font-semibold text-leaf">{index + 1}</span>
                <p className="text-sm leading-7 text-ink/80">{step}</p>
              </article>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-line bg-paper p-5 text-sm text-ink/70">Sin pasos registrados.</p>
          )}
        </div>
      </section>
    </form>
  );
}
