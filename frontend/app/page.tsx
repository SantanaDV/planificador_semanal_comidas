"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Ingredient = {
  id: string;
  name: string;
  quantity?: string | null;
  category_id?: string | null;
  category?: string | null;
  expires_at?: string | null;
};

type IngredientCategory = {
  id: string;
  name: string;
  sort_order: number;
};

type Recipe = {
  id: string;
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
  prep_time_minutes: number;
  difficulty?: string | null;
  servings?: number | null;
  image_url?: string | null;
  image_source_url?: string | null;
  image_alt_text?: string | null;
  image_lookup_status?: "found" | "not_found" | "invalid" | "rate_limited" | "upstream_error" | null;
  image_lookup_reason?: string | null;
  image_lookup_attempted_at?: string | null;
  image_lookup_retry_after?: string | null;
  source: string;
  is_favorite: boolean;
};

type MenuItem = {
  id: string;
  day_index: number;
  day_name: string;
  meal_type: string;
  explanation: string;
  recipe: Recipe | null;
};

type WeeklyMenu = {
  id: string;
  week_start_date: string;
  ai_model: string;
  notes: string;
  generated_from_ingredients: string[];
  items: MenuItem[];
};

type AiStatus = {
  provider: string;
  model: string;
  configured: boolean;
  mode: "ai" | "fallback";
  message: string;
};

type ViewId = "dashboard" | "menu" | "ingredients" | "recipes" | "recipeDetail" | "preferences";
type LogLevel = "info" | "warning" | "error";
type GenerationGuard = "empty" | "insufficient" | "excluded_insufficient" | "fallback" | null;
type IngredientSort = "expiry_asc" | "expiry_desc" | "quantity_asc" | "quantity_desc";
type MenuGenerationPhase = "idle" | "loading" | "success" | "error" | "rate_limited";

type PreferenceSettings = {
  dietType: string;
  restrictions: string[];
  excludedIngredientIds: string[];
  goals: string[];
  varietyLevel: string;
};

type RecipeIngredientDraft = {
  name: string;
  quantity: string;
};

type RecipeEditForm = {
  title: string;
  description: string;
  imageUrl: string;
  prepTimeMinutes: string;
  difficulty: string;
  servings: string;
  ingredients: RecipeIngredientDraft[];
  steps: string[];
  tagsText: string;
  isFavorite: boolean;
};

type RecipeMutationPayload = {
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
  prep_time_minutes: number;
  difficulty: string;
  servings: number;
  image_url: string | null;
  image_source_url?: string | null;
  image_alt_text?: string | null;
  image_lookup_status?: "found" | "not_found" | "invalid" | "rate_limited" | "upstream_error" | null;
  image_lookup_reason?: string | null;
  is_favorite: boolean;
};

type RecipeUpdatePayload = Partial<RecipeMutationPayload>;

type RecipeCreatePayload = RecipeMutationPayload & {
  source: "manual";
};

type IngredientForm = {
  name: string;
  quantity: string;
  categoryId: string;
  expiresAt: string;
};

