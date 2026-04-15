"use client";

import { getRecipeAltText, getRecipeImage, getRecipeImageCaption, getRecipeImageReason, getRecipeImageStatus, type Recipe } from "../../home-shared";

export function RecipeVisualSurface({
  compact = false,
  loading = false,
  recipe,
}: {
  compact?: boolean;
  loading?: boolean;
  recipe: Recipe;
}) {
  const imageUrl = getRecipeImage(recipe);
  const imageReason = getRecipeImageReason(recipe);
  const imageCaption = getRecipeImageCaption(recipe);

  if (imageUrl && !loading) {
    return (
      <img
        alt={getRecipeAltText(recipe)}
        className="h-full w-full object-cover"
        src={imageUrl}
      />
    );
  }

  if (compact) {
    return (
      <div
        aria-label={getRecipeAltText(recipe)}
        className="relative flex h-full w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(111,180,124,0.28),_transparent_52%),linear-gradient(145deg,_rgba(244,248,242,1),_rgba(227,241,230,1))]"
        role="img"
        title={loading ? "Estamos buscando una imagen real para esta receta." : getRecipeImageReason(recipe)}
      >
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0,transparent_45%,rgba(31,37,34,0.04)_45%,rgba(31,37,34,0.04)_55%,transparent_55%,transparent_100%)]" />
        <div className="relative z-10 flex h-full w-full items-center justify-center">
          {loading ? (
            <span aria-hidden="true" className="inline-flex h-10 w-10 animate-spin rounded-full border-2 border-leaf/20 border-t-leaf" />
          ) : (
            <div className="relative h-16 w-16 rounded-full border border-white/75 bg-white/70 shadow-soft">
              <div className="absolute inset-3 rounded-full border border-leaf/30" />
              <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-leaf/35" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label={getRecipeAltText(recipe)}
      className="relative flex h-full w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(111,180,124,0.28),_transparent_52%),linear-gradient(145deg,_rgba(244,248,242,1),_rgba(227,241,230,1))]"
      role="img"
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0,transparent_45%,rgba(31,37,34,0.04)_45%,rgba(31,37,34,0.04)_55%,transparent_55%,transparent_100%)]" />
      <div className={`relative z-10 flex h-full w-full flex-col justify-between ${compact ? "p-4" : "p-6"}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-lg border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold text-leaf shadow-soft">
            {loading ? "Buscando imagen real" : getRecipeImageStatus(recipe)}
          </span>
        </div>
        <div>
          <p className={`${compact ? "line-clamp-3 text-sm" : "text-base"} font-semibold leading-6 text-ink`}>
            {loading ? "Estamos consultando una pagina fuente y validando su imagen." : imageCaption}
          </p>
          <p className={`mt-3 ${compact ? "text-xs" : "text-sm"} leading-5 text-ink/70`}>
            {loading ? "El bloque de imagen se actualizara automaticamente cuando termine la busqueda." : imageReason}
          </p>
        </div>
      </div>
    </div>
  );
}
