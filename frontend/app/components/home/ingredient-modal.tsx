"use client";

import type { FormEvent } from "react";

import { type IngredientCategory, type IngredientForm } from "../../home-shared";

export function IngredientModal({
  categories,
  form,
  loading,
  onCancel,
  onSubmit,
  open,
  setForm,
}: {
  categories: IngredientCategory[];
  form: IngredientForm;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  open: boolean;
  setForm: (form: IngredientForm) => void;
}) {
  if (!open) return null;

  return (
    <div aria-labelledby="ingredient-modal-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-ink/35 px-4 py-6" role="dialog">
      <form className="w-full max-w-xl rounded-lg border border-line bg-white p-6 shadow-[0_24px_80px_rgba(31,37,34,0.24)]" onSubmit={onSubmit}>
        <p className="text-sm font-semibold uppercase text-leaf">Nevera</p>
        <h2 className="mt-2 text-2xl font-bold" id="ingredient-modal-title">
          Añadir ingrediente
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          Registra alimentos reales para que el menu semanal pueda priorizar disponibilidad y caducidad.
        </p>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-ink/70">
            Nombre
            <input
              className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ej: Tomate"
              required
              value={form.name}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-ink/70">
            Categoria
            <select
              className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
              disabled={!categories.length}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
              required
              value={form.categoryId}
            >
              <option value="">Selecciona categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-ink/70">
              Cantidad
              <input
                className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
                onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                placeholder="Ej: 500 g"
                value={form.quantity}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-ink/70">
              Fecha de caducidad
              <input
                className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
                onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
                type="date"
                value={form.expiresAt}
              />
            </label>
          </div>
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
          <button className="rounded-lg bg-leaf px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={loading || !categories.length} type="submit">
            {loading ? "Guardando..." : "Anadir"}
          </button>
        </div>
      </form>
    </div>
  );
}
