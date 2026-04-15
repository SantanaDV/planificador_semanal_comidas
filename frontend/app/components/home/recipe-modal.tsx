"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import {
  buildRecipePayloadFromDraft,
  recipeDifficultyOptions,
  type Recipe,
  type RecipeCreatePayload,
  type RecipeEditForm,
  type RecipeIngredientDraft,
} from "../../home-shared";

export function RecipeModal({
  form,
  loading,
  onCancel,
  onSubmit,
  open,
  setForm,
}: {
  form: RecipeEditForm;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (payload: RecipeCreatePayload) => Promise<Recipe | null>;
  open: boolean;
  setForm: (form: RecipeEditForm) => void;
}) {
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (open) {
      setLocalError("");
    }
  }, [open]);

  if (!open) return null;

  function updateIngredient(index: number, field: keyof RecipeIngredientDraft, value: string) {
    setForm({
      ...form,
      ingredients: form.ingredients.map((ingredient, itemIndex) =>
        itemIndex === index ? { ...ingredient, [field]: value } : ingredient,
      ),
    });
  }

  function updateStep(index: number, value: string) {
    setForm({
      ...form,
      steps: form.steps.map((step, itemIndex) => (itemIndex === index ? value : step)),
    });
  }

  async function submitRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildRecipePayloadFromDraft(form, true);
    if ("error" in payload) {
      setLocalError(payload.error);
      return;
    }
    const created = await onSubmit({ ...payload, source: "manual" });
    if (!created) {
      setLocalError("No se pudo crear la receta.");
    }
  }

  return (
    <div aria-labelledby="recipe-modal-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/35 px-4 py-6" role="dialog">
      <form className="w-full max-w-4xl rounded-lg border border-line bg-white p-6 shadow-[0_24px_80px_rgba(31,37,34,0.24)]" onSubmit={submitRecipe}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-leaf">Recetario</p>
            <h2 className="mt-2 text-2xl font-bold" id="recipe-modal-title">
              Anadir receta
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              Guarda una receta propia para consultarla, editarla y priorizarla si encaja con tu nevera.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm font-semibold">
            <input
              checked={form.isFavorite}
              className="h-4 w-4 accent-tomato"
              onChange={(event) => setForm({ ...form, isFavorite: event.target.checked })}
              type="checkbox"
            />
            Favorita
          </label>
        </div>

        {localError ? <p className="mt-4 rounded-lg border border-tomato/30 bg-tomato/5 px-4 py-3 text-sm text-tomato">{localError}</p> : null}

        <div className="mt-6 grid max-h-[72vh] gap-5 overflow-y-auto pr-1">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <label className="grid gap-2 text-sm font-semibold text-ink/70">
              Nombre
              <input
                className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Ej: Ensalada templada de garbanzos"
                value={form.title}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-ink/70">
              Foto
              <input
                className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
                onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
                placeholder="https://images.unsplash.com/..."
                value={form.imageUrl}
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-semibold text-ink/70">
            Descripcion
            <textarea
              className="min-h-24 rounded-lg border border-line bg-paper px-3 py-3 font-normal leading-6 text-ink"
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Plato rapido, saciante y facil de adaptar con verduras de temporada."
              value={form.description}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold text-ink/70">
              Tiempo estimado
              <input
                className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
                min={5}
                onChange={(event) => setForm({ ...form, prepTimeMinutes: event.target.value })}
                type="number"
                value={form.prepTimeMinutes}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-ink/70">
              Dificultad
              <select
                className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
                onChange={(event) => setForm({ ...form, difficulty: event.target.value })}
                value={form.difficulty}
              >
                {recipeDifficultyOptions.filter((item) => item !== "Todas").map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-ink/70">
              Raciones
              <input
                className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
                min={1}
                onChange={(event) => setForm({ ...form, servings: event.target.value })}
                type="number"
                value={form.servings}
              />
            </label>
          </div>

          <div className="rounded-lg border border-line bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">Ingredientes y cantidades</p>
              <button
                className="rounded-lg border border-leaf bg-white px-3 py-2 text-sm font-semibold text-leaf"
                onClick={() => setForm({ ...form, ingredients: [...form.ingredients, { name: "", quantity: "" }] })}
                type="button"
              >
                Añadir ingrediente
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {form.ingredients.map((ingredient, index) => (
                <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]" key={index}>
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
                  <button
                    className="rounded-lg border border-tomato px-3 py-2 text-sm font-semibold text-tomato"
                    onClick={() => setForm({ ...form, ingredients: form.ingredients.filter((_, itemIndex) => itemIndex !== index) })}
                    type="button"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">Pasos</p>
              <button
                className="rounded-lg border border-leaf bg-white px-3 py-2 text-sm font-semibold text-leaf"
                onClick={() => setForm({ ...form, steps: [...form.steps, ""] })}
                type="button"
              >
                Anadir paso
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {form.steps.map((step, index) => (
                <div className="grid gap-2 md:grid-cols-[40px_1fr_auto]" key={index}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-leaf/10 text-sm font-semibold text-leaf">{index + 1}</span>
                  <textarea
                    className="min-h-20 rounded-lg border border-line bg-white px-3 py-2 text-sm leading-6"
                    onChange={(event) => updateStep(index, event.target.value)}
                    placeholder="Describe este paso"
                    value={step}
                  />
                  <button
                    className="rounded-lg border border-tomato px-3 py-2 text-sm font-semibold text-tomato md:self-start"
                    onClick={() => setForm({ ...form, steps: form.steps.filter((_, itemIndex) => itemIndex !== index) })}
                    type="button"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-sm font-semibold text-ink/70">
            Etiquetas
            <input
              className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
              onChange={(event) => setForm({ ...form, tagsText: event.target.value })}
              placeholder="rapida, legumbres, aprovechamiento"
              value={form.tagsText}
            />
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            className="rounded-lg border border-line px-4 py-3 font-semibold text-ink/70 hover:border-tomato hover:text-tomato"
            disabled={loading}
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
          <button className="rounded-lg bg-leaf px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
            {loading ? "Guardando..." : "Anadir receta"}
          </button>
        </div>
      </form>
    </div>
  );
}