type MenuGenerationFeedback = {
  phase: MenuGenerationPhase;
  message: string;
  cooldownSeconds: number | null;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const MIN_INGREDIENTS_FOR_MENU = 5;
const PREFERENCES_STORAGE_KEY = "menuplan-preference-settings";
const dietOptions = [
  { name: "Equilibrada", description: "Variedad de todos los grupos alimenticios" },
  { name: "Baja en carbohidratos", description: "Reduce harinas y azucares" },
  { name: "Alta en proteinas", description: "Enfocada en carnes, pescados y legumbres" },
  { name: "Mediterranea", description: "Basada en vegetales, pescado y aceite de oliva" },
];
const restrictionOptions = ["Vegetariano", "Vegano", "Sin gluten", "Sin lactosa", "Sin frutos secos"];
const goalOptions = [
  "Ahorro de tiempo en cocina",
  "Optimizar ingredientes disponibles",
  "Descubrir recetas nuevas",
  "Alimentacion saludable",
  "Control de calorias",
];
const varietyOptions = [
  { name: "Baja", description: "Pueden repetirse platos similares" },
  { name: "Media", description: "Equilibrio entre variedad y practicidad" },
  { name: "Alta", description: "Platos completamente diferentes cada dia" },
];
const recipeDifficultyOptions = ["Todas", "Facil", "Media", "Elaborada"];
const recipeTimeOptions = ["Todos", "Hasta 30 min", "31-45 min", "+45 min"];
const ingredientSortOptions: { value: IngredientSort; label: string }[] = [
  { value: "expiry_asc", label: "Caducidad cercana" },
  { value: "expiry_desc", label: "Caducidad lejana" },
  { value: "quantity_asc", label: "Cantidad menor" },
  { value: "quantity_desc", label: "Cantidad mayor" },
];
const defaultPreferenceSettings: PreferenceSettings = {
  dietType: "Equilibrada",
  restrictions: [],
  excludedIngredientIds: [],
  goals: [],
  varietyLevel: "Media",
};
const millisecondsPerDay = 24 * 60 * 60 * 1000;

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = errorText || `Request failed with status ${response.status}`;
    try {
      const parsed = JSON.parse(errorText) as { detail?: string };
      errorMessage = parsed.detail || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new ApiError(response.status, errorMessage);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function mealRank(mealType: string) {
  const normalized = mealType.toLowerCase();
  return normalized.includes("comida") || normalized.includes("lunch") ? 0 : 1;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getApiErrorStatus(error: unknown) {
  return error instanceof ApiError ? error.status : null;
}

function parseCooldownSeconds(message: string) {
  const match = message.match(/Espera (\d+) segundos/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function reportClientLog(
  level: LogLevel,
  message: string,
  context: Record<string, unknown> = {},
  error?: unknown,
) {
  const errorData =
    error instanceof Error
      ? { error_name: error.name, error_message: error.message }
      : error
        ? { error_message: String(error) }
        : {};
  const stackTrace = error instanceof Error ? error.stack : undefined;

  void fetch(`${API_URL}/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      level,
      module: "frontend",
      message,
      context: {
        ...context,
        ...errorData,
        path: typeof window === "undefined" ? "" : window.location.pathname,
      },
      stack_trace: stackTrace,
    }),
  }).catch(() => undefined);
}

function toggleListValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function buildPreferencesSummary(settings: PreferenceSettings, ingredients: Ingredient[]) {
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.name]));
  const excludedIngredientNames = settings.excludedIngredientIds
    .map((ingredientId) => ingredientById.get(ingredientId))
    .filter((name): name is string => Boolean(name));

  return [
    `Tipo de dieta: ${settings.dietType}.`,
    settings.restrictions.length ? `Restricciones alimentarias: ${settings.restrictions.join(", ")}.` : "",
    excludedIngredientNames.length ? `Ingredientes excluidos: ${excludedIngredientNames.join(", ")}.` : "",
    settings.goals.length ? `Objetivos: ${settings.goals.join(", ")}.` : "",
    `Nivel de variedad semanal: ${settings.varietyLevel}.`,
    "Evitar repetir platos recientes y priorizar ingredientes disponibles.",
  ]
    .filter(Boolean)
    .join(" ");
}

function parseSavedPreferenceSettings(value: string | null): PreferenceSettings | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PreferenceSettings>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.dietType !== "string") return null;
    return {
      dietType: parsed.dietType,
      restrictions: Array.isArray(parsed.restrictions) ? parsed.restrictions.filter((item): item is string => typeof item === "string") : [],
      excludedIngredientIds: Array.isArray(parsed.excludedIngredientIds)
        ? parsed.excludedIngredientIds.filter((item): item is string => typeof item === "string")
        : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals.filter((item): item is string => typeof item === "string") : [],
      varietyLevel: typeof parsed.varietyLevel === "string" ? parsed.varietyLevel : defaultPreferenceSettings.varietyLevel,
    };
  } catch {
    return null;
  }
}

function getRecipeDifficulty(minutes: number, difficulty?: string | null) {
  if (difficulty?.trim()) return difficulty;
  if (minutes <= 30) return "Facil";
  if (minutes <= 45) return "Media";
  return "Elaborada";
}

function matchesRecipeTime(recipe: Recipe, timeFilter: string) {
  if (timeFilter === "Hasta 30 min") return recipe.prep_time_minutes <= 30;
  if (timeFilter === "31-45 min") return recipe.prep_time_minutes > 30 && recipe.prep_time_minutes <= 45;
  if (timeFilter === "+45 min") return recipe.prep_time_minutes > 45;
  return true;
}

function getRecipeImage(recipe: Recipe) {
  return recipe.image_url?.trim() || null;
}

function getRecipeAltText(recipe: Recipe) {
  return recipe.image_alt_text?.trim() || `Receta ${recipe.title}`;
}

function getRecipeImageCaption(recipe: Recipe) {
  return recipe.description || `Imagen de referencia para ${recipe.title}.`;
}

function getRecipeImageReason(recipe: Recipe) {
  const normalizedReason = recipe.image_lookup_reason?.trim();
  const legacyFallbackReason = "El modo demo local no busca imagenes reales en internet.";

  if (getRecipeImage(recipe)) {
    return normalizedReason || "La receta ya cuenta con una imagen real validada.";
  }
  if (recipe.image_lookup_status === null || recipe.image_lookup_status === undefined) {
    return "Todavia no se ha intentado resolver una imagen real para esta receta. La busqueda solo se lanza al abrir el detalle o al pedirla manualmente.";
  }
  if (recipe.image_lookup_status === "rate_limited") {
    return normalizedReason || "La resolucion de imagenes esta pausada temporalmente por saturacion de Gemini.";
  }
  if (recipe.image_lookup_status === "upstream_error") {
    return normalizedReason || "La resolucion de imagen ha encontrado un error temporal del proveedor o de la pagina fuente.";
  }
  if (recipe.image_lookup_status === "invalid") {
    return normalizedReason || "Se encontro una referencia, pero ninguna imagen asociada se pudo validar.";
  }
  if (normalizedReason === legacyFallbackReason) {
    return "La receta se resolvio con fallback local y no incluye busqueda real de imagenes.";
  }
  if (recipe.source === "fallback-local" && recipe.image_lookup_status === "not_found") {
    return normalizedReason || "La receta se resolvio con fallback local y todavia no tiene una imagen real.";
  }
  return normalizedReason || "No se ha encontrado una imagen real fiable para esta receta.";
}

function getRecipeImageStatus(recipe: Recipe) {
  if (getRecipeImage(recipe)) return "Imagen encontrada";
  if (recipe.image_lookup_status === null || recipe.image_lookup_status === undefined) return "Pendiente de resolver";
  if (recipe.image_lookup_status === "rate_limited") return "Resolucion pausada";
  if (recipe.image_lookup_status === "upstream_error") return "Error temporal de resolucion";
  if (recipe.image_lookup_status === "invalid") return "Imagen descartada";
  return "Sin imagen disponible";
}

function getRecipeImageSourceUrl(recipe: Recipe) {
  return recipe.image_source_url?.trim() || null;
}

function parseIsoDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getRetryAfterSeconds(value?: string | null, nowMs = Date.now()) {
  const retryAfter = parseIsoDate(value);
  if (!retryAfter) return null;
  const diffMs = retryAfter.getTime() - nowMs;
  if (diffMs <= 0) return null;
  return Math.ceil(diffMs / 1000);
}

function formatRetryCountdown(totalSeconds: number) {
  if (totalSeconds <= 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function canAutoResolveRecipeImage(recipe: Recipe) {
  if (getRecipeImage(recipe)) return false;
  if (recipe.source === "manual") return false;
  const status = recipe.image_lookup_status;
  return status === null || status === undefined;
}

function getRecipeSourceLabel(recipe: Recipe) {
  const source = recipe.source.toLowerCase();
  if (source.includes("manual")) return "Manual";
  return "Generada";
}

function getRecipeServings(recipe: Recipe) {
  return recipe.servings && recipe.servings > 0 ? recipe.servings : 2;
}

function getDefaultIngredientCategoryId(categories: IngredientCategory[]) {
  return categories.find((category) => category.name === "Otros")?.id ?? categories[0]?.id ?? "";
}

function buildDefaultIngredientForm(categories: IngredientCategory[]): IngredientForm {
  return {
    name: "",
    quantity: "",
    categoryId: getDefaultIngredientCategoryId(categories),
    expiresAt: "",
  };
}

function parseQuantityValue(quantity?: string | null) {
  if (!quantity) return null;
  const match = quantity.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function compareOptionalNumbers(left: number | null, right: number | null, direction: "asc" | "desc") {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "asc" ? left - right : right - left;
}

function compareOptionalDates(left?: string | null, right?: string | null, direction: "asc" | "desc" = "asc") {
  const leftTime = left ? parseLocalDate(left)?.getTime() ?? null : null;
  const rightTime = right ? parseLocalDate(right)?.getTime() ?? null : null;
  return compareOptionalNumbers(leftTime, rightTime, direction);
}

function sortIngredients(ingredients: Ingredient[], sort: IngredientSort) {
  return [...ingredients].sort((left, right) => {
    if (sort === "expiry_desc") return compareOptionalDates(left.expires_at, right.expires_at, "desc");
    if (sort === "quantity_asc") return compareOptionalNumbers(parseQuantityValue(left.quantity), parseQuantityValue(right.quantity), "asc");
    if (sort === "quantity_desc") return compareOptionalNumbers(parseQuantityValue(left.quantity), parseQuantityValue(right.quantity), "desc");
    return compareOptionalDates(left.expires_at, right.expires_at, "asc");
  });
}

function formatIngredientExpiry(value?: string | null) {
  if (!value) return "Sin caducidad";
  const date = parseLocalDate(value);
  if (!date) return "Caducidad no valida";
  return `Caduca ${new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(date)}`;
}

function getIngredientExpiryLabel(value?: string | null) {
  if (!value) return "Sin fecha";
  const date = parseLocalDate(value);
  if (!date) return "Sin fecha";
  const today = parseLocalDate(toLocalDateKey(new Date()));
  if (!today) return "Sin fecha";
  const diff = Math.ceil((date.getTime() - today.getTime()) / millisecondsPerDay);
  if (diff < 0) return "Caducado";
  if (diff <= 3) return "Caduca pronto";
  return "En fecha";
}

function parseIngredientLine(value: string): RecipeIngredientDraft {
  const trimmed = value.trim();
  if (!trimmed) return { name: "", quantity: "" };

  const dashMatch = trimmed.match(/^(.+?)\s+-\s+(.+)$/);
  if (dashMatch) return { name: dashMatch[1].trim(), quantity: dashMatch[2].trim() };

  const colonMatch = trimmed.match(/^(.+?):\s*(.+)$/);
  if (colonMatch) return { name: colonMatch[1].trim(), quantity: colonMatch[2].trim() };

  const leadingQuantity = trimmed.match(
    /^([\d.,/]+\s*(?:g|kg|ml|l|ud|uds|unidad|unidades|cucharadas?|cucharaditas?|tazas?|botes?|bolsas?|filetes?|rebanadas?)?)\s+(.+)$/i,
  );
  if (leadingQuantity) return { name: leadingQuantity[2].trim(), quantity: leadingQuantity[1].trim() };

  return { name: trimmed, quantity: "" };
}

function formatIngredientDraft(ingredient: RecipeIngredientDraft) {
  const name = ingredient.name.trim();
  const quantity = ingredient.quantity.trim();
  return quantity ? `${name} - ${quantity}` : name;
}

function buildRecipeEditForm(recipe: Recipe): RecipeEditForm {
  return {
    title: recipe.title,
    description: recipe.description,
    imageUrl: recipe.image_url ?? "",
    prepTimeMinutes: String(recipe.prep_time_minutes || 25),
    difficulty: getRecipeDifficulty(recipe.prep_time_minutes, recipe.difficulty),
    servings: String(getRecipeServings(recipe)),
    ingredients: recipe.ingredients.length ? recipe.ingredients.map(parseIngredientLine) : [{ name: "", quantity: "" }],
    steps: recipe.steps.length ? recipe.steps : [""],
    tagsText: recipe.tags.join(", "),
    isFavorite: recipe.is_favorite,
  };
}

function buildEmptyRecipeForm(): RecipeEditForm {
  return {
    title: "",
    description: "",
    imageUrl: "",
    prepTimeMinutes: "25",
    difficulty: "Facil",
    servings: "2",
    ingredients: [{ name: "", quantity: "" }],
    steps: [""],
    tagsText: "",
    isFavorite: false,
  };
}

function buildRecipePayloadFromDraft(draft: RecipeEditForm, requireImage = false): RecipeMutationPayload | { error: string } {
  const prepTimeMinutes = Number(draft.prepTimeMinutes);
  const servings = Number(draft.servings);
  const ingredients = draft.ingredients.map(formatIngredientDraft).filter(Boolean);
  const steps = draft.steps.map((step) => step.trim()).filter(Boolean);
  const tags = draft.tagsText
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (!draft.title.trim()) return { error: "El nombre de la receta es obligatorio." };
  if (requireImage && !draft.imageUrl.trim()) return { error: "Anade una URL de foto para la receta." };
  if (!Number.isFinite(prepTimeMinutes) || prepTimeMinutes < 5) return { error: "El tiempo debe ser de al menos 5 minutos." };
  if (!Number.isFinite(servings) || servings < 1) return { error: "Las raciones deben ser al menos 1." };
  if (ingredients.length === 0) return { error: "Anade al menos un ingrediente." };
  if (steps.length === 0) return { error: "Anade al menos un paso de preparacion." };

  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    ingredients,
    steps,
    tags,
    prep_time_minutes: Math.round(prepTimeMinutes),
    difficulty: draft.difficulty.trim() || getRecipeDifficulty(prepTimeMinutes),
    servings: Math.round(servings),
    image_url: draft.imageUrl.trim() || null,
    is_favorite: draft.isFavorite,
  };
}

function getRecipeTip(recipe: Recipe) {
  const mainIngredient = parseIngredientLine(recipe.ingredients[0] ?? "").name || "los ingredientes principales";
  return `Recomendacion IA: prepara ${mainIngredient.toLowerCase()} justo antes de servir y ajusta sal, acidez y textura al final para que la receta mantenga contraste.`;
}

function RecipeVisualSurface({
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
        className="h-full w-full object-cover"
        src={imageUrl}
        alt={getRecipeAltText(recipe)}
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
            <span className="inline-flex h-10 w-10 animate-spin rounded-full border-2 border-leaf/20 border-t-leaf" aria-hidden="true" />
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

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function getCurrentMenuDayIndex(menu: WeeklyMenu | null) {
  if (!menu) return null;
  const weekStart = parseLocalDate(menu.week_start_date);
  const today = parseLocalDate(toLocalDateKey(new Date()));
  if (!weekStart || !today) return null;
  const dayIndex = Math.floor((today.getTime() - weekStart.getTime()) / millisecondsPerDay);
  return dayIndex >= 0 && dayIndex <= 6 ? dayIndex : null;
}

export default function Home() {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientCategoryOptions, setIngredientCategoryOptions] = useState<IngredientCategory[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [menu, setMenu] = useState<WeeklyMenu | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [generationGuard, setGenerationGuard] = useState<GenerationGuard>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [preferenceSettings, setPreferenceSettings] = useState<PreferenceSettings>(defaultPreferenceSettings);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [recipeFilter, setRecipeFilter] = useState("");
  const [recipeTagFilter, setRecipeTagFilter] = useState("Todas");
  const [recipeDifficultyFilter, setRecipeDifficultyFilter] = useState("Todas");
  const [recipeTimeFilter, setRecipeTimeFilter] = useState("Todos");
  const [ingredientQuery, setIngredientQuery] = useState("");
  const [ingredientCategory, setIngredientCategory] = useState("Todas");
  const [ingredientSort, setIngredientSort] = useState<IngredientSort>("expiry_asc");
  const [ingredientFiltersOpen, setIngredientFiltersOpen] = useState(false);
  const [ingredientModalOpen, setIngredientModalOpen] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [resolvingRecipeImageId, setResolvingRecipeImageId] = useState<string | null>(null);
  const [selectedRecipes, setSelectedRecipes] = useState<Record<string, string>>({});
  const [ingredientForm, setIngredientForm] = useState<IngredientForm>(() => buildDefaultIngredientForm([]));
  const [recipeForm, setRecipeForm] = useState<RecipeEditForm>(() => buildEmptyRecipeForm());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Listo para planificar.");
  const [menuGenerationFeedback, setMenuGenerationFeedback] = useState<MenuGenerationFeedback>({
    phase: "idle",
    message: "",
    cooldownSeconds: null,
  });
  const imageResolutionRequestsInFlight = useRef<Set<string>>(new Set());
  const preferences = useMemo(() => buildPreferencesSummary(preferenceSettings, ingredients), [ingredients, preferenceSettings]);
  const usableIngredients = useMemo(
    () => ingredients.filter((ingredient) => !preferenceSettings.excludedIngredientIds.includes(ingredient.id)),
    [ingredients, preferenceSettings.excludedIngredientIds],
  );

  async function refreshData() {
    const [ingredientData, categoryData, recipeData, menuData, aiStatusData] = await Promise.all([
      api<Ingredient[]>("/ingredients"),
      api<IngredientCategory[]>("/ingredient-categories"),
      api<Recipe[]>("/recipes"),
      api<WeeklyMenu | null>("/menus/latest"),
      api<AiStatus>("/ai/status"),
    ]);
    setIngredients(ingredientData);
    setIngredientCategoryOptions(categoryData);
    setRecipes(recipeData);
    setMenu(menuData);
    setAiStatus(aiStatusData);
  }

  useEffect(() => {
    refreshData().catch((error: Error) => {
      setMessage(`No se pudo conectar con la API: ${error.message}`);
      reportClientLog("error", "Error cargando datos iniciales", { action: "initial_load" }, error);
    });
  }, []);

  useEffect(() => {
    const savedPreferences = parseSavedPreferenceSettings(localStorage.getItem(PREFERENCES_STORAGE_KEY));
    if (savedPreferences) {
      setPreferenceSettings(savedPreferences);
    }
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferenceSettings));
  }, [preferenceSettings, preferencesReady]);

  useEffect(() => {
    if (!ingredientForm.categoryId && ingredientCategoryOptions.length) {
      setIngredientForm((current) => ({
        ...current,
        categoryId: getDefaultIngredientCategoryId(ingredientCategoryOptions),
      }));
    }
  }, [ingredientCategoryOptions, ingredientForm.categoryId]);

  useEffect(() => {
    const ingredientIds = new Set(ingredients.map((ingredient) => ingredient.id));
    setPreferenceSettings((current) => {
      const excludedIngredientIds = current.excludedIngredientIds.filter((ingredientId) => ingredientIds.has(ingredientId));
      if (excludedIngredientIds.length === current.excludedIngredientIds.length) return current;
      return { ...current, excludedIngredientIds };
    });
  }, [ingredients]);

  useEffect(() => {
    if (menuGenerationFeedback.phase !== "rate_limited" || !menuGenerationFeedback.cooldownSeconds || menuGenerationFeedback.cooldownSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setMenuGenerationFeedback((current) => {
        if (current.phase !== "rate_limited" || !current.cooldownSeconds || current.cooldownSeconds <= 0) {
          return current;
        }
        return { ...current, cooldownSeconds: Math.max(current.cooldownSeconds - 1, 0) };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [menuGenerationFeedback.phase, menuGenerationFeedback.cooldownSeconds]);

  const groupedMenu = useMemo(() => {
    const groups = new Map<number, MenuItem[]>();
    for (const item of menu?.items ?? []) {
      groups.set(item.day_index, [...(groups.get(item.day_index) ?? []), item]);
    }
    return Array.from(groups.entries()).sort(([left], [right]) => left - right);
  }, [menu]);

  const ingredientCategoryFilters = useMemo(() => {
    const categoryNames = ingredientCategoryOptions.map((item) => item.name);
    const legacyNames = ingredients
      .map((item) => item.category)
      .filter((value): value is string => Boolean(value && !categoryNames.includes(value)));
    return ["Todas", ...categoryNames, ...Array.from(new Set(legacyNames)).sort((left, right) => left.localeCompare(right))];
  }, [ingredientCategoryOptions, ingredients]);

  const filteredIngredients = useMemo(() => {
    const query = ingredientQuery.trim().toLowerCase();
    const filtered = ingredients.filter((ingredient) => {
      const matchesQuery =
        !query ||
        ingredient.name.toLowerCase().includes(query) ||
        (ingredient.category ?? "").toLowerCase().includes(query);
      const matchesCategory = ingredientCategory === "Todas" || ingredient.category === ingredientCategory;
      return matchesQuery && matchesCategory;
    });
    return sortIngredients(filtered, ingredientSort);
  }, [ingredientCategory, ingredientQuery, ingredientSort, ingredients]);

  const filteredRecipes = useMemo(() => {
    const query = recipeFilter.trim().toLowerCase();
    return recipes.filter((recipe) => {
      const matchesQuery =
        !query ||
        recipe.title.toLowerCase().includes(query) ||
        recipe.description.toLowerCase().includes(query) ||
        recipe.ingredients.some((ingredient) => ingredient.toLowerCase().includes(query)) ||
        recipe.tags.some((tag) => tag.toLowerCase().includes(query));
      const matchesTag = recipeTagFilter === "Todas" || recipe.tags.includes(recipeTagFilter);
      const matchesDifficulty =
        recipeDifficultyFilter === "Todas" ||
        getRecipeDifficulty(recipe.prep_time_minutes, recipe.difficulty) === recipeDifficultyFilter;
      return matchesQuery && matchesTag && matchesDifficulty && matchesRecipeTime(recipe, recipeTimeFilter);
    });
  }, [recipeDifficultyFilter, recipeFilter, recipeTagFilter, recipeTimeFilter, recipes]);

  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => recipe.id === selectedRecipeId) ?? null,
    [recipes, selectedRecipeId],
  );
  const plannedSlots = menu?.items.filter((item) => item.recipe).length ?? 0;
  const dashboardDays = groupedMenu;
  const currentMenuDayIndex = getCurrentMenuDayIndex(menu);
  const isGeneratingMenu = menuGenerationFeedback.phase === "loading";
  const generationCooldownActive =
    menuGenerationFeedback.phase === "rate_limited" && (menuGenerationFeedback.cooldownSeconds ?? 0) > 0;
  const latestRecipes = recipes.slice(0, 4);
  const expiringIngredients = useMemo(() => sortIngredients(ingredients, "expiry_asc").slice(0, 4), [ingredients]);
  const recipeTags = ["Todas", ...Array.from(new Set(recipes.flatMap((recipe) => recipe.tags))).slice(0, 10)];
  const navItems: { id: Exclude<ViewId, "recipeDetail">; label: string; description: string }[] = [
    { id: "dashboard", label: "Dashboard", description: "Resumen" },
    { id: "menu", label: "Menu semanal", description: "Plan de 7 dias" },
    { id: "ingredients", label: "Ingredientes", description: "Nevera" },
    { id: "recipes", label: "Recetas", description: "Guardadas" },
    { id: "preferences", label: "Preferencias", description: "Personaliza tu experiencia de planificacion" },
  ];
  const quickStats = [
    { label: "Recetas guardadas", value: recipes.length.toString(), detail: "Para repetir, filtrar, editar o marcar favoritas" },
    { label: "Ingredientes disponibles", value: ingredients.length.toString(), detail: "Base actual de la nevera" },
    {
      label: "Huecos planificados",
      value: `${plannedSlots}/14`,
      detail: menu ? `Semana ${menu.week_start_date}` : "Pendiente de generar",
    },
  ];
  const activeMeta =
    activeView === "recipeDetail"
      ? {
          label: selectedRecipe?.title ?? "Detalle de receta",
          description: "Consulta completa y edicion preparada para recetario.",
        }
      : (navItems.find((item) => item.id === activeView) ?? navItems[0]);

  function savePreferences() {
    setMessage("Preferencias guardadas para la proxima generacion.");
    reportClientLog("info", "Preferencias actualizadas desde frontend", {
      action: "update_preferences",
      diet_type: preferenceSettings.dietType,
      restrictions_count: preferenceSettings.restrictions.length,
      excluded_ingredients_count: preferenceSettings.excludedIngredientIds.length,
      goals_count: preferenceSettings.goals.length,
      variety_level: preferenceSettings.varietyLevel,
    });
  }

  function openRecipeDetail(recipe: Recipe) {
    setSelectedRecipeId(recipe.id);
    setActiveView("recipeDetail");
    reportClientLog("info", "Detalle de receta abierto desde frontend", {
      action: "open_recipe_detail",
      recipe_id: recipe.id,
    });
  }

  function useRecipeFromDetail(recipe: Recipe) {
    setActiveView("menu");
    setMessage(`Selecciona un hueco del menu semanal para reutilizar "${recipe.title}".`);
    reportClientLog("info", "Receta preparada para reutilizar desde detalle", {
      action: "prepare_use_recipe",
      recipe_id: recipe.id,
    });
  }

  async function updateRecipe(recipeId: string, payload: RecipeUpdatePayload) {
    setLoading(true);
    try {
      const data = await api<Recipe>(`/recipes/${recipeId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setRecipes((current) => current.map((recipe) => (recipe.id === data.id ? data : recipe)));
      setMenu((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) => (item.recipe?.id === data.id ? { ...item, recipe: data } : item)),
            }
          : current,
      );
      setSelectedRecipeId(data.id);
      setMessage("Receta actualizada.");
      reportClientLog("info", "Receta actualizada desde frontend", {
        action: "update_recipe",
        recipe_id: data.id,
      });
      return data;
    } catch (error) {
      setMessage(getErrorMessage(error, "Error al actualizar receta."));
      reportClientLog("error", "Error actualizando receta desde frontend", { action: "update_recipe", recipe_id: recipeId }, error);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function createRecipe(payload: RecipeCreatePayload) {
    setLoading(true);
    try {
      const data = await api<Recipe>("/recipes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setRecipes((current) => [data, ...current]);
      setSelectedRecipeId(data.id);
      setRecipeModalOpen(false);
      setRecipeForm(buildEmptyRecipeForm());
      setActiveView("recipeDetail");
      setMessage("Receta creada y guardada.");
      reportClientLog("info", "Receta creada manualmente desde frontend", {
        action: "create_recipe",
        recipe_id: data.id,
        is_favorite: data.is_favorite,
      });
      return data;
    } catch (error) {
      setMessage(getErrorMessage(error, "Error al crear receta."));
      reportClientLog("error", "Error creando receta manual desde frontend", { action: "create_recipe" }, error);
      return null;
    } finally {
      setLoading(false);
    }
  }

  function mergeResolvedRecipes(updatedRecipes: Recipe[]) {
    if (!updatedRecipes.length) return;
    const updatedById = new Map(updatedRecipes.map((recipe) => [recipe.id, recipe]));
    setRecipes((current) => current.map((recipe) => updatedById.get(recipe.id) ?? recipe));
    setMenu((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => (item.recipe?.id ? { ...item, recipe: updatedById.get(item.recipe.id) ?? item.recipe } : item)),
          }
        : current,
    );
    if (selectedRecipeId && updatedById.has(selectedRecipeId)) {
      setSelectedRecipeId(selectedRecipeId);
    }
  }

  async function resolveRecipeImage(recipeId: string, force = false) {
    const currentRecipe = recipes.find((recipe) => recipe.id === recipeId) ?? null;
    const cooldownSeconds =
      currentRecipe && (currentRecipe.image_lookup_status === "rate_limited" || currentRecipe.image_lookup_status === "upstream_error")
        ? getRetryAfterSeconds(currentRecipe.image_lookup_retry_after)
        : null;
    if (cooldownSeconds && cooldownSeconds > 0) {
      if (force) {
        setMessage(
          `La resolucion de imagenes sigue en pausa para esta receta. Espera ${formatRetryCountdown(cooldownSeconds)} antes de reintentar.`,
        );
      }
      return currentRecipe;
    }
    if (imageResolutionRequestsInFlight.current.has(recipeId)) {
      return null;
    }
    imageResolutionRequestsInFlight.current.add(recipeId);
    setResolvingRecipeImageId(recipeId);
    try {
      const data = await api<Recipe>(`/recipes/${recipeId}/resolve-image${force ? "?force=true" : ""}`, {
        method: "POST",
      });
      mergeResolvedRecipes([data]);
      setSelectedRecipeId(data.id);
      if (force) {
        setMessage(data.image_url ? "Imagen real resuelta para la receta." : getRecipeImageReason(data));
      }
      reportClientLog("info", "Resolucion de imagen lanzada desde frontend", {
        action: "resolve_recipe_image",
        recipe_id: data.id,
        image_lookup_status: data.image_lookup_status,
        has_image_url: Boolean(data.image_url),
        forced: force,
      });
      return data;
    } catch (error) {
      if (force) {
        setMessage(getErrorMessage(error, "Error al resolver la imagen de la receta."));
      }
      reportClientLog("error", "Error resolviendo imagen desde frontend", { action: "resolve_recipe_image", recipe_id: recipeId }, error);
      return null;
    } finally {
      imageResolutionRequestsInFlight.current.delete(recipeId);
      setResolvingRecipeImageId((current) => (current === recipeId ? null : current));
    }
  }

  async function toggleFavoriteRecipe(recipe: Recipe, event?: { stopPropagation: () => void }) {
    event?.stopPropagation();
    const nextFavorite = !recipe.is_favorite;
    const updated = await updateRecipe(recipe.id, { is_favorite: nextFavorite });
    if (updated) {
      setMessage(nextFavorite ? "Receta marcada como favorita." : "Receta quitada de favoritos.");
      reportClientLog("info", "Favorito de receta actualizado desde frontend", {
        action: "toggle_recipe_favorite",
        recipe_id: recipe.id,
        is_favorite: nextFavorite,
      });
    }
  }

  async function addIngredient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ingredientForm.name.trim()) return;
    if (!ingredientForm.categoryId) {
      setMessage("Selecciona una categoria para el ingrediente.");
      return;
    }
    setLoading(true);
    try {
      await api<Ingredient>("/ingredients", {
        method: "POST",
        body: JSON.stringify({
          name: ingredientForm.name.trim(),
          quantity: ingredientForm.quantity.trim() || null,
          category_id: ingredientForm.categoryId,
          expires_at: ingredientForm.expiresAt || null,
        }),
      });
      setIngredientForm(buildDefaultIngredientForm(ingredientCategoryOptions));
      setIngredientModalOpen(false);
      setMessage("Ingrediente guardado.");
      reportClientLog("info", "Ingrediente creado desde frontend", {
        action: "create_ingredient",
        name: ingredientForm.name.trim(),
        category_id: ingredientForm.categoryId,
        expires_at: ingredientForm.expiresAt || null,
      });
      await refreshData();
    } catch (error) {
      setMessage(getErrorMessage(error, "Error al guardar ingrediente."));
      reportClientLog("error", "Error guardando ingrediente", { action: "create_ingredient" }, error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteIngredient(id: string) {
    setLoading(true);
    try {
      await api<void>(`/ingredients/${id}`, { method: "DELETE" });
      setMessage("Ingrediente eliminado.");
      reportClientLog("info", "Ingrediente eliminado desde frontend", { action: "delete_ingredient", ingredient_id: id });
      await refreshData();
    } catch (error) {
      setMessage(getErrorMessage(error, "Error al eliminar ingrediente."));
      reportClientLog("error", "Error eliminando ingrediente", { action: "delete_ingredient", ingredient_id: id }, error);
    } finally {
      setLoading(false);
    }
  }

  async function addDemoIngredients(focusIngredients = true) {
    setLoading(true);
    setMessage("Cargando ingredientes de prueba...");
    try {
      const created = await api<Ingredient[]>("/ingredients/demo", { method: "POST" });
      await refreshData();
      if (focusIngredients) {
        setActiveView("ingredients");
      }
      setMessage(
        created.length
          ? `${created.length} ingredientes de prueba guardados en la base de datos.`
          : "Los ingredientes de prueba ya estaban cargados.",
      );
      reportClientLog("info", "Ingredientes demo cargados desde frontend", {
        action: "create_demo_ingredients",
        created_count: created.length,
      });
    } catch (error) {
      setMessage(getErrorMessage(error, "Error al cargar ingredientes de prueba."));
      reportClientLog("error", "Error cargando ingredientes demo", { action: "create_demo_ingredients" }, error);
    } finally {
      setLoading(false);
    }
  }

  function requestGenerateMenu() {
    if (generationCooldownActive) {
      const waitMessage =
        menuGenerationFeedback.cooldownSeconds && menuGenerationFeedback.cooldownSeconds > 0
          ? `Gemini sigue saturado. Espera ${menuGenerationFeedback.cooldownSeconds} segundos antes de reintentar.`
          : "Gemini sigue saturado temporalmente. Espera un momento antes de reintentar.";
      setMessage(waitMessage);
      return;
    }

    if (ingredients.length === 0) {
      setGenerationGuard("empty");
      reportClientLog("warning", "Generacion bloqueada por nevera vacia", { action: "open_generation_guard" });
      return;
    }

    if (ingredients.length < MIN_INGREDIENTS_FOR_MENU) {
      setGenerationGuard("insufficient");
      reportClientLog("warning", "Generacion bloqueada por ingredientes insuficientes", {
        action: "open_generation_guard",
        ingredient_count: ingredients.length,
        minimum_required: MIN_INGREDIENTS_FOR_MENU,
      });
      return;
    }

    if (usableIngredients.length < MIN_INGREDIENTS_FOR_MENU) {
      setGenerationGuard("excluded_insufficient");
      reportClientLog("warning", "Generacion bloqueada por exclusiones de ingredientes", {
        action: "open_generation_guard",
        ingredient_count: ingredients.length,
        usable_ingredient_count: usableIngredients.length,
        excluded_ingredient_count: preferenceSettings.excludedIngredientIds.length,
        minimum_required: MIN_INGREDIENTS_FOR_MENU,
      });
      return;
    }

    if (aiStatus && !aiStatus.configured) {
      setGenerationGuard("fallback");
      reportClientLog("info", "Aviso de modo demo mostrado antes de generar menu", {
        action: "open_generation_guard",
        model: aiStatus.model,
      });
      return;
    }

    void generateMenu();
  }

  async function addDemoIngredientsFromGuard() {
    await addDemoIngredients(false);
    setGenerationGuard(null);
    setMessage("Ingredientes de prueba guardados. Ya puedes generar el menu semanal.");
  }

  async function continueWithFallback() {
    setGenerationGuard(null);
    await generateMenu();
  }

  async function generateMenu() {
    setLoading(true);
    setMessage("Generando menu semanal...");
    setMenuGenerationFeedback({
      phase: "loading",
      message: "Generando menu semanal con IA. Estamos consultando Gemini y validando el resultado.",
      cooldownSeconds: null,
    });
    reportClientLog("info", "Generacion de menu iniciada desde frontend", {
      action: "generate_menu_started",
      ingredient_count: ingredients.length,
      usable_ingredient_count: usableIngredients.length,
      ai_configured: aiStatus?.configured ?? false,
    });
    try {
      const data = await api<WeeklyMenu>("/menus/generate", {
        method: "POST",
        body: JSON.stringify({ preferences, excluded_ingredient_ids: preferenceSettings.excludedIngredientIds }),
      });
      setMenu(data);
      setActiveView("menu");
      setMessage("Menu semanal generado.");
      setMenuGenerationFeedback({
        phase: "success",
        message: "Menu semanal generado correctamente.",
        cooldownSeconds: null,
      });
      reportClientLog("info", "Menu generado desde frontend", {
        action: "generate_menu",
        ai_model: data.ai_model,
        item_count: data.items.length,
      });
      await refreshRecipes();
    } catch (error) {
      const errorMessage = getErrorMessage(error, "Error al generar menu.");
      const statusCode = getApiErrorStatus(error);
      const cooldownSeconds = parseCooldownSeconds(errorMessage);
      setMessage(errorMessage);
      if (statusCode === 503) {
        setMenuGenerationFeedback({
          phase: "rate_limited",
          message: errorMessage,
          cooldownSeconds,
        });
      } else {
        setMenuGenerationFeedback({
          phase: "error",
          message: errorMessage,
          cooldownSeconds: null,
        });
      }
      reportClientLog("error", "Error generando menu desde frontend", { action: "generate_menu" }, error);
    } finally {
      setLoading(false);
    }
  }

  async function refreshRecipes() {
    setRecipes(await api<Recipe[]>("/recipes"));
  }

  async function replaceItem(itemId: string) {
    if (!menu) return;
    setLoading(true);
    try {
      const data = await api<WeeklyMenu>(`/menus/${menu.id}/items/${itemId}/replace`, {
        method: "POST",
        body: JSON.stringify({ preferences, excluded_ingredient_ids: preferenceSettings.excludedIngredientIds }),
      });
      setMenu(data);
      setMessage("Plato sustituido.");
      reportClientLog("info", "Plato sustituido desde frontend", { action: "replace_menu_item", item_id: itemId });
      await refreshRecipes();
    } catch (error) {
      setMessage(getErrorMessage(error, "Error al sustituir plato."));
      reportClientLog("error", "Error sustituyendo plato desde frontend", { action: "replace_menu_item", item_id: itemId }, error);
    } finally {
      setLoading(false);
    }
  }

  async function useSavedRecipe(itemId: string) {
    if (!menu || !selectedRecipes[itemId]) return;
    setLoading(true);
    try {
      const data = await api<WeeklyMenu>(`/menus/${menu.id}/items/${itemId}/use-recipe`, {
        method: "POST",
        body: JSON.stringify({ recipe_id: selectedRecipes[itemId] }),
      });
      setMenu(data);
      setMessage("Receta guardada repetida en el menu.");
      reportClientLog("info", "Receta guardada reutilizada desde frontend", {
        action: "use_saved_recipe",
        item_id: itemId,
        recipe_id: selectedRecipes[itemId],
      });
    } catch (error) {
      setMessage(getErrorMessage(error, "Error al repetir receta."));
      reportClientLog("error", "Error reutilizando receta guardada", { action: "use_saved_recipe", item_id: itemId }, error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRecipe(recipeId: string) {
    setLoading(true);
    try {
      await api<void>(`/recipes/${recipeId}`, { method: "DELETE" });
      setMessage("Receta eliminada del recetario.");
      reportClientLog("info", "Receta eliminada desde frontend", { action: "delete_recipe", recipe_id: recipeId });
      await refreshData();
    } catch (error) {
      setMessage(getErrorMessage(error, "Error al eliminar receta."));
      reportClientLog("error", "Error eliminando receta desde frontend", { action: "delete_recipe", recipe_id: recipeId }, error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="lg:flex lg:min-h-screen">
        <aside className="border-b border-line bg-white lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-5 lg:h-full lg:px-6">
            <div>
              <p className="text-xl font-bold">MenuPlan</p>
              <p className="mt-1 text-sm text-ink/65">Planificacion inteligente</p>
            </div>

            <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label="Navegacion principal">
              {navItems.map((item) => {
                const isActive = activeView === item.id || (activeView === "recipeDetail" && item.id === "recipes");
                return (
                  <button
                    key={item.id}
                    className={`min-w-fit rounded-lg border px-3 py-2 text-left transition lg:px-4 lg:py-3 ${
                      isActive
                        ? "border-leaf bg-leaf text-white shadow-soft"
                        : "border-line text-ink/80 hover:border-leaf hover:text-leaf"
                    }`}
                    onClick={() => setActiveView(item.id)}
                    type="button"
                  >
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className={`hidden text-xs lg:block ${isActive ? "text-white/75" : "text-ink/55"}`}>
                      {item.description}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto grid gap-3 rounded-lg border border-line bg-paper p-4 text-sm">
              <p className="font-semibold">Estado de la demo</p>
              <p className="leading-6 text-ink/70">{message}</p>
              <span className="w-fit rounded bg-yolk px-2 py-1 text-xs font-semibold text-ink">
                {menu ? "Menu generado" : "Sin menu generado"}
              </span>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b border-line bg-white">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase text-leaf">Plan semanal con IA</p>
                <h1 className="mt-1 text-3xl font-bold leading-tight">{activeMeta.label}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">{activeMeta.description}</p>
              </div>
              <button
                className="rounded-lg bg-leaf px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading || generationCooldownActive}
                onClick={requestGenerateMenu}
                type="button"
              >
                {isGeneratingMenu
                  ? "Generando menu semanal..."
                  : generationCooldownActive
                    ? `Reintentar en ${menuGenerationFeedback.cooldownSeconds}s`
                    : "Generar menu semanal"}
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-7xl px-5 py-8">
            <MenuGenerationBanner feedback={menuGenerationFeedback} />

            {activeView === "dashboard" ? (
              <DashboardView
                currentMenuDayIndex={currentMenuDayIndex}
                dashboardDays={dashboardDays}
                expiringIngredients={expiringIngredients}
                ingredientCount={ingredients.length}
                latestRecipes={latestRecipes}
                loading={loading}
                menu={menu}
                onReplace={replaceItem}
                quickStats={quickStats}
                setActiveView={setActiveView}
              />
            ) : null}

            {activeView === "menu" ? (
              <MenuView
                generationButtonLabel={
                  isGeneratingMenu
                    ? "Generando menu semanal..."
                    : generationCooldownActive
                      ? `Reintentar en ${menuGenerationFeedback.cooldownSeconds}s`
                      : "Regenerar menu"
                }
                generationDisabled={loading || generationCooldownActive}
                generationInProgress={isGeneratingMenu}
                groupedMenu={groupedMenu}
                hasIngredients={ingredients.length > 0}
                loading={loading}
                menu={menu}
                onGenerate={requestGenerateMenu}
                onReplace={replaceItem}
                onUseSavedRecipe={useSavedRecipe}
                recipes={recipes}
                selectedRecipes={selectedRecipes}
                setSelectedRecipes={setSelectedRecipes}
              />
            ) : null}

            {activeView === "ingredients" ? (
              <IngredientsView
                categories={ingredientCategoryFilters}
                category={ingredientCategory}
                categoryOptions={ingredientCategoryOptions}
                filteredIngredients={filteredIngredients}
                filtersOpen={ingredientFiltersOpen}
                loading={loading}
                onAddDemoIngredients={addDemoIngredients}
                onDelete={deleteIngredient}
                onOpenAdd={() => {
                  setIngredientForm(buildDefaultIngredientForm(ingredientCategoryOptions));
                  setIngredientModalOpen(true);
                }}
                query={ingredientQuery}
                setCategory={setIngredientCategory}
                setFiltersOpen={setIngredientFiltersOpen}
                setQuery={setIngredientQuery}
                setSort={setIngredientSort}
                sort={ingredientSort}
                total={ingredients.length}
              />
            ) : null}

            {activeView === "recipes" ? (
              <RecipesView
                filteredRecipes={filteredRecipes}
                difficultyFilter={recipeDifficultyFilter}
                loading={loading}
                onDeleteRecipe={deleteRecipe}
                onOpenRecipe={openRecipeDetail}
                onOpenCreateRecipe={() => {
                  setRecipeForm(buildEmptyRecipeForm());
                  setRecipeModalOpen(true);
                }}
                onToggleFavorite={toggleFavoriteRecipe}
                recipeFilter={recipeFilter}
                recipeTags={recipeTags}
                setDifficultyFilter={setRecipeDifficultyFilter}
                setRecipeFilter={setRecipeFilter}
                setTagFilter={setRecipeTagFilter}
                setTimeFilter={setRecipeTimeFilter}
                tagFilter={recipeTagFilter}
                timeFilter={recipeTimeFilter}
                totalRecipes={recipes.length}
              />
            ) : null}

            {activeView === "recipeDetail" ? (
              <RecipeDetailView
                aiEnabled={Boolean(aiStatus?.configured)}
                imageResolutionPending={resolvingRecipeImageId === selectedRecipeId}
                loading={loading}
                onBack={() => setActiveView("recipes")}
                onResolveRecipeImage={resolveRecipeImage}
                onUpdateRecipe={updateRecipe}
                onUseInMenu={useRecipeFromDetail}
                recipe={selectedRecipe}
              />
            ) : null}

            {activeView === "preferences" ? (
              <PreferencesView
                ingredients={ingredients}
                loading={loading}
                message={message}
                onGoToIngredients={() => setActiveView("ingredients")}
                onSave={savePreferences}
                preferencesSummary={preferences}
                setSettings={setPreferenceSettings}
                settings={preferenceSettings}
              />
            ) : null}
          </div>
        </div>
      </div>
      <GenerationGuardModal
        guard={generationGuard}
        ingredientCount={ingredients.length}
        loading={loading}
        onAddDemoIngredients={addDemoIngredientsFromGuard}
        onCancel={() => setGenerationGuard(null)}
        onContinueFallback={continueWithFallback}
        onGoToIngredients={() => {
          setGenerationGuard(null);
          setActiveView("ingredients");
        }}
        onGoToPreferences={() => {
          setGenerationGuard(null);
          setActiveView("preferences");
        }}
        usableIngredientCount={usableIngredients.length}
      />
      <IngredientModal
        categories={ingredientCategoryOptions}
        form={ingredientForm}
        loading={loading}
        onCancel={() => setIngredientModalOpen(false)}
        onSubmit={addIngredient}
        open={ingredientModalOpen}
        setForm={setIngredientForm}
      />
      <RecipeModal
        form={recipeForm}
        loading={loading}
        onCancel={() => setRecipeModalOpen(false)}
        onSubmit={createRecipe}
        open={recipeModalOpen}
        setForm={setRecipeForm}
      />
    </main>
  );
}

function GenerationGuardModal({
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/35 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="generation-guard-title">
      <div className="w-full max-w-lg rounded-lg border border-line bg-white p-6 shadow-[0_24px_80px_rgba(31,37,34,0.24)]">
        <p className="text-sm font-semibold uppercase text-leaf">Antes de generar</p>
        <h2 id="generation-guard-title" className="mt-2 text-2xl font-bold">
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
                Anadir ingredientes de prueba
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

function MenuGenerationBanner({ feedback }: { feedback: MenuGenerationFeedback }) {
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
      <span className="mt-1 inline-flex h-4 w-4 animate-spin rounded-full border-2 border-leaf/25 border-t-leaf" aria-hidden="true" />
    ) : (
      <span
        className={`mt-1 inline-flex h-4 w-4 rounded-full ${
          feedback.phase === "success"
            ? "bg-leaf"
            : feedback.phase === "rate_limited"
              ? "bg-yolk"
              : "bg-tomato"
        }`}
        aria-hidden="true"
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

function IngredientModal({
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/35 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="ingredient-modal-title">
      <form className="w-full max-w-xl rounded-lg border border-line bg-white p-6 shadow-[0_24px_80px_rgba(31,37,34,0.24)]" onSubmit={onSubmit}>
        <p className="text-sm font-semibold uppercase text-leaf">Nevera</p>
        <h2 id="ingredient-modal-title" className="mt-2 text-2xl font-bold">
          Anadir ingrediente
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          Registra alimentos reales para que el menu semanal pueda priorizar disponibilidad y caducidad.
        </p>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-ink/70">
            Nombre
            <input
              className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
              placeholder="Ej: Tomate"
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-ink/70">
            Categoria
            <select
              className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
              disabled={!categories.length}
              required
              value={form.categoryId}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
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
                placeholder="Ej: 500 g"
                value={form.quantity}
                onChange={(event) => setForm({ ...form, quantity: event.target.value })}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-ink/70">
              Fecha de caducidad
              <input
                className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
                type="date"
                value={form.expiresAt}
                onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
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

function RecipeModal({
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
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/35 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="recipe-modal-title">
      <form className="w-full max-w-4xl rounded-lg border border-line bg-white p-6 shadow-[0_24px_80px_rgba(31,37,34,0.24)]" onSubmit={submitRecipe}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-leaf">Recetario</p>
            <h2 id="recipe-modal-title" className="mt-2 text-2xl font-bold">
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
                placeholder="Ej: Ensalada templada de garbanzos"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-ink/70">
              Foto
              <input
                className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
                placeholder="https://images.unsplash.com/..."
                value={form.imageUrl}
                onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-semibold text-ink/70">
            Descripcion
            <textarea
              className="min-h-24 rounded-lg border border-line bg-paper px-3 py-3 font-normal leading-6 text-ink"
              placeholder="Plato rapido, saciante y facil de adaptar con verduras de temporada."
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold text-ink/70">
              Tiempo estimado
              <input
                className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
                min={5}
                type="number"
                value={form.prepTimeMinutes}
                onChange={(event) => setForm({ ...form, prepTimeMinutes: event.target.value })}
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-ink/70">
              Dificultad
              <select
                className="rounded-lg border border-line bg-paper px-3 py-3 font-normal text-ink"
                value={form.difficulty}
                onChange={(event) => setForm({ ...form, difficulty: event.target.value })}
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
                type="number"
                value={form.servings}
                onChange={(event) => setForm({ ...form, servings: event.target.value })}
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
                Anadir ingrediente
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {form.ingredients.map((ingredient, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
                  <input
                    className="rounded-lg border border-line bg-white px-3 py-2"
                    placeholder="Ingrediente"
                    value={ingredient.name}
                    onChange={(event) => updateIngredient(index, "name", event.target.value)}
                  />
                  <input
                    className="rounded-lg border border-line bg-white px-3 py-2"
                    placeholder="Cantidad"
                    value={ingredient.quantity}
                    onChange={(event) => updateIngredient(index, "quantity", event.target.value)}
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
                <div key={index} className="grid gap-2 md:grid-cols-[40px_1fr_auto]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-leaf/10 text-sm font-semibold text-leaf">{index + 1}</span>
                  <textarea
                    className="min-h-20 rounded-lg border border-line bg-white px-3 py-2 text-sm leading-6"
                    placeholder="Describe este paso"
                    value={step}
                    onChange={(event) => updateStep(index, event.target.value)}
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
              placeholder="rapida, legumbres, aprovechamiento"
              value={form.tagsText}
              onChange={(event) => setForm({ ...form, tagsText: event.target.value })}
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

function MissingRecipeState({
  compact = false,
  loading,
  onReplace,
}: {
  compact?: boolean;
  loading: boolean;
  onReplace: () => void;
}) {
  return (
    <div className={compact ? "mt-2 rounded-lg border border-tomato/20 bg-tomato/5 p-3" : "rounded-lg border border-dashed border-tomato/30 bg-white p-4"}>
      <p className={compact ? "text-sm font-semibold text-ink" : "font-semibold text-ink"}>Plato no disponible</p>
      <p className={compact ? "mt-1 text-xs leading-5 text-ink/65" : "mt-2 text-sm leading-6 text-ink/70"}>
        Esta receta ya no esta disponible.
      </p>
      <button
        className={compact
          ? "mt-3 rounded-lg border border-tomato px-3 py-2 text-xs font-semibold text-tomato disabled:opacity-60"
          : "mt-4 rounded-lg bg-leaf px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"}
        disabled={loading}
        onClick={onReplace}
        type="button"
      >
        Sustituir plato
      </button>
    </div>
  );
}

function DashboardView({
  currentMenuDayIndex,
  dashboardDays,
  expiringIngredients,
  ingredientCount,
  latestRecipes,
  loading,
  menu,
  onReplace,
  quickStats,
  setActiveView,
}: {
  currentMenuDayIndex: number | null;
  dashboardDays: [number, MenuItem[]][];
  expiringIngredients: Ingredient[];
  ingredientCount: number;
  latestRecipes: Recipe[];
  loading: boolean;
  menu: WeeklyMenu | null;
  onReplace: (itemId: string) => void;
  quickStats: { label: string; value: string; detail: string }[];
  setActiveView: (view: ViewId) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-stretch">
        <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <p className="text-sm font-semibold uppercase text-leaf">Dashboard</p>
          <h2 className="mt-2 text-3xl font-bold leading-tight">Menu distinto cada semana con tu nevera actual</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">
            Revisa ingredientes, preferencias, recetas guardadas y el ultimo menu antes de generar una nueva semana.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="rounded-lg bg-leaf px-5 py-3 font-semibold text-white" onClick={() => setActiveView("menu")} type="button">
              Ver menu semanal
            </button>
            <button className="rounded-lg border border-line px-5 py-3 font-semibold hover:border-leaf hover:text-leaf" onClick={() => setActiveView("ingredients")} type="button">
              Revisar nevera
            </button>
          </div>
        </div>
        <img
          className="h-64 w-full rounded-lg object-cover shadow-soft lg:h-full"
          src="https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=80"
          alt="Verduras y platos preparados sobre una mesa"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Resumen del plan">
        {quickStats.map((stat) => (
          <article key={stat.label} className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <p className="text-sm font-semibold text-ink/65">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold">{stat.value}</p>
            <p className="mt-2 text-sm leading-6 text-ink/70">{stat.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-leaf">Vista rapida</p>
              <h2 className="text-2xl font-semibold">Menu de la semana</h2>
            </div>
            <button className="text-left text-sm font-semibold text-leaf hover:text-ink" onClick={() => setActiveView("menu")} type="button">
              Ver semana completa
            </button>
          </div>

          {dashboardDays.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-paper p-5 text-sm leading-6 text-ink/75">
              Genera una primera semana para llenar esta vista.
            </div>
          ) : (
            <div className="grid gap-3">
              {dashboardDays.map(([dayIndex, items]) => {
                const isToday = currentMenuDayIndex === dayIndex;
                return (
                  <article
                    key={dayIndex}
                    className={`grid gap-3 rounded-lg border p-4 transition md:grid-cols-[130px_1fr] ${
                      isToday ? "border-leaf bg-leaf/5 shadow-soft" : "border-line bg-paper"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 md:block">
                      <p className="font-semibold">{items[0]?.day_name}</p>
                      {isToday ? (
                        <span className="mt-2 inline-flex rounded-lg bg-leaf px-2 py-1 text-xs font-semibold text-white">
                          Hoy
                        </span>
                      ) : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[...items].sort((left, right) => mealRank(left.meal_type) - mealRank(right.meal_type)).map((item) => (
                        <div key={item.id} className={`rounded-lg border bg-white px-3 py-2 ${isToday ? "border-leaf/30" : "border-line"}`}>
                          <p className="text-xs font-semibold uppercase text-leaf">{item.meal_type}</p>
                          {item.recipe ? (
                            <p className="mt-1 text-sm font-semibold">{item.recipe.title}</p>
                          ) : (
                            <MissingRecipeState compact loading={loading} onReplace={() => onReplace(item.id)} />
                          )}
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-5">
          <div className="rounded-lg border border-leaf/20 bg-white p-5 shadow-soft">
            <p className="text-sm font-semibold uppercase text-leaf">Sugerencias IA</p>
            <p className="mt-3 text-sm leading-6 text-ink/75">
              {menu?.notes || "Empieza cargando ingredientes y evita repetir platos recientes."}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-white p-5">
            <p className="font-semibold">Ingredientes listos</p>
            {ingredientCount === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-line bg-paper p-4 text-sm leading-6 text-ink/75">
                <p>No has introducido ingredientes todavia.</p>
                <p className="mt-2">Revisa la nevera o genera el menu para ver las opciones disponibles.</p>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {expiringIngredients.map((ingredient) => (
                  <span key={ingredient.id} className="rounded border border-line bg-paper px-3 py-2 text-sm">
                    {ingredient.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-line bg-white p-5">
            <p className="font-semibold">Recetas recientes</p>
            <div className="mt-3 grid gap-3">
              {latestRecipes.length === 0 ? (
                <p className="text-sm text-ink/70">Aun no hay recetas guardadas.</p>
              ) : (
                latestRecipes.map((recipe) => (
                  <div key={recipe.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-semibold">{recipe.title}</p>
                    <p className="mt-1 text-xs text-ink/65">{recipe.prep_time_minutes} min</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MenuView({
  generationButtonLabel,
  generationDisabled,
  generationInProgress,
  groupedMenu,
  hasIngredients,
  loading,
  menu,
  onGenerate,
  onReplace,
  onUseSavedRecipe,
  recipes,
  selectedRecipes,
  setSelectedRecipes,
}: {
  generationButtonLabel: string;
  generationDisabled: boolean;
  generationInProgress: boolean;
  groupedMenu: [number, MenuItem[]][];
  hasIngredients: boolean;
  loading: boolean;
  menu: WeeklyMenu | null;
  onGenerate: () => void;
  onReplace: (itemId: string) => void;
  onUseSavedRecipe: (itemId: string) => void;
  recipes: Recipe[];
  selectedRecipes: Record<string, string>;
  setSelectedRecipes: (value: Record<string, string>) => void;
}) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-line pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-leaf">Plan semanal</p>
          <h2 className="text-2xl font-semibold">Comida y cena de lunes a domingo</h2>
          <p className="mt-1 text-sm text-ink/70">
            {menu ? `Semana del ${menu.week_start_date}` : "Genera tu primera propuesta."}
          </p>
        </div>
        <button className="rounded-lg bg-leaf px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={generationDisabled} onClick={onGenerate} type="button">
          {generationButtonLabel}
        </button>
      </div>

      {!menu ? (
        <div className="rounded-lg border border-dashed border-line bg-white p-8 text-ink/75 shadow-soft">
          {generationInProgress ? (
            <div className="flex items-start gap-3">
              <span className="mt-1 inline-flex h-5 w-5 animate-spin rounded-full border-2 border-leaf/25 border-t-leaf" aria-hidden="true" />
              <div>
                <p className="font-semibold text-ink">Generando menu semanal...</p>
                <p className="mt-2 text-sm leading-6 text-ink/70">
                  Estamos consultando Gemini y validando los platos para completar los 14 huecos de la semana.
                </p>
              </div>
            </div>
          ) : hasIngredients ? (
            <p>Genera una primera semana usando los ingredientes guardados en la nevera.</p>
          ) : (
            <p>No has introducido ingredientes todavia. Pulsa "Generar menu semanal" para ver las opciones disponibles.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-5">
          {groupedMenu.map(([dayIndex, items]) => (
            <div key={dayIndex} className="rounded-lg border border-line bg-white p-5 shadow-soft">
              <div className="grid gap-4 lg:grid-cols-[120px_1fr]">
                <div>
                  <p className="text-sm font-semibold uppercase text-leaf">Dia</p>
                  <h3 className="mt-1 text-xl font-semibold">{items[0]?.day_name}</h3>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {[...items].sort((left, right) => mealRank(left.meal_type) - mealRank(right.meal_type)).map((item) => (
                    <article key={item.id} className="rounded-lg border border-line bg-paper p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase text-leaf">{item.meal_type}</p>
                          <h4 className="mt-1 text-lg font-semibold">{item.recipe?.title ?? "Plato no disponible"}</h4>
                        </div>
                        {item.recipe ? (
                          <span className="rounded bg-yolk px-2 py-1 text-xs font-semibold">
                            {item.recipe.prep_time_minutes} min
                          </span>
                        ) : null}
                      </div>
                      {item.recipe ? (
                        <>
                          <p className="text-sm leading-6 text-ink/75">{item.recipe.description}</p>
                          <div className="mt-3 rounded-lg border border-leaf/20 bg-white px-3 py-2">
                            <p className="text-xs font-semibold uppercase text-leaf">Por que este plato</p>
                            <p className="mt-1 text-sm leading-6 text-ink/75">{item.explanation}</p>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.recipe.tags.map((tag) => (
                              <span key={tag} className="rounded border border-line bg-white px-2 py-1 text-xs">
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="mt-4 grid gap-2">
                            <button
                              className="rounded-lg border border-tomato px-3 py-2 text-sm font-semibold text-tomato disabled:opacity-60"
                              disabled={loading}
                              onClick={() => onReplace(item.id)}
                              type="button"
                            >
                              Sustituir plato
                            </button>
                            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                              <select
                                className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
                                value={selectedRecipes[item.id] ?? ""}
                                onChange={(event) => setSelectedRecipes({ ...selectedRecipes, [item.id]: event.target.value })}
                              >
                                <option value="">Repetir receta guardada</option>
                                {recipes.map((recipe) => (
                                  <option key={recipe.id} value={recipe.id}>
                                    {recipe.title}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                                disabled={loading || !selectedRecipes[item.id]}
                                onClick={() => onUseSavedRecipe(item.id)}
                                type="button"
                              >
                                Usar
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <MissingRecipeState loading={loading} onReplace={() => onReplace(item.id)} />
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function IngredientsView({
  categories,
  category,
  categoryOptions,
  filteredIngredients,
  filtersOpen,
  loading,
  onAddDemoIngredients,
  onDelete,
  onOpenAdd,
  query,
  setCategory,
  setFiltersOpen,
  setQuery,
  setSort,
  sort,
  total,
}: {
  categories: string[];
  category: string;
  categoryOptions: IngredientCategory[];
  filteredIngredients: Ingredient[];
  filtersOpen: boolean;
  loading: boolean;
  onAddDemoIngredients: () => void;
  onDelete: (id: string) => void;
  onOpenAdd: () => void;
  query: string;
  setCategory: (category: string) => void;
  setFiltersOpen: (open: boolean) => void;
  setQuery: (query: string) => void;
  setSort: (sort: IngredientSort) => void;
  sort: IngredientSort;
  total: number;
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-leaf">Nevera</p>
            <h2 className="mt-1 text-2xl font-semibold">Ingredientes disponibles</h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              {total} ingredientes registrados. La generacion del menu usa esta nevera y prioriza los productos mas urgentes.
            </p>
          </div>
          <button className="rounded-lg bg-leaf px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={loading} onClick={onOpenAdd} type="button">
            Anadir ingrediente
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
          <input
            className="w-full rounded-lg border border-line bg-paper px-3 py-3"
            placeholder="Buscar por nombre o categoria"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className={`rounded-lg border px-4 py-3 font-semibold ${
              filtersOpen ? "border-leaf bg-leaf text-white" : "border-line bg-paper text-ink/75 hover:border-leaf hover:text-leaf"
            }`}
            onClick={() => setFiltersOpen(!filtersOpen)}
            type="button"
          >
            Filtros
          </button>
        </div>

        {filtersOpen ? (
          <div className="mt-5 grid gap-5 rounded-lg border border-line bg-paper p-4 lg:grid-cols-[1fr_260px]">
            <div>
              <p className="text-xs font-semibold uppercase text-ink/55">Categoria</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {categories.map((item) => (
                  <button
                    key={item}
                    className={`rounded border px-3 py-2 text-sm font-semibold ${
                      category === item ? "border-leaf bg-leaf text-white" : "border-line bg-white text-ink/75 hover:border-leaf hover:text-leaf"
                    }`}
                    onClick={() => setCategory(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <label className="grid gap-2 text-sm font-semibold text-ink/70">
              Ordenar por
              <select
                className="rounded-lg border border-line bg-white px-3 py-3 font-normal text-ink"
                value={sort}
                onChange={(event) => setSort(event.target.value as IngredientSort)}
              >
                {ingredientSortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-white p-6 text-ink/75 shadow-soft">
          <p className="text-lg font-semibold text-ink">No has introducido ingredientes todavia.</p>
          <p className="mt-2 text-sm leading-6">Anade ingredientes manualmente o carga algunos de prueba en la base de datos.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="rounded-lg bg-leaf px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={loading} onClick={onOpenAdd} type="button">
              Anadir ingrediente
            </button>
            <button
              className="rounded-lg border border-line px-4 py-3 font-semibold text-ink/70 hover:border-leaf hover:text-leaf disabled:opacity-60"
              disabled={loading}
              onClick={onAddDemoIngredients}
              type="button"
            >
              Anadir ingredientes de prueba
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredIngredients.map((ingredient) => {
            const expiryLabel = getIngredientExpiryLabel(ingredient.expires_at);
            const expiryTone =
              expiryLabel === "Caducado"
                ? "border-tomato/40 bg-tomato/10 text-tomato"
                : expiryLabel === "Caduca pronto"
                  ? "border-yolk bg-yolk/35 text-ink"
                  : "border-leaf/20 bg-leaf/10 text-leaf";
            return (
              <article key={ingredient.id} className="rounded-lg border border-line bg-white p-4 shadow-soft transition hover:-translate-y-1 hover:border-leaf hover:shadow-[0_18px_50px_rgba(31,37,34,0.12)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">{ingredient.name}</h3>
                    <p className="mt-1 text-sm text-ink/65">{ingredient.quantity || "Sin cantidad"}</p>
                  </div>
                  {ingredient.category ? <span className="rounded bg-yolk px-2 py-1 text-xs font-semibold">{ingredient.category}</span> : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className={`rounded border px-2 py-1 text-xs font-semibold ${expiryTone}`}>{expiryLabel}</span>
                  <span className="rounded border border-line bg-paper px-2 py-1 text-xs font-semibold text-ink/65">
                    {formatIngredientExpiry(ingredient.expires_at)}
                  </span>
                </div>
                <button
                  className="mt-4 rounded-lg border border-tomato px-3 py-2 text-sm font-semibold text-tomato disabled:opacity-60"
                  disabled={loading}
                  onClick={() => onDelete(ingredient.id)}
                  type="button"
                >
                  Eliminar
                </button>
              </article>
            );
          })}
        </div>
      )}

      {total > 0 && filteredIngredients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-white p-6 text-ink/75">
          No hay ingredientes que coincidan con el filtro.
        </div>
      ) : null}
      {categoryOptions.length === 0 ? (
        <div className="rounded-lg border border-yolk bg-yolk/20 p-4 text-sm text-ink/75">
          No se han cargado categorias todavia. Revisa la conexion con la API antes de anadir ingredientes.
        </div>
      ) : null}
    </section>
  );
}

function RecipesView({
  difficultyFilter,
  filteredRecipes,
  loading,
  onDeleteRecipe,
  onOpenRecipe,
  onOpenCreateRecipe,
  onToggleFavorite,
  recipeFilter,
  recipeTags,
  setDifficultyFilter,
  setRecipeFilter,
  setTagFilter,
  setTimeFilter,
  tagFilter,
  timeFilter,
  totalRecipes,
}: {
  difficultyFilter: string;
  filteredRecipes: Recipe[];
  loading: boolean;
  onDeleteRecipe: (recipeId: string) => void;
  onOpenRecipe: (recipe: Recipe) => void;
  onOpenCreateRecipe: () => void;
  onToggleFavorite: (recipe: Recipe, event?: { stopPropagation: () => void }) => void;
  recipeFilter: string;
  recipeTags: string[];
  setDifficultyFilter: (filter: string) => void;
  setRecipeFilter: (filter: string) => void;
  setTagFilter: (filter: string) => void;
  setTimeFilter: (filter: string) => void;
  tagFilter: string;
  timeFilter: string;
  totalRecipes: number;
}) {
  const hasFilters = recipeFilter || tagFilter !== "Todas" || difficultyFilter !== "Todas" || timeFilter !== "Todos";
  const activeFilterCount = [tagFilter !== "Todas", difficultyFilter !== "Todas", timeFilter !== "Todos"].filter(Boolean).length;
  const [showFilters, setShowFilters] = useState(false);

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold uppercase text-leaf">Biblioteca</p>
            <h2 className="text-2xl font-semibold">Recetas guardadas</h2>
            <p className="text-sm text-ink/70">
              {filteredRecipes.length} de {totalRecipes} recetas disponibles
            </p>
            <p className="text-xs leading-5 text-ink/55">
              Las imagenes reales se resuelven bajo demanda al abrir una receta o desde su ficha. La grid no lanza busquedas automaticas para no gastar cuota de Gemini.
            </p>
          </div>
          <button className="rounded-lg bg-leaf px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={loading} onClick={onOpenCreateRecipe} type="button">
            Anadir receta
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
          <label className="relative block" htmlFor="recipe-search">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/45" aria-hidden="true">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="m21 21-4.3-4.3" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="11" cy="11" r="7" />
              </svg>
            </span>
            <input
              id="recipe-search"
              className="min-h-12 w-full rounded-lg border border-line bg-paper px-4 py-2 pl-12"
              placeholder="Buscar recetas, ingredientes o etiquetas"
              value={recipeFilter}
              onChange={(event) => setRecipeFilter(event.target.value)}
            />
          </label>

          <button
            aria-expanded={showFilters}
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-5 py-2 font-semibold transition ${
              showFilters || activeFilterCount
                ? "border-leaf bg-leaf text-white"
                : "border-line bg-white text-ink hover:border-leaf hover:text-leaf"
            }`}
            onClick={() => setShowFilters((current) => !current)}
            type="button"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Filtros
            {activeFilterCount ? <span className="rounded bg-white/20 px-2 py-0.5 text-xs">{activeFilterCount}</span> : null}
          </button>
        </div>

        {showFilters ? (
          <div className="mt-5 rounded-lg border border-line bg-paper p-4">
            {recipeTags.length ? (
              <div>
                <p className="text-xs font-semibold uppercase text-ink/60">Etiquetas</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recipeTags.map((tag) => (
                    <button
                      key={tag}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        tagFilter === tag
                          ? "border-leaf bg-leaf text-white"
                          : "border-line bg-white text-ink/70 hover:border-leaf hover:text-leaf"
                      }`}
                      onClick={() => setTagFilter(tag)}
                      type="button"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-ink/60">Dificultad</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recipeDifficultyOptions.map((difficulty) => (
                    <button
                      key={difficulty}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        difficultyFilter === difficulty
                          ? "border-leaf bg-leaf text-white"
                          : "border-line bg-white text-ink/70 hover:border-leaf hover:text-leaf"
                      }`}
                      onClick={() => setDifficultyFilter(difficulty)}
                      type="button"
                    >
                      {difficulty}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-ink/60">Tiempo</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recipeTimeOptions.map((time) => (
                    <button
                      key={time}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        timeFilter === time
                          ? "border-leaf bg-leaf text-white"
                          : "border-line bg-white text-ink/70 hover:border-leaf hover:text-leaf"
                      }`}
                      onClick={() => setTimeFilter(time)}
                      type="button"
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {hasFilters ? (
              <button
                className="mt-5 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink/70 hover:border-tomato hover:text-tomato"
                onClick={() => {
                  setRecipeFilter("");
                  setTagFilter("Todas");
                  setDifficultyFilter("Todas");
                  setTimeFilter("Todos");
                }}
                type="button"
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {filteredRecipes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-white p-8 text-ink/75 shadow-soft">
          {totalRecipes === 0
            ? "Genera un menu o anade tu primera receta manual para llenar el recetario."
            : "No hay recetas que coincidan con los filtros actuales."}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {filteredRecipes.map((recipe) => {
            const difficulty = getRecipeDifficulty(recipe.prep_time_minutes, recipe.difficulty);
            return (
              <article
                key={recipe.id}
                className="group cursor-pointer overflow-hidden rounded-lg border border-line bg-white shadow-soft transition duration-200 ease-out hover:-translate-y-1 hover:border-leaf/60 hover:shadow-[0_18px_38px_rgba(31,37,34,0.14)] focus:outline-none focus:ring-2 focus:ring-leaf/40"
                onClick={() => onOpenRecipe(recipe)}
                onKeyDown={(event) => {
                  if (event.currentTarget !== event.target) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenRecipe(recipe);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="relative h-44 overflow-hidden bg-leaf/10">
                  <div className="h-full w-full transition duration-500 ease-out group-hover:scale-105">
                    <RecipeVisualSurface compact recipe={recipe} />
                  </div>
                  <div className="absolute inset-0 bg-ink/0 transition duration-300 group-hover:bg-ink/10" />
                  {recipe.is_favorite ? (
                    <span
                      aria-label="Receta favorita"
                      className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-lg text-tomato shadow-soft transition duration-200 group-hover:-translate-y-0.5"
                      title="Receta favorita"
                    >
                      ♥
                    </span>
                  ) : null}
                </div>

                <div className="p-5 transition duration-200 group-hover:bg-paper/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {recipe.source === "manual" ? (
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-leaf">Receta propia</p>
                      ) : null}
                      <h3 className="text-xl font-semibold leading-tight">{recipe.title}</h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink/70">{recipe.description}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-sm">
                    <span className="rounded-lg border border-line bg-paper px-3 py-1 font-semibold text-ink/70">
                      {recipe.prep_time_minutes} min
                    </span>
                    <span className="rounded-lg bg-leaf/10 px-3 py-1 font-semibold text-leaf">{difficulty}</span>
                  </div>

                  <p className="mt-4 text-sm font-semibold">Ingredientes clave</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink/70">{recipe.ingredients.slice(0, 5).join(", ")}</p>

                  <div className="mt-4 flex min-h-8 flex-wrap gap-2">
                    {recipe.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="rounded-lg border border-line bg-paper px-2 py-1 text-xs font-semibold text-ink/65">
                        {tag}
                      </span>
                    ))}
                    {recipe.tags.length > 4 ? (
                      <span className="rounded-lg border border-line bg-paper px-2 py-1 text-xs font-semibold text-ink/65">
                        +{recipe.tags.length - 4}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    <button
                      className="rounded-lg bg-leaf px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      disabled={loading}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenRecipe(recipe);
                      }}
                      type="button"
                    >
                      Ver receta
                    </button>
                    <button
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                        recipe.is_favorite
                          ? "border-tomato bg-tomato/10 text-tomato"
                          : "border-line text-ink/70 hover:border-tomato hover:text-tomato"
                      }`}
                      disabled={loading}
                      onClick={(event) => onToggleFavorite(recipe, event)}
                      type="button"
                    >
                      {recipe.is_favorite ? "Favorita" : "Favorito"}
                    </button>
                    <button
                      className="rounded-lg border border-tomato px-3 py-2 text-sm font-semibold text-tomato disabled:opacity-60"
                      disabled={loading}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteRecipe(recipe.id);
                      }}
                      type="button"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RecipeDetailView({
  aiEnabled,
  imageResolutionPending,
  loading,
  onBack,
  onResolveRecipeImage,
  onUpdateRecipe,
  onUseInMenu,
  recipe,
}: {
  aiEnabled: boolean;
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

  useEffect(() => {
    setIsEditing(false);
    setLocalError("");
    setAutoResolveRequestedFor(null);
  }, [recipe?.id]);

  useEffect(() => {
    setDraft(recipe ? buildRecipeEditForm(recipe) : null);
  }, [recipe]);

  useEffect(() => {
    if (!recipe || !aiEnabled || imageResolutionPending) return;
    if (autoResolveRequestedFor === recipe.id) return;
    if (!canAutoResolveRecipeImage(recipe)) return;
    setAutoResolveRequestedFor(recipe.id);
    void onResolveRecipeImage(recipe.id);
  }, [aiEnabled, autoResolveRequestedFor, imageResolutionPending, onResolveRecipeImage, recipe]);

  const imageRetryCountdown =
    !imageResolutionPending && (recipe?.image_lookup_status === "rate_limited" || recipe?.image_lookup_status === "upstream_error")
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
  const canResolveImage = aiEnabled && !getRecipeImage(recipe) && !isEditing;
  const imageRetryLabel = imageRetryCountdown ? formatRetryCountdown(imageRetryCountdown) : null;
  const imageActionLabel =
    imageRetryLabel
      ? `Reintentar en ${imageRetryLabel}`
      : recipe.image_lookup_status === "invalid" || recipe.image_lookup_status === "not_found" || recipe.image_lookup_status === "upstream_error" || recipe.image_lookup_status === "rate_limited"
      ? "Reintentar imagen real"
      : "Buscar imagen real";
  const detailImageStatus = imageResolutionPending ? "Buscando imagen real" : getRecipeImageStatus(recipe);
  const detailImageCaption = imageResolutionPending
    ? "Estamos buscando una imagen real a partir de una pagina fuente relevante para esta receta."
    : getRecipeImageCaption(recipe);
  const detailImageAltText = imageResolutionPending
    ? "Buscando una imagen real para esta receta."
    : getRecipeAltText(recipe);
  const detailImageReason = imageResolutionPending
    ? "Consultando la pagina fuente propuesta por la IA y validando que la imagen sea real y reutilizable."
    : imageRetryLabel && recipe.image_lookup_status === "rate_limited"
      ? `La resolucion de imagenes esta pausada temporalmente por saturacion de Gemini. Reintento disponible en ${imageRetryLabel}.`
      : imageRetryLabel && recipe.image_lookup_status === "upstream_error"
        ? `La resolucion de imagen encontro un error temporal. Conviene esperar ${imageRetryLabel} antes de reintentar.`
    : getRecipeImageReason(recipe);
  const detailImageSourceUrl = imageResolutionPending ? null : getRecipeImageSourceUrl(recipe);

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
                    value={draft.title}
                    onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-ink/70">
                  Descripcion
                  <textarea
                    className="min-h-24 rounded-lg border border-line bg-paper px-4 py-3 text-sm font-normal leading-6 text-ink"
                    value={draft.description}
                    onChange={(event) => setDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-ink/70">
                  Foto
                  <input
                    className="rounded-lg border border-line bg-paper px-4 py-3 text-sm font-normal text-ink"
                    placeholder="https://images.unsplash.com/..."
                    value={draft.imageUrl}
                    onChange={(event) => setDraft((current) => (current ? { ...current, imageUrl: event.target.value } : current))}
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
                    type="number"
                    value={draft.prepTimeMinutes}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, prepTimeMinutes: event.target.value } : current))
                    }
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
                    value={draft.difficulty}
                    onChange={(event) => setDraft((current) => (current ? { ...current, difficulty: event.target.value } : current))}
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
                    type="number"
                    value={draft.servings}
                    onChange={(event) => setDraft((current) => (current ? { ...current, servings: event.target.value } : current))}
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
                <button className="rounded-lg border border-line px-5 py-3 font-semibold text-ink/70" onClick={() => {
                  setIsEditing(false);
                  setLocalError("");
                  setDraft(buildRecipeEditForm(recipe));
                }} type="button">
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
              <RecipeVisualSurface loading={imageResolutionPending} recipe={recipe} />
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
                  value={draft.tagsText}
                  onChange={(event) => setDraft((current) => (current ? { ...current, tagsText: event.target.value } : current))}
                />
              </label>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {recipe.tags.length ? (
                  recipe.tags.map((tag) => (
                    <span key={tag} className="rounded-lg border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink/70">
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
                <span className="text-xs font-semibold uppercase text-ink/55">
                  {detailImageStatus}
                </span>
                {canResolveImage ? (
                  <button
                    className="rounded-lg border border-leaf px-3 py-2 text-xs font-semibold text-leaf disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={imageResolutionPending || loading || Boolean(imageRetryLabel)}
                    onClick={() => void onResolveRecipeImage(recipe.id, true)}
                    type="button"
                  >
                    {imageResolutionPending ? "Buscando..." : imageActionLabel}
                  </button>
                ) : null}
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-ink/75">{detailImageCaption}</p>
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
                Anadir ingrediente
              </button>
            ) : null}
          </div>

          {isEditing ? (
            <div className="mt-5 grid gap-3">
              {draft.ingredients.map((ingredient, index) => (
                <div key={index} className="grid gap-2 rounded-lg border border-line bg-paper p-3 md:grid-cols-[1fr_160px_auto]">
                  <input
                    className="rounded-lg border border-line bg-white px-3 py-2"
                    placeholder="Ingrediente"
                    value={ingredient.name}
                    onChange={(event) => updateIngredient(index, "name", event.target.value)}
                  />
                  <input
                    className="rounded-lg border border-line bg-white px-3 py-2"
                    placeholder="Cantidad"
                    value={ingredient.quantity}
                    onChange={(event) => updateIngredient(index, "quantity", event.target.value)}
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
                  <div key={`${ingredient.name}-${index}`} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto]">
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
              <div key={index} className="grid gap-3 rounded-lg border border-line bg-paper p-4 md:grid-cols-[42px_1fr_auto]">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-leaf/10 text-sm font-semibold text-leaf">{index + 1}</span>
                <textarea
                  className="min-h-24 rounded-lg border border-line bg-white px-4 py-3 text-sm leading-6"
                  placeholder="Describe este paso"
                  value={step}
                  onChange={(event) => updateStep(index, event.target.value)}
                />
                <button className="rounded-lg border border-tomato px-3 py-2 text-sm font-semibold text-tomato md:self-start" onClick={() => removeStep(index)} type="button">
                  Quitar
                </button>
              </div>
            ))
          ) : recipe.steps.length ? (
            recipe.steps.map((step, index) => (
              <article key={`${step}-${index}`} className="grid gap-4 rounded-lg border border-line bg-paper p-4 md:grid-cols-[42px_1fr]">
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

function PreferencesView({
  ingredients,
  loading,
  message,
  onGoToIngredients,
  onSave,
  preferencesSummary,
  setSettings,
  settings,
}: {
  ingredients: Ingredient[];
  loading: boolean;
  message: string;
  onGoToIngredients: () => void;
  onSave: () => void;
  preferencesSummary: string;
  setSettings: (updater: (settings: PreferenceSettings) => PreferenceSettings) => void;
  settings: PreferenceSettings;
}) {
  const [excludedIngredientCategory, setExcludedIngredientCategory] = useState("Todos");
  const [excludedIngredientSearch, setExcludedIngredientSearch] = useState("");
  const excludedIngredientCategories = useMemo(() => {
    const categories = ingredients
      .map((ingredient) => ingredient.category)
      .filter((category): category is string => Boolean(category));
    return ["Todos", ...Array.from(new Set(categories)).sort((left, right) => left.localeCompare(right))];
  }, [ingredients]);
  const selectedExcludedIngredients = useMemo(
    () => settings.excludedIngredientIds.map((id) => ingredients.find((ingredient) => ingredient.id === id)).filter((ingredient): ingredient is Ingredient => Boolean(ingredient)),
    [ingredients, settings.excludedIngredientIds],
  );
  const filteredExcludedIngredients = useMemo(() => {
    const search = excludedIngredientSearch.trim().toLowerCase();
    return ingredients.filter((ingredient) => {
      const matchesSearch = !search || ingredient.name.toLowerCase().includes(search);
      const matchesCategory = excludedIngredientCategory === "Todos" || ingredient.category === excludedIngredientCategory;
      return matchesSearch && matchesCategory;
    });
  }, [excludedIngredientCategory, excludedIngredientSearch, ingredients]);

  useEffect(() => {
    if (!excludedIngredientCategories.includes(excludedIngredientCategory)) {
      setExcludedIngredientCategory("Todos");
    }
  }, [excludedIngredientCategories, excludedIngredientCategory]);

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="text-xl font-semibold">Tipo de dieta</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">Selecciona el estilo de alimentacion que prefieres</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {dietOptions.map((option) => {
            const selected = settings.dietType === option.name;
            return (
              <button
                key={option.name}
                className={`min-h-20 rounded-lg border px-4 py-4 text-left transition ${
                  selected
                    ? "border-leaf bg-leaf/5 shadow-soft"
                    : "border-line bg-white hover:border-leaf hover:bg-paper"
                }`}
                onClick={() => setSettings((current) => ({ ...current, dietType: option.name }))}
                type="button"
              >
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block font-semibold">{option.name}</span>
                    <span className="mt-2 block text-sm leading-5 text-ink/70">{option.description}</span>
                  </span>
                  {selected ? (
                    <span className="rounded border border-leaf bg-white px-2 py-1 text-xs font-semibold text-leaf">Activa</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="text-xl font-semibold">Restricciones alimentarias</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">Marca las restricciones que debemos respetar</p>
        <div className="mt-5 grid gap-3">
          {restrictionOptions.map((restriction) => (
            <label key={restriction} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-paper">
              <input
                checked={settings.restrictions.includes(restriction)}
                className="h-5 w-5 accent-leaf"
                onChange={() =>
                  setSettings((current) => ({
                    ...current,
                    restrictions: toggleListValue(current.restrictions, restriction),
                  }))
                }
                type="checkbox"
              />
              <span className="font-semibold">{restriction}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Ingredientes excluidos</h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              Marca ingredientes de tu nevera que no quieres que se usen al generar el menu.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-paper px-4 py-3 text-sm md:text-right">
            <p className="font-semibold">
              {selectedExcludedIngredients.length} ingrediente{selectedExcludedIngredients.length === 1 ? "" : "s"} excluido
              {selectedExcludedIngredients.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs text-ink/60">
              {ingredients.length ? `${filteredExcludedIngredients.length} visibles de ${ingredients.length}` : "Nevera vacia"}
            </p>
          </div>
        </div>

        {selectedExcludedIngredients.length ? (
          <div className="mt-5 rounded-lg border border-line bg-paper px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-semibold">Seleccionados</p>
              <button
                className="w-fit rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink/70 hover:border-tomato hover:text-tomato"
                onClick={() => setSettings((current) => ({ ...current, excludedIngredientIds: [] }))}
                type="button"
              >
                Limpiar seleccion
              </button>
            </div>
            <div className="mt-3 flex max-h-24 flex-wrap gap-2 overflow-y-auto pr-1">
              {selectedExcludedIngredients.map((ingredient) => (
                <button
                  key={ingredient.id}
                  className="rounded-lg bg-tomato/10 px-3 py-2 text-sm font-semibold text-tomato hover:bg-tomato hover:text-white"
                  onClick={() =>
                    setSettings((current) => ({
                      ...current,
                      excludedIngredientIds: current.excludedIngredientIds.filter((id) => id !== ingredient.id),
                    }))
                  }
                  type="button"
                >
                  {ingredient.name} x
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {ingredients.length ? (
          <>
            <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <label className="grid gap-2 text-sm font-semibold uppercase text-ink/60">
                Buscar ingrediente
                <input
                  className="min-h-11 rounded-lg border border-line bg-paper px-4 py-2 text-base font-normal normal-case text-ink outline-none transition focus:border-leaf focus:bg-white"
                  placeholder="Buscar por nombre"
                  value={excludedIngredientSearch}
                  onChange={(event) => setExcludedIngredientSearch(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {excludedIngredientCategories.map((category) => (
                  <button
                    key={category}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      excludedIngredientCategory === category
                        ? "border-leaf bg-leaf text-white"
                        : "border-line bg-white text-ink/75 hover:border-leaf hover:text-leaf"
                    }`}
                    onClick={() => setExcludedIngredientCategory(category)}
                    type="button"
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-line">
              {filteredExcludedIngredients.length ? (
                <div className="divide-y divide-line">
                  {filteredExcludedIngredients.map((ingredient) => {
                    const selected = settings.excludedIngredientIds.includes(ingredient.id);
                    return (
                      <label
                        key={ingredient.id}
                        className={`grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 transition ${
                          selected ? "bg-tomato/5" : "bg-white hover:bg-paper"
                        }`}
                      >
                        <input
                          checked={selected}
                          className="h-4 w-4 accent-tomato"
                          onChange={() =>
                            setSettings((current) => ({
                              ...current,
                              excludedIngredientIds: toggleListValue(current.excludedIngredientIds, ingredient.id),
                            }))
                          }
                          type="checkbox"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{ingredient.name}</span>
                          <span className="mt-1 flex flex-wrap gap-2 text-xs text-ink/60">
                            {ingredient.category ? <span className="rounded bg-paper px-2 py-1 font-semibold">{ingredient.category}</span> : null}
                            {ingredient.expires_at ? <span>{formatIngredientExpiry(ingredient.expires_at)}</span> : ingredient.quantity ? <span>{ingredient.quantity}</span> : null}
                          </span>
                        </span>
                        <span className={`rounded px-2 py-1 text-xs font-semibold ${selected ? "bg-tomato text-white" : "bg-paper text-ink/60"}`}>
                          {selected ? "Excluido" : "Disponible"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white p-5 text-sm leading-6 text-ink/70">
                  No hay ingredientes que coincidan con la busqueda o el filtro seleccionado.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-line bg-paper p-5">
            <p className="font-semibold">No hay ingredientes registrados</p>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              Anade ingredientes a tu nevera para poder excluirlos de la generacion del menu.
            </p>
            <button
              className="mt-4 rounded-lg bg-leaf px-4 py-3 text-sm font-semibold text-white"
              onClick={onGoToIngredients}
              type="button"
            >
              Ir a ingredientes
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="text-xl font-semibold">Objetivos</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">Que prioridades tienes al planificar tus menus?</p>
        <div className="mt-5 grid gap-3">
          {goalOptions.map((goal) => (
            <label
              key={goal}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition ${
                settings.goals.includes(goal) ? "bg-paper" : "hover:bg-paper"
              }`}
            >
              <input
                checked={settings.goals.includes(goal)}
                className="h-5 w-5 accent-leaf"
                onChange={() =>
                  setSettings((current) => ({
                    ...current,
                    goals: toggleListValue(current.goals, goal),
                  }))
                }
                type="checkbox"
              />
              <span className="font-semibold">{goal}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="text-xl font-semibold">Nivel de variedad semanal</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">Cuanta repeticion aceptas en tus menus semanales?</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {varietyOptions.map((option) => {
            const selected = settings.varietyLevel === option.name;
            return (
              <button
                key={option.name}
                className={`min-h-24 rounded-lg border px-4 py-4 text-center transition ${
                  selected
                    ? "border-leaf bg-leaf/5 shadow-soft"
                    : "border-line bg-white hover:border-leaf hover:bg-paper"
                }`}
                onClick={() => setSettings((current) => ({ ...current, varietyLevel: option.name }))}
                type="button"
              >
                <span className="block font-semibold">{option.name}</span>
                <span className="mt-2 block text-sm leading-5 text-ink/70">{option.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border border-line bg-white p-6 shadow-soft lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h2 className="text-xl font-semibold">Resumen para la IA</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">{preferencesSummary}</p>
          <p className="mt-3 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink/75">{message}</p>
        </div>
        <button className="rounded-lg bg-leaf px-6 py-3 font-semibold text-white disabled:opacity-60" disabled={loading} onClick={onSave} type="button">
          {loading ? "Trabajando..." : "Guardar cambios"}
        </button>
      </div>
    </section>
  );
}
