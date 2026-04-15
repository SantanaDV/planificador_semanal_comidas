"use client";

import { MIN_INGREDIENTS_FOR_MENU, type GenerationGuard } from "../../home-shared";

export function GenerationGuardModal({
  guard,
  ingredientCount,
  loading,
  onAddDemoIngredients,
  onCancel,
  onContinueFallback,
  onGoToIngredients,
  onGoToPreferences,
  usableIngredientCount,
}: {
  guard: GenerationGuard;
  ingredientCount: number;
  loading: boolean;
  onAddDemoIngredients: () => void;
  onCancel: () => void;
  onContinueFallback: () => void;
  onGoToIngredients: () => void;
  onGoToPreferences: () => void;
  usableIngredientCount: number;
}) {
  if (!guard) return null;

  const content =
    guard === "empty"
      ? {
          title: "Necesitas ingredientes para generar el menu",
          description:
            "No has introducido ingredientes todavia. Anade ingredientes a tu nevera o carga una base de prueba guardada en la base de datos.",
        }
      : guard === "insufficient"
        ? {
            title: "Hay pocos ingredientes en la nevera",
            description: `Tienes ${ingredientCount} ingrediente${ingredientCount === 1 ? "" : "s"}. Para generar un menu semanal util necesitas al menos ${MIN_INGREDIENTS_FOR_MENU}.`,
          }
        : guard === "excluded_insufficient"
          ? {
              title: "Exclusiones demasiado restrictivas",
              description: `Tras aplicar tus exclusiones quedan ${usableIngredientCount} ingredientes disponibles. Reduce exclusiones o anade mas ingredientes antes de generar el menu semanal.`,
            }
          : {
              title: "Se usara modo demo",
              description:
                "No hay una clave de Gemini configurada. La app puede continuar con un fallback local para que puedas probar el flujo completo sin depender de una clave externa.",
            };

  return (
    <div aria-labelledby="generation-guard-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-ink/35 px-4 py-6" role="dialog">
      <div className="w-full max-w-lg rounded-lg border border-line bg-white p-6 shadow-[0_24px_80px_rgba(31,37,34,0.24)]">
        <p className="text-sm font-semibold uppercase text-leaf">Antes de generar</p>
        <h2 className="mt-2 text-2xl font-bold" id="generation-guard-title">
          {content.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-ink/70">{content.description}</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          {guard === "fallback" ? (
            <button
              className="rounded-lg bg-leaf px-4 py-3 font-semibold text-white disabled:opacity-60"
              disabled={loading}
              onClick={onContinueFallback}
              type="button"
            >
              Continuar con modo demo
            </button>
          ) : (
            <>
              {guard === "excluded_insufficient" ? (
                <button
                  className="rounded-lg border border-line px-4 py-3 font-semibold text-ink/70 hover:border-leaf hover:text-leaf"
                  disabled={loading}
                  onClick={onGoToPreferences}
                  type="button"
                >
                  Revisar preferencias
                </button>
              ) : null}
              <button
                className="rounded-lg border border-line px-4 py-3 font-semibold text-ink/70 hover:border-leaf hover:text-leaf"
                disabled={loading}
                onClick={onGoToIngredients}
                type="button"
              >
                Ir a ingredientes
              </button>
              <button
                className="rounded-lg bg-leaf px-4 py-3 font-semibold text-white disabled:opacity-60"
                disabled={loading}
                onClick={onAddDemoIngredients}
                type="button"
              >
                Añadir ingredientes de prueba
              </button>
            </>
          )}
          <button
            className="rounded-lg border border-line px-4 py-3 font-semibold text-ink/70 hover:border-tomato hover:text-tomato"
            disabled={loading}
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
