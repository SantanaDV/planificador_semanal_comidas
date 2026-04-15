"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { GenerationGuardModal } from "./components/home/generation-guard-modal";
import { IngredientModal } from "./components/home/ingredient-modal";
import { MenuGenerationBanner } from "./components/home/menu-generation-banner";
import { RecipeDetailView } from "./components/home/recipe-detail-view";
import { RecipeModal } from "./components/home/recipe-modal";
import { RecipeVisualSurface } from "./components/home/recipe-visual-surface";
import {
  API_URL,
  AUTO_RECIPE_IMAGE_BATCH_SIZE,
  AUTO_RECIPE_IMAGE_DEBOUNCE_MS,
  AUTO_RECIPE_IMAGE_VISIBLE_LIMIT,
  MIN_INGREDIENTS_FOR_MENU,
  PREFERENCES_STORAGE_KEY,
  api,
  buildDefaultIngredientForm,
  buildEmptyRecipeForm,
  buildPreferencesSummary,
  buildRecipeEditForm,
  canAutoResolveRecipeImage,
  defaultPreferenceSettings,
  dietOptions,
  formatRetryCountdown,
  formatIngredientExpiry,
  getApiErrorStatus,
  getCurrentMenuDayIndex,
  getDefaultIngredientCategoryId,
  getErrorMessage,
  getIngredientExpiryLabel,
  getRecipeDifficulty,
  getRecipeImage,
  getRecipeImageReason,
  getRecipeSourceLabel,
  getRetryAfterSeconds,
  goalOptions,
  ingredientSortOptions,
  matchesRecipeTime,
  mealRank,
  parseCooldownSeconds,
  parseSavedPreferenceSettings,
  reportClientLog,
  restrictionOptions,
  recipeDifficultyOptions,
  recipeTimeOptions,
  sortIngredients,
  toggleListValue,
  varietyOptions,
  type AiStatus,
  type GenerationGuard,
  type Ingredient,
  type IngredientCategory,
  type IngredientForm,
  type IngredientSort,
  type MenuItem,
  type MenuGenerationFeedback,
  type PreferenceSettings,
  type Recipe,
  type RecipeCreatePayload,
  type RecipeEditForm,
  type RecipeImageQueueFeedback,
  type RecipeUpdatePayload,
  type ResolveRecipeImagesOut,
  type ViewId,
  type WeeklyMenu,
} from "./home-shared";

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
  const [autoResolvingRecipeIds, setAutoResolvingRecipeIds] = useState<string[]>([]);
  const [recipeImageQueueFeedback, setRecipeImageQueueFeedback] = useState<RecipeImageQueueFeedback>({
    phase: "idle",
    message: "",
  });
  const imageResolutionRequestsInFlight = useRef<Set<string>>(new Set());
  const autoImageResolutionRequested = useRef<Set<string>>(new Set());
  const autoImageResolutionBatchInFlight = useRef(false);
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
      currentRecipe && currentRecipe.image_lookup_status === "upstream_error"
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

  async function resolveRecipeImagesBatch(recipeIds: string[]) {
    if (!recipeIds.length) return null;
    const uniqueRecipeIds = Array.from(new Set(recipeIds));
    uniqueRecipeIds.forEach((recipeId) => imageResolutionRequestsInFlight.current.add(recipeId));
    setAutoResolvingRecipeIds(uniqueRecipeIds);
    try {
      const data = await api<ResolveRecipeImagesOut>("/recipes/resolve-images", {
        method: "POST",
        body: JSON.stringify({
          recipe_ids: uniqueRecipeIds,
          limit: uniqueRecipeIds.length,
          force: false,
        }),
      });
      mergeResolvedRecipes(data.updated_recipes);
      setRecipeImageQueueFeedback({
        phase: data.stopped_reason === "upstream_error" ? "paused" : "idle",
        message:
          data.stopped_reason === "upstream_error"
            ? "La busqueda automatica de imagenes esta en pausa temporal. Puedes reintentar desde el detalle de cada receta."
            : "",
      });
      reportClientLog("info", "Resolucion automatica de imagenes en lote desde frontend", {
        action: "resolve_recipe_images_batch",
        recipe_ids: uniqueRecipeIds,
        attempted_count: data.attempted_count,
        updated_count: data.updated_count,
        stopped_reason: data.stopped_reason,
      });
      return data;
    } catch (error) {
      setRecipeImageQueueFeedback({
        phase: "paused",
        message: "La busqueda automatica de imagenes se ha detenido temporalmente. Puedes continuar desde el detalle de cada receta.",
      });
      reportClientLog("error", "Error resolviendo imagenes en lote desde frontend", { action: "resolve_recipe_images_batch", recipe_ids: uniqueRecipeIds }, error);
      return null;
    } finally {
      uniqueRecipeIds.forEach((recipeId) => imageResolutionRequestsInFlight.current.delete(recipeId));
      setAutoResolvingRecipeIds((current) => current.filter((recipeId) => !uniqueRecipeIds.includes(recipeId)));
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

  useEffect(() => {
    if (activeView !== "recipes" || autoImageResolutionBatchInFlight.current || recipeImageQueueFeedback.phase === "paused") return;

    const eligibleVisibleRecipeIds = filteredRecipes
      .filter((recipe) => canAutoResolveRecipeImage(recipe) && !autoImageResolutionRequested.current.has(recipe.id))
      .slice(0, AUTO_RECIPE_IMAGE_VISIBLE_LIMIT)
      .map((recipe) => recipe.id);

    if (!eligibleVisibleRecipeIds.length) {
      if (recipeImageQueueFeedback.phase === "loading") {
        setRecipeImageQueueFeedback({ phase: "idle", message: "" });
      }
      return;
    }

    const batchIds = eligibleVisibleRecipeIds.slice(0, AUTO_RECIPE_IMAGE_BATCH_SIZE);
    const timer = window.setTimeout(() => {
      autoImageResolutionBatchInFlight.current = true;
      batchIds.forEach((recipeId) => autoImageResolutionRequested.current.add(recipeId));
      setRecipeImageQueueFeedback({
        phase: "loading",
        message: "Completando imagenes para algunas recetas visibles de forma progresiva.",
      });
      void resolveRecipeImagesBatch(batchIds).finally(() => {
        autoImageResolutionBatchInFlight.current = false;
      });
    }, AUTO_RECIPE_IMAGE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [activeView, filteredRecipes, recipeImageQueueFeedback.phase]);

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
                    className={`min-w-fit rounded-lg border px-3 py-2 text-left transition lg:px-4 lg:py-3 ${isActive
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
                autoResolvingRecipeIds={autoResolvingRecipeIds}
                filteredRecipes={filteredRecipes}
                difficultyFilter={recipeDifficultyFilter}
                imageQueueFeedback={recipeImageQueueFeedback}
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
                imageResolutionEnabled={Boolean(aiStatus?.images_enabled)}
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
                    className={`grid gap-3 rounded-lg border p-4 transition md:grid-cols-[130px_1fr] ${isToday ? "border-leaf bg-leaf/5 shadow-soft" : "border-line bg-paper"
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
                            <p className="text-xs font-semibold uppercase text-leaf">Por qué este plato</p>
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
            Añadir ingrediente
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
            className={`rounded-lg border px-4 py-3 font-semibold ${filtersOpen ? "border-leaf bg-leaf text-white" : "border-line bg-paper text-ink/75 hover:border-leaf hover:text-leaf"
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
                    className={`rounded border px-3 py-2 text-sm font-semibold ${category === item ? "border-leaf bg-leaf text-white" : "border-line bg-white text-ink/75 hover:border-leaf hover:text-leaf"
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
              Añadir ingrediente
            </button>
            <button
              className="rounded-lg border border-line px-4 py-3 font-semibold text-ink/70 hover:border-leaf hover:text-leaf disabled:opacity-60"
              disabled={loading}
              onClick={onAddDemoIngredients}
              type="button"
            >
              Añadir ingredientes de prueba
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
          No se han cargado categorias todavia. Revisa la conexion con la API antes de añadir ingredientes.
        </div>
      ) : null}
    </section>
  );
}

function RecipesView({
  autoResolvingRecipeIds,
  difficultyFilter,
  filteredRecipes,
  imageQueueFeedback,
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
  autoResolvingRecipeIds: string[];
  difficultyFilter: string;
  filteredRecipes: Recipe[];
  imageQueueFeedback: RecipeImageQueueFeedback;
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
              La grid completa imagenes de forma progresiva solo para unas pocas recetas visibles. El resto se resuelve bajo demanda desde el detalle.
            </p>
            {imageQueueFeedback.message ? (
              <p className={`text-xs leading-5 ${imageQueueFeedback.phase === "paused" ? "text-tomato" : "text-leaf"}`}>
                {imageQueueFeedback.message}
              </p>
            ) : null}
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
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-5 py-2 font-semibold transition ${showFilters || activeFilterCount
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
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${tagFilter === tag
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
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${difficultyFilter === difficulty
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
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${timeFilter === time
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
                    <RecipeVisualSurface compact loading={autoResolvingRecipeIds.includes(recipe.id)} recipe={recipe} />
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
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${recipe.is_favorite
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
                className={`min-h-20 rounded-lg border px-4 py-4 text-left transition ${selected
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
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${excludedIngredientCategory === category
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
                        className={`grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 transition ${selected ? "bg-tomato/5" : "bg-white hover:bg-paper"
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
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition ${settings.goals.includes(goal) ? "bg-paper" : "hover:bg-paper"
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
                className={`min-h-24 rounded-lg border px-4 py-4 text-center transition ${selected
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
