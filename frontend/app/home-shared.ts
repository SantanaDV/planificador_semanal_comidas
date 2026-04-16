export type Ingredient = {
  id: string;
  name: string;
  quantity?: string | null;
  category_id?: string | null;
  category?: string | null;
  expires_at?: string | null;
};

export type IngredientCategory = {
  id: string;
  name: string;
  sort_order: number;
};

export type RecipeImageCandidate = {
  image_url: string;
  image_source_url: string;
  image_alt_text?: string | null;
};

export type Recipe = {
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
  image_candidates?: RecipeImageCandidate[] | null;
  image_candidate_index?: number | null;
  image_lookup_status?: "pending" | "found" | "not_found" | "invalid" | "attempts_exhausted" | "upstream_error" | null;
  image_lookup_reason?: string | null;
  image_lookup_attempt_count?: number | null;
  image_candidate_count?: number | null;
  image_candidate_position?: number | null;
  image_can_retry?: boolean | null;
  image_lookup_attempted_at?: string | null;
  image_lookup_retry_after?: string | null;
  source: string;
  is_favorite: boolean;
};

export type MenuItem = {
  id: string;
  day_index: number;
  day_name: string;
  meal_type: string;
  explanation: string;
  recipe: Recipe | null;
};

export type WeeklyMenu = {
  id: string;
  week_start_date: string;
  ai_model: string;
  notes: string;
  generated_from_ingredients: string[];
  items: MenuItem[];
};

export type AiStatus = {
  provider: string;
  model: string;
  configured: boolean;
  mode: "ai" | "fallback";
  message: string;
  image_provider: string;
  images_enabled: boolean;
};

export type ViewId = "dashboard" | "menu" | "ingredients" | "recipes" | "recipeDetail" | "preferences";
export type LogLevel = "info" | "warning" | "error";
export type GenerationGuard = "empty" | "insufficient" | "excluded_insufficient" | "fallback" | null;
export type IngredientSort = "expiry_asc" | "expiry_desc" | "quantity_asc" | "quantity_desc";
export type MenuGenerationPhase = "idle" | "loading" | "success" | "error" | "rate_limited";

export type PreferenceSettings = {
  dietType: string;
  restrictions: string[];
  excludedIngredientIds: string[];
  goals: string[];
  varietyLevel: string;
};

export type RecipeIngredientDraft = {
  name: string;
  quantity: string;
};

