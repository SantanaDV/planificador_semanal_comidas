"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Ingredient = {
  id: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  category?: string | null;
};

type Recipe = {
  id: string;
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
  prep_time_minutes: number;
  source: string;
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

type ViewId = "dashboard" | "menu" | "ingredients" | "recipes" | "preferences";
type LogLevel = "info" | "warning" | "error";

type PreferenceSettings = {
  dietType: string;
  restrictions: string[];
  excludedIngredients: string[];
  goals: string[];
  varietyLevel: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
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
const recipeImages = [
  "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=900&q=80",
];
const defaultPreferenceSettings: PreferenceSettings = {
  dietType: "Equilibrada",
  restrictions: [],
  excludedIngredients: ["Champinones", "Berenjenas", "Cilantro", "Queso azul"],
  goals: ["Optimizar ingredientes disponibles"],
  varietyLevel: "Media",
};
const millisecondsPerDay = 24 * 60 * 60 * 1000;

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
    throw new Error(errorText || `Request failed with status ${response.status}`);
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

function buildPreferencesSummary(settings: PreferenceSettings) {
  return [
    `Tipo de dieta: ${settings.dietType}.`,
    settings.restrictions.length ? `Restricciones alimentarias: ${settings.restrictions.join(", ")}.` : "",
    settings.excludedIngredients.length ? `Ingredientes excluidos: ${settings.excludedIngredients.join(", ")}.` : "",
    settings.goals.length ? `Objetivos: ${settings.goals.join(", ")}.` : "",
    `Nivel de variedad semanal: ${settings.varietyLevel}.`,
    "Evitar repetir platos recientes y priorizar ingredientes disponibles.",
  ]
    .filter(Boolean)
    .join(" ");
}

function getRecipeDifficulty(minutes: number) {
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

function getRecipeImage(recipe: Recipe, index: number) {
  const hash = Array.from(`${recipe.id}${recipe.title}`).reduce((total, letter) => total + letter.charCodeAt(0), index);
  return recipeImages[hash % recipeImages.length];
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
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [menu, setMenu] = useState<WeeklyMenu | null>(null);
  const [preferenceSettings, setPreferenceSettings] = useState<PreferenceSettings>(defaultPreferenceSettings);
  const [excludedIngredientDraft, setExcludedIngredientDraft] = useState("");
  const [recipeFilter, setRecipeFilter] = useState("");
  const [recipeTagFilter, setRecipeTagFilter] = useState("Todas");
  const [recipeDifficultyFilter, setRecipeDifficultyFilter] = useState("Todas");
  const [recipeTimeFilter, setRecipeTimeFilter] = useState("Todos");
  const [ingredientQuery, setIngredientQuery] = useState("");
  const [ingredientCategory, setIngredientCategory] = useState("Todas");
  const [selectedRecipes, setSelectedRecipes] = useState<Record<string, string>>({});
  const [ingredientForm, setIngredientForm] = useState({ name: "", quantity: "", unit: "", category: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Listo para planificar.");
  const preferences = useMemo(() => buildPreferencesSummary(preferenceSettings), [preferenceSettings]);

  async function refreshData() {
    const [ingredientData, recipeData, menuData] = await Promise.all([
      api<Ingredient[]>("/ingredients"),
      api<Recipe[]>("/recipes"),
      api<WeeklyMenu | null>("/menus/latest"),
    ]);
    setIngredients(ingredientData);
    setRecipes(recipeData);
    setMenu(menuData);
  }

  useEffect(() => {
    refreshData().catch((error: Error) => {
      setMessage(`No se pudo conectar con la API: ${error.message}`);
      reportClientLog("error", "Error cargando datos iniciales", { action: "initial_load" }, error);
    });
  }, []);

  const groupedMenu = useMemo(() => {
    const groups = new Map<number, MenuItem[]>();
    for (const item of menu?.items ?? []) {
      groups.set(item.day_index, [...(groups.get(item.day_index) ?? []), item]);
    }
    return Array.from(groups.entries()).sort(([left], [right]) => left - right);
  }, [menu]);

  const ingredientCategories = useMemo(() => {
    const categories = Array.from(new Set(ingredients.map((item) => item.category).filter(Boolean))) as string[];
    return ["Todas", ...categories.sort((left, right) => left.localeCompare(right))];
  }, [ingredients]);

  const filteredIngredients = useMemo(() => {
    const query = ingredientQuery.trim().toLowerCase();
    return ingredients.filter((ingredient) => {
      const matchesQuery =
        !query ||
        ingredient.name.toLowerCase().includes(query) ||
        (ingredient.category ?? "").toLowerCase().includes(query);
      const matchesCategory = ingredientCategory === "Todas" || ingredient.category === ingredientCategory;
      return matchesQuery && matchesCategory;
    });
  }, [ingredientCategory, ingredientQuery, ingredients]);

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
        recipeDifficultyFilter === "Todas" || getRecipeDifficulty(recipe.prep_time_minutes) === recipeDifficultyFilter;
      return matchesQuery && matchesTag && matchesDifficulty && matchesRecipeTime(recipe, recipeTimeFilter);
    });
  }, [recipeDifficultyFilter, recipeFilter, recipeTagFilter, recipeTimeFilter, recipes]);

  const plannedSlots = menu?.items.filter((item) => item.recipe).length ?? 0;
  const dashboardDays = groupedMenu;
  const currentMenuDayIndex = getCurrentMenuDayIndex(menu);
  const latestRecipes = recipes.slice(0, 4);
  const expiringIngredients = ingredients.slice(0, 4);
  const recipeTags = ["Todas", ...Array.from(new Set(recipes.flatMap((recipe) => recipe.tags))).slice(0, 10)];
  const navItems: { id: ViewId; label: string; description: string }[] = [
    { id: "dashboard", label: "Dashboard", description: "Resumen" },
    { id: "menu", label: "Menu semanal", description: "Plan de 7 dias" },
    { id: "ingredients", label: "Ingredientes", description: "Nevera" },
    { id: "recipes", label: "Recetas", description: "Guardadas" },
    { id: "preferences", label: "Preferencias", description: "Personaliza tu experiencia de planificacion" },
  ];
  const quickStats = [
    { label: "Recetas guardadas", value: recipes.length.toString(), detail: "Para repetir, filtrar o versionar" },
    { label: "Ingredientes disponibles", value: ingredients.length.toString(), detail: "Base actual de la nevera" },
    { label: "Huecos planificados", value: `${plannedSlots}/14`, detail: menu ? `Semana ${menu.week_start_date}` : "Pendiente de generar" },
  ];
  const activeMeta = navItems.find((item) => item.id === activeView) ?? navItems[0];

  function savePreferences() {
    setMessage("Preferencias guardadas para la proxima generacion.");
    reportClientLog("info", "Preferencias actualizadas desde frontend", {
      action: "update_preferences",
      diet_type: preferenceSettings.dietType,
      restrictions_count: preferenceSettings.restrictions.length,
      excluded_ingredients_count: preferenceSettings.excludedIngredients.length,
      goals_count: preferenceSettings.goals.length,
      variety_level: preferenceSettings.varietyLevel,
    });
  }

  async function addIngredient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ingredientForm.name.trim()) return;
    setLoading(true);
    try {
      await api<Ingredient>("/ingredients", {
        method: "POST",
        body: JSON.stringify({
          name: ingredientForm.name.trim(),
          quantity: ingredientForm.quantity.trim() || null,
          unit: ingredientForm.unit.trim() || null,
          category: ingredientForm.category.trim() || null,
        }),
      });
      setIngredientForm({ name: "", quantity: "", unit: "", category: "" });
      setMessage("Ingrediente guardado.");
      reportClientLog("info", "Ingrediente creado desde frontend", {
        action: "create_ingredient",
        name: ingredientForm.name.trim(),
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

  async function generateMenu() {
    setLoading(true);
    setMessage("Generando menu semanal...");
    try {
      const data = await api<WeeklyMenu>("/menus/generate", {
        method: "POST",
        body: JSON.stringify({ preferences }),
      });
      setMenu(data);
      setActiveView("menu");
      setMessage(`Menu generado con ${data.ai_model}.`);
      reportClientLog("info", "Menu generado desde frontend", {
        action: "generate_menu",
        ai_model: data.ai_model,
        item_count: data.items.length,
      });
      await refreshRecipes();
    } catch (error) {
      setMessage(getErrorMessage(error, "Error al generar menu."));
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
        body: JSON.stringify({ preferences }),
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

  async function createVariant(recipeId: string) {
    setLoading(true);
    try {
      await api<Recipe>(`/recipes/${recipeId}/variant`, {
        method: "POST",
        body: JSON.stringify({ preferences }),
      });
      setMessage("Variante guardada en el recetario.");
      reportClientLog("info", "Variante creada desde frontend", { action: "create_recipe_variant", recipe_id: recipeId });
      await refreshRecipes();
    } catch (error) {
      setMessage(getErrorMessage(error, "Error al crear variante."));
      reportClientLog("error", "Error creando variante desde frontend", { action: "create_recipe_variant", recipe_id: recipeId }, error);
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
              {navItems.map((item) => (
                <button
                  key={item.id}
                  className={`min-w-fit rounded-lg border px-3 py-2 text-left transition lg:px-4 lg:py-3 ${
                    activeView === item.id
                      ? "border-leaf bg-leaf text-white shadow-soft"
                      : "border-line text-ink/80 hover:border-leaf hover:text-leaf"
                  }`}
                  onClick={() => setActiveView(item.id)}
                  type="button"
                >
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className={`hidden text-xs lg:block ${activeView === item.id ? "text-white/75" : "text-ink/55"}`}>
                    {item.description}
                  </span>
                </button>
              ))}
            </nav>

            <div className="mt-auto grid gap-3 rounded-lg border border-line bg-paper p-4 text-sm">
              <p className="font-semibold">Estado de la demo</p>
              <p className="leading-6 text-ink/70">{message}</p>
              <span className="w-fit rounded bg-yolk px-2 py-1 text-xs font-semibold text-ink">
                {menu ? menu.ai_model : "Sin menu generado"}
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
                disabled={loading}
                onClick={generateMenu}
                type="button"
              >
                {loading ? "Trabajando..." : "Generar menu semanal"}
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-7xl px-5 py-8">
            {activeView === "dashboard" ? (
              <DashboardView
                currentMenuDayIndex={currentMenuDayIndex}
                dashboardDays={dashboardDays}
                expiringIngredients={expiringIngredients}
                latestRecipes={latestRecipes}
                menu={menu}
                quickStats={quickStats}
                setActiveView={setActiveView}
              />
            ) : null}

            {activeView === "menu" ? (
              <MenuView
                groupedMenu={groupedMenu}
                loading={loading}
                menu={menu}
                onGenerate={generateMenu}
                onReplace={replaceItem}
                onUseSavedRecipe={useSavedRecipe}
                recipes={recipes}
                selectedRecipes={selectedRecipes}
                setSelectedRecipes={setSelectedRecipes}
              />
            ) : null}

            {activeView === "ingredients" ? (
              <IngredientsView
                categories={ingredientCategories}
                category={ingredientCategory}
                filteredIngredients={filteredIngredients}
                form={ingredientForm}
                loading={loading}
                onAdd={addIngredient}
                onDelete={deleteIngredient}
                query={ingredientQuery}
                setCategory={setIngredientCategory}
                setForm={setIngredientForm}
                setQuery={setIngredientQuery}
                total={ingredients.length}
              />
            ) : null}

            {activeView === "recipes" ? (
              <RecipesView
                filteredRecipes={filteredRecipes}
                difficultyFilter={recipeDifficultyFilter}
                loading={loading}
                onCreateVariant={createVariant}
                onDeleteRecipe={deleteRecipe}
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

            {activeView === "preferences" ? (
              <PreferencesView
                excludedIngredientDraft={excludedIngredientDraft}
                loading={loading}
                message={message}
                onSave={savePreferences}
                preferencesSummary={preferences}
                setExcludedIngredientDraft={setExcludedIngredientDraft}
                setSettings={setPreferenceSettings}
                settings={preferenceSettings}
              />
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function DashboardView({
  currentMenuDayIndex,
  dashboardDays,
  expiringIngredients,
  latestRecipes,
  menu,
  quickStats,
  setActiveView,
}: {
  currentMenuDayIndex: number | null;
  dashboardDays: [number, MenuItem[]][];
  expiringIngredients: Ingredient[];
  latestRecipes: Recipe[];
  menu: WeeklyMenu | null;
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
                          <p className="mt-1 text-sm font-semibold">{item.recipe?.title ?? "Receta eliminada"}</p>
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
              {menu?.notes || "Empieza con los ingredientes cargados y evita repetir platos recientes."}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-white p-5">
            <p className="font-semibold">Ingredientes listos</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {expiringIngredients.map((ingredient) => (
                <span key={ingredient.id} className="rounded border border-line bg-paper px-3 py-2 text-sm">
                  {ingredient.name}
                </span>
              ))}
            </div>
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
  groupedMenu,
  loading,
  menu,
  onGenerate,
  onReplace,
  onUseSavedRecipe,
  recipes,
  selectedRecipes,
  setSelectedRecipes,
}: {
  groupedMenu: [number, MenuItem[]][];
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
            {menu ? `Semana del ${menu.week_start_date} - ${menu.ai_model}` : "Genera tu primera propuesta."}
          </p>
        </div>
        <button className="rounded-lg bg-leaf px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={loading} onClick={onGenerate} type="button">
          {loading ? "Trabajando..." : "Regenerar menu"}
        </button>
      </div>

      {!menu ? (
        <div className="rounded-lg border border-dashed border-line bg-white p-8 text-ink/75 shadow-soft">
          Ya tienes ingredientes demo cargados. Genera una primera semana para empezar la prueba.
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
                          <h4 className="mt-1 text-lg font-semibold">{item.recipe?.title ?? "Receta eliminada"}</h4>
                        </div>
                        {item.recipe ? (
                          <span className="rounded bg-yolk px-2 py-1 text-xs font-semibold">
                            {item.recipe.prep_time_minutes} min
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm leading-6 text-ink/75">{item.recipe?.description}</p>
                      <div className="mt-3 rounded-lg border border-leaf/20 bg-white px-3 py-2">
                        <p className="text-xs font-semibold uppercase text-leaf">Por que este plato</p>
                        <p className="mt-1 text-sm leading-6 text-ink/75">{item.explanation}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.recipe?.tags.map((tag) => (
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
  filteredIngredients,
  form,
  loading,
  onAdd,
  onDelete,
  query,
  setCategory,
  setForm,
  setQuery,
  total,
}: {
  categories: string[];
  category: string;
  filteredIngredients: Ingredient[];
  form: { name: string; quantity: string; unit: string; category: string };
  loading: boolean;
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (id: string) => void;
  query: string;
  setCategory: (category: string) => void;
  setForm: (form: { name: string; quantity: string; unit: string; category: string }) => void;
  setQuery: (query: string) => void;
  total: number;
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <p className="text-sm font-semibold uppercase text-leaf">Nevera</p>
        <h2 className="mt-1 text-2xl font-semibold">Anadir ingrediente</h2>
        <form className="mt-5 space-y-3" onSubmit={onAdd}>
          <input
            className="w-full rounded-lg border border-line bg-paper px-3 py-2"
            placeholder="Ingrediente"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            <input
              className="rounded-lg border border-line bg-paper px-3 py-2"
              placeholder="Cantidad"
              value={form.quantity}
              onChange={(event) => setForm({ ...form, quantity: event.target.value })}
            />
            <input
              className="rounded-lg border border-line bg-paper px-3 py-2"
              placeholder="Unidad"
              value={form.unit}
              onChange={(event) => setForm({ ...form, unit: event.target.value })}
            />
            <input
              className="rounded-lg border border-line bg-paper px-3 py-2"
              placeholder="Tipo"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            />
          </div>
          <button className="w-full rounded-lg bg-leaf px-4 py-2 font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
            Anadir ingrediente
          </button>
        </form>
      </div>

      <div className="space-y-5">
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-leaf">{total} ingredientes</p>
              <h2 className="text-2xl font-semibold">Ingredientes disponibles</h2>
            </div>
            <input
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 md:w-80"
              placeholder="Buscar ingrediente o tipo"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item}
                className={`rounded border px-3 py-2 text-sm font-semibold ${
                  category === item ? "border-leaf bg-leaf text-white" : "border-line bg-paper text-ink/75 hover:border-leaf hover:text-leaf"
                }`}
                onClick={() => setCategory(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {filteredIngredients.map((ingredient) => (
            <article key={ingredient.id} className="rounded-lg border border-line bg-white p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{ingredient.name}</h3>
                  <p className="mt-1 text-sm text-ink/65">
                    {[ingredient.quantity, ingredient.unit].filter(Boolean).join(" ") || "Sin cantidad"}
                  </p>
                </div>
                {ingredient.category ? <span className="rounded bg-yolk px-2 py-1 text-xs font-semibold">{ingredient.category}</span> : null}
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
          ))}
        </div>

        {filteredIngredients.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-white p-6 text-ink/75">
            No hay ingredientes que coincidan con el filtro.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function RecipesView({
  difficultyFilter,
  filteredRecipes,
  loading,
  onCreateVariant,
  onDeleteRecipe,
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
  onCreateVariant: (recipeId: string) => void;
  onDeleteRecipe: (recipeId: string) => void;
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
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold uppercase text-leaf">Biblioteca</p>
          <h2 className="text-2xl font-semibold">Recetas guardadas</h2>
          <p className="text-sm text-ink/70">
            {filteredRecipes.length} de {totalRecipes} recetas disponibles
          </p>
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
            ? "Genera un menu para llenar el recetario con recetas guardadas."
            : "No hay recetas que coincidan con los filtros actuales."}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {filteredRecipes.map((recipe, index) => {
            const difficulty = getRecipeDifficulty(recipe.prep_time_minutes);
            return (
              <article
                key={recipe.id}
                className="group overflow-hidden rounded-lg border border-line bg-white shadow-soft transition duration-200 ease-out hover:-translate-y-1 hover:border-leaf/60 hover:shadow-[0_18px_38px_rgba(31,37,34,0.14)]"
              >
                <div className="relative h-44 overflow-hidden bg-leaf/10">
                  <img
                    className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-105"
                    src={getRecipeImage(recipe, index)}
                    alt={`Receta ${recipe.title}`}
                  />
                  <div className="absolute inset-0 bg-ink/0 transition duration-300 group-hover:bg-ink/10" />
                  <span className="absolute left-4 top-4 rounded-lg bg-white/90 px-3 py-1 text-xs font-semibold text-leaf shadow-soft transition duration-200 group-hover:-translate-y-0.5">
                    {recipe.source === "gemini" ? "IA" : "Fallback"}
                  </span>
                  <span className="absolute right-4 top-4 rounded-lg bg-white/90 px-3 py-1 text-xs font-semibold text-tomato shadow-soft transition duration-200 group-hover:-translate-y-0.5">
                    Guardada
                  </span>
                </div>

                <div className="p-5 transition duration-200 group-hover:bg-paper/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
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

                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <button
                      className="rounded-lg border border-leaf px-3 py-2 text-sm font-semibold text-leaf disabled:opacity-60"
                      disabled={loading}
                      onClick={() => onCreateVariant(recipe.id)}
                      type="button"
                    >
                      Crear variante
                    </button>
                    <button
                      className="rounded-lg border border-tomato px-3 py-2 text-sm font-semibold text-tomato disabled:opacity-60"
                      disabled={loading}
                      onClick={() => onDeleteRecipe(recipe.id)}
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
  excludedIngredientDraft,
  loading,
  message,
  onSave,
  preferencesSummary,
  setExcludedIngredientDraft,
  setSettings,
  settings,
}: {
  excludedIngredientDraft: string;
  loading: boolean;
  message: string;
  onSave: () => void;
  preferencesSummary: string;
  setExcludedIngredientDraft: (value: string) => void;
  setSettings: (updater: (settings: PreferenceSettings) => PreferenceSettings) => void;
  settings: PreferenceSettings;
}) {
  function addExcludedIngredient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = excludedIngredientDraft.trim();
    if (!value) return;
    setSettings((current) => {
      const exists = current.excludedIngredients.some((ingredient) => ingredient.toLowerCase() === value.toLowerCase());
      return exists ? current : { ...current, excludedIngredients: [...current.excludedIngredients, value] };
    });
    setExcludedIngredientDraft("");
  }

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
        <h2 className="text-xl font-semibold">Ingredientes excluidos</h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">Ingredientes que no quieres que aparezcan en tus menus</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {settings.excludedIngredients.map((ingredient) => (
            <button
              key={ingredient}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink/75 hover:border-tomato hover:text-tomato"
              onClick={() =>
                setSettings((current) => ({
                  ...current,
                  excludedIngredients: current.excludedIngredients.filter((item) => item !== ingredient),
                }))
              }
              type="button"
            >
              {ingredient} x
            </button>
          ))}
        </div>
        <form className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]" onSubmit={addExcludedIngredient}>
          <input
            className="min-h-11 rounded-lg border border-line bg-paper px-4 py-2"
            placeholder="Anadir ingrediente..."
            value={excludedIngredientDraft}
            onChange={(event) => setExcludedIngredientDraft(event.target.value)}
          />
          <button className="rounded-lg bg-leaf px-5 py-2 font-semibold text-white" type="submit">
            Anadir
          </button>
        </form>
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
