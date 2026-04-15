"use client";

import { type MenuGenerationFeedback } from "../../home-shared";

export function MenuGenerationBanner({ feedback }: { feedback: MenuGenerationFeedback }) {
  if (feedback.phase === "idle") return null;

  const tone =
    feedback.phase === "loading"
      ? "border-leaf/25 bg-white"
      : feedback.phase === "success"
        ? "border-leaf/30 bg-mint/30"
        : feedback.phase === "rate_limited"
          ? "border-yolk/40 bg-yolk/10"
          : "border-tomato/30 bg-tomato/5";

  const title =
    feedback.phase === "loading"
      ? "Generando menu semanal..."
      : feedback.phase === "success"
        ? "Menu semanal actualizado"
        : feedback.phase === "rate_limited"
          ? feedback.cooldownSeconds && feedback.cooldownSeconds > 0
            ? `Gemini esta saturado. Reintento disponible en ${feedback.cooldownSeconds}s`
            : "Gemini sigue saturado temporalmente"
          : "No se pudo generar el menu semanal";

  const indicator =
    feedback.phase === "loading" ? (
      <span aria-hidden="true" className="mt-1 inline-flex h-4 w-4 animate-spin rounded-full border-2 border-leaf/25 border-t-leaf" />
    ) : (
      <span
        aria-hidden="true"
        className={`mt-1 inline-flex h-4 w-4 rounded-full ${feedback.phase === "success" ? "bg-leaf" : feedback.phase === "rate_limited" ? "bg-yolk" : "bg-tomato"}`}
      />
    );

  return (
    <div aria-live="polite" className={`mb-6 rounded-lg border p-4 shadow-soft ${tone}`}>
      <div className="flex items-start gap-3">
        {indicator}
        <div className="min-w-0">
          <p className="font-semibold text-ink">{title}</p>
          <p className="mt-1 text-sm leading-6 text-ink/75">{feedback.message}</p>
          {feedback.phase === "loading" ? (
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-leaf">Esperando respuesta del modelo y validando el menu</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