export type RecipeEditForm = {
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

export type RecipeMutationPayload = {
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
  image_candidate_index?: number | null;
  image_lookup_status?: "pending" | "found" | "not_found" | "invalid" | "attempts_exhausted" | "upstream_error" | null;
  image_lookup_reason?: string | null;
  is_favorite: boolean;
};

export type RecipeUpdatePayload = Partial<RecipeMutationPayload>;

export type RecipeCreatePayload = RecipeMutationPayload & {
  source: "manual";
};

export type IngredientForm = {
  name: string;
  quantity: string;
  categoryId: string;
  expiresAt: string;
};

export type MenuGenerationFeedback = {
  phase: MenuGenerationPhase;
  message: string;
  cooldownSeconds: number | null;
};

export type ResolveRecipeImagesOut = {
  updated_recipes: Recipe[];
  attempted_count: number;
  updated_count: number;
  skipped_count: number;
  remaining_pending_count: number;
  stopped_reason?: "pending" | "found" | "not_found" | "invalid" | "attempts_exhausted" | "upstream_error" | null;
  message: string;
};

export type RecipeImageQueueFeedback = {
  phase: "idle" | "loading" | "paused";
  message: string;
};

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const MIN_INGREDIENTS_FOR_MENU = 5;
export const PREFERENCES_STORAGE_KEY = "menuplan-preference-settings";
export const AUTO_RECIPE_IMAGE_VISIBLE_LIMIT = 6;
export const AUTO_RECIPE_IMAGE_BATCH_SIZE = 2;
export const AUTO_RECIPE_IMAGE_DEBOUNCE_MS = 400;
export const dietOptions = [
  { name: "Equilibrada", description: "Variedad de todos los grupos alimenticios" },
  { name: "Baja en carbohidratos", description: "Reduce harinas y azucares" },
  { name: "Alta en proteinas", description: "Enfocada en carnes, pescados y legumbres" },
  { name: "Mediterranea", description: "Basada en vegetales, pescado y aceite de oliva" },
];
export const restrictionOptions = ["Vegetariano", "Vegano", "Sin gluten", "Sin lactosa", "Sin frutos secos"];
export const goalOptions = [
  "Ahorro de tiempo en cocina",
  "Optimizar ingredientes disponibles",
  "Descubrir recetas nuevas",
  "Alimentacion saludable",
  "Control de calorias",
];
export const varietyOptions = [
  { name: "Baja", description: "Pueden repetirse platos similares" },
  { name: "Media", description: "Equilibrio entre variedad y practicidad" },
  { name: "Alta", description: "Platos completamente diferentes cada dia" },
];
export const recipeDifficultyOptions = ["Todas", "Facil", "Media", "Elaborada"];
export const recipeTimeOptions = ["Todos", "Hasta 30 min", "31-45 min", "+45 min"];
export const ingredientSortOptions: { value: IngredientSort; label: string }[] = [
  { value: "expiry_asc", label: "Caducidad cercana" },
  { value: "expiry_desc", label: "Caducidad lejana" },
  { value: "quantity_asc", label: "Cantidad menor" },
  { value: "quantity_desc", label: "Cantidad mayor" },
];
export const defaultPreferenceSettings: PreferenceSettings = {
  dietType: "Equilibrada",
  restrictions: [],
  excludedIngredientIds: [],
  goals: [],
  varietyLevel: "Media",
};
export const millisecondsPerDay = 24 * 60 * 60 * 1000;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
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

export function mealRank(mealType: string) {
  const normalized = mealType.toLowerCase();
  return normalized.includes("comida") || normalized.includes("lunch") ? 0 : 1;
}

export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function getApiErrorStatus(error: unknown) {
  return error instanceof ApiError ? error.status : null;
}

export function parseCooldownSeconds(message: string) {
  const match = message.match(/Espera (\d+) segundos/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function reportClientLog(
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

export function toggleListValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function buildPreferencesSummary(settings: PreferenceSettings, ingredients: Ingredient[]) {
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
  ]
    .filter(Boolean)
    .join(" ");
}

export function parseSavedPreferenceSettings(value: string | null): PreferenceSettings | null {
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

export function getRecipeDifficulty(minutes: number, difficulty?: string | null) {
  if (difficulty?.trim()) return difficulty;
  if (minutes <= 30) return "Facil";
  if (minutes <= 45) return "Media";
  return "Elaborada";
}

export function matchesRecipeTime(recipe: Recipe, timeFilter: string) {
  if (timeFilter === "Hasta 30 min") return recipe.prep_time_minutes <= 30;
  if (timeFilter === "31-45 min") return recipe.prep_time_minutes > 30 && recipe.prep_time_minutes <= 45;
  if (timeFilter === "+45 min") return recipe.prep_time_minutes > 45;
  return true;
}

export function getRecipeImage(recipe: Recipe) {
  return recipe.image_url?.trim() || null;
}

export function getRecipeAltText(recipe: Recipe) {
  return recipe.image_alt_text?.trim() || `Receta ${recipe.title}`;
}

export function getRecipeImageCaption(recipe: Recipe) {
  return recipe.description || `Imagen de referencia para ${recipe.title}.`;
}

export function getRecipeImageReason(recipe: Recipe) {
  const normalizedReason = recipe.image_lookup_reason?.trim();
  const candidateCount = recipe.image_candidate_count ?? 0;
  const candidatePosition = recipe.image_candidate_position ?? 0;
  const legacyFallbackReason = "El modo demo local no busca imagenes reales en internet.";

  if (getRecipeImage(recipe)) {
    return normalizedReason || "La receta ya cuenta con una imagen real validada.";
  }
  if (recipe.image_lookup_status === null || recipe.image_lookup_status === undefined || recipe.image_lookup_status === "pending") {
    return "Todavia no se ha intentado resolver una imagen real para esta receta. La busqueda solo se lanza al abrir el detalle o al pedirla manualmente.";
  }
  if (recipe.image_lookup_status === "upstream_error") {
    return normalizedReason || "La busqueda HTTP de imagen ha encontrado un error temporal al consultar paginas externas.";
  }
  if (recipe.image_lookup_status === "invalid") {
    return normalizedReason || "Se encontro una referencia, pero ninguna imagen asociada se pudo validar.";
  }
  if (recipe.image_lookup_status === "attempts_exhausted") {
    return normalizedReason || "Ya se agotaron las alternativas disponibles para esta receta. Se mantendra el placeholder.";
  }
  if (!getRecipeImage(recipe) && candidateCount > 0) {
    return normalizedReason || "Hay alternativas de imagen guardadas para esta receta. Puedes revisarlas y elegir una desde el detalle.";
  }
  if (normalizedReason === legacyFallbackReason) {
    return "La receta se resolvio con fallback local y no incluye busqueda real de imagenes.";
  }
  if (recipe.source === "fallback-local" && recipe.image_lookup_status === "not_found") {
    return normalizedReason || "La receta se resolvio con fallback local y todavia no tiene una imagen real.";
  }
  if (candidateCount > 0 && candidatePosition > 0) {
    return normalizedReason || `No se encontro una opcion mejor en la alternativa ${candidatePosition} de ${candidateCount}.`;
  }
  return normalizedReason || "No se ha encontrado una imagen real fiable para esta receta.";
}

export function getRecipeImageStatus(recipe: Recipe) {
  if (getRecipeImage(recipe)) return "Imagen encontrada";
  if ((recipe.image_candidate_count ?? 0) > 0) return "Sin foto seleccionada";
  if (recipe.image_lookup_status === null || recipe.image_lookup_status === undefined || recipe.image_lookup_status === "pending") return "Pendiente de resolver";
  if (recipe.image_lookup_status === "upstream_error") return "Error temporal de resolucion";
  if (recipe.image_lookup_status === "invalid") return "Imagen descartada";
  if (recipe.image_lookup_status === "attempts_exhausted") return "Intentos agotados";
  return "Sin imagen disponible";
}

export function getRecipeImageSourceUrl(recipe: Recipe) {
  return recipe.image_source_url?.trim() || null;
}

export function parseIsoDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getRetryAfterSeconds(value?: string | null, nowMs = Date.now()) {
  const retryAfter = parseIsoDate(value);
  if (!retryAfter) return null;
  const diffMs = retryAfter.getTime() - nowMs;
  if (diffMs <= 0) return null;
  return Math.ceil(diffMs / 1000);
}

export function formatRetryCountdown(totalSeconds: number) {
  if (totalSeconds <= 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function canAutoResolveRecipeImage(recipe: Recipe) {
  if (getRecipeImage(recipe)) return false;
  if ((recipe.image_candidate_count ?? 0) > 0) return false;
  const status = recipe.image_lookup_status;
  return (status === null || status === undefined || status === "pending") && recipe.image_can_retry !== false;
}

export function getRecipeSourceLabel(recipe: Recipe) {
  const source = recipe.source.toLowerCase();
  if (source.includes("manual")) return "Manual";
  return "Generada";
}

export function getRecipeServings(recipe: Recipe) {
  return recipe.servings && recipe.servings > 0 ? recipe.servings : 2;
}

export function getDefaultIngredientCategoryId(categories: IngredientCategory[]) {
  return categories.find((category) => category.name === "Otros")?.id ?? categories[0]?.id ?? "";
}

export function buildDefaultIngredientForm(categories: IngredientCategory[]): IngredientForm {
  return {
    name: "",
    quantity: "",
    categoryId: getDefaultIngredientCategoryId(categories),
    expiresAt: "",
  };
}

export function parseQuantityValue(quantity?: string | null) {
  if (!quantity) return null;
  const match = quantity.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function compareOptionalNumbers(left: number | null, right: number | null, direction: "asc" | "desc") {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "asc" ? left - right : right - left;
}

export function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function compareOptionalDates(left?: string | null, right?: string | null, direction: "asc" | "desc" = "asc") {
  const leftTime = left ? parseLocalDate(left)?.getTime() ?? null : null;
  const rightTime = right ? parseLocalDate(right)?.getTime() ?? null : null;
  return compareOptionalNumbers(leftTime, rightTime, direction);
}

export function sortIngredients(ingredients: Ingredient[], sort: IngredientSort) {
  return [...ingredients].sort((left, right) => {
    if (sort === "expiry_desc") return compareOptionalDates(left.expires_at, right.expires_at, "desc");
    if (sort === "quantity_asc") return compareOptionalNumbers(parseQuantityValue(left.quantity), parseQuantityValue(right.quantity), "asc");
    if (sort === "quantity_desc") return compareOptionalNumbers(parseQuantityValue(left.quantity), parseQuantityValue(right.quantity), "desc");
    return compareOptionalDates(left.expires_at, right.expires_at, "asc");
  });
}

export function formatIngredientExpiry(value?: string | null) {
  if (!value) return "Sin caducidad";
  const date = parseLocalDate(value);
  if (!date) return "Caducidad no valida";
  return `Caduca ${new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(date)}`;
}

export function getIngredientExpiryLabel(value?: string | null) {
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

export function parseIngredientLine(value: string): RecipeIngredientDraft {
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

export function formatIngredientDraft(ingredient: RecipeIngredientDraft) {
  const name = ingredient.name.trim();
  const quantity = ingredient.quantity.trim();
  return quantity ? `${name} - ${quantity}` : name;
}

export function buildRecipeEditForm(recipe: Recipe): RecipeEditForm {
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

export function buildEmptyRecipeForm(): RecipeEditForm {
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

export function buildRecipePayloadFromDraft(draft: RecipeEditForm, requireImage = false): RecipeMutationPayload | { error: string } {
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

export function getRecipeTip(recipe: Recipe) {
  const mainIngredient = parseIngredientLine(recipe.ingredients[0] ?? "").name || "los ingredientes principales";
  return `Recomendacion IA: prepara ${mainIngredient.toLowerCase()} justo antes de servir y ajusta sal, acidez y textura al final para que la receta mantenga contraste.`;
}

export function getCurrentMenuDayIndex(menu: WeeklyMenu | null) {
  if (!menu) return null;
  const weekStart = parseLocalDate(menu.week_start_date);
  const today = parseLocalDate(toLocalDateKey(new Date()));
  if (!weekStart || !today) return null;
  const dayIndex = Math.floor((today.getTime() - weekStart.getTime()) / millisecondsPerDay);
  return dayIndex >= 0 && dayIndex <= 6 ? dayIndex : null;
}
