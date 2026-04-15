# Planificador semanal de comidas con IA

Aplicación web para crear menús semanales a partir de ingredientes disponibles, preferencias e historial de recetas. El MVP usa Next.js, FastAPI, PostgreSQL, Docker Compose y Gemini configurable. Para probar IA real necesitas tu propia clave de Gemini; si no la configuras, el backend usa un fallback local para que la demo siga funcionando.

## Nota de decisión para la entrega

Durante el desarrollo se exploró una integración local con Ollama para que la generación textual del menú no dependiera de un servicio externo. El experimento se completó a nivel arquitectónico, pero no se adoptó como camino principal para esta entrega porque la generación semanal completa no alcanzó un nivel suficientemente estable ni una latencia razonable en CPU para la demo final.

La entrega final prioriza por tanto la versión más estable y defendible del producto. El trabajo experimental queda preservado en una rama separada del repositorio: `experiment/local-ollama-menu`.

## Funcionalidad MVP

- Usuario demo sin login.
- Alta y eliminación de ingredientes con categoría persistida, cantidad y fecha de caducidad.
- Generación de menú semanal con comida y cena de lunes a domingo.
- Preferencias estructuradas con ingredientes excluidos seleccionados desde la nevera real.
- Guardado automático de recetas generadas.
- Sustitución de platos del menú.
- Repetición de recetas guardadas en un hueco del menú.
- Recetario con filtro, eliminación, favoritas y creación manual de recetas.
- Detalle editable de receta con foto, ingredientes, cantidades, pasos, dificultad, raciones y etiquetas.
- Resolución progresiva de imagen real para recetas, con validación mínima de `image_url`, fuente, candidatos cacheados y estado de búsqueda.
- La vista `Recetas` puede completar algunas imágenes automáticamente, pero solo sobre un pequeño lote de recetas visibles y con una cola controlada.
- Explicación breve de por qué se eligió cada plato.
- Estado vacío de ingredientes y carga de ingredientes de prueba bajo demanda en base de datos.
- Logging transversal en base de datos para eventos de backend, frontend, IA y planificación.

## Requisitos

- Docker Desktop con Docker Compose.
- Integración WSL activada si se ejecuta desde WSL en Windows.
- Node.js 20.9+ si ejecutas el frontend sin Docker.
- Python 3.12 si ejecutas el backend sin Docker.
- Clave de Gemini API para probar generación real con `gemini-2.5-flash-lite`.

## Arranque rápido con Docker

Este es el flujo recomendado para levantar el proyecto y comprobar que la integración con Gemini está bien configurada.

### 1. Preparar variables de entorno

WSL / Linux / macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 2. Crear una clave Gemini API en Google AI Studio

Paso a paso oficial de Google AI for Developers:

1. Entra en Google AI Studio: https://aistudio.google.com/
2. Inicia sesión con tu cuenta de Google.
3. Si es tu primera vez, acepta los términos de servicio cuando te los pida AI Studio.
4. Abre la página de claves: https://aistudio.google.com/apikey
5. Si AI Studio ya te muestra un proyecto y una clave, puedes usar esa clave.
6. Si no ves un proyecto disponible:
   - abre `Dashboard`
   - entra en `Projects`
   - si eres usuario nuevo, AI Studio puede haberte creado un proyecto por defecto automáticamente
   - si ya tenías proyectos de Google Cloud, usa `Import projects` y busca tu proyecto por nombre o `project ID`
7. Vuelve a `API Keys` y crea una clave en el proyecto elegido.
8. Copia la clave y guárdala localmente. No se vuelve a publicar desde este repositorio.

Casos reales a tener en cuenta:

- Si el botón de crear clave aparece deshabilitado o ves un mensaje del tipo `You do not have permission to create a key in this project`, el problema no es del proyecto: faltan permisos en Google Cloud sobre ese proyecto.
- Si no tienes permisos sobre un proyecto corporativo u organizacional, la salida más simple para esta prueba es crear o usar un proyecto personal que controles.
- Google AI Studio muestra y gestiona las claves desde su propia página de `API Keys`, pero para administración avanzada o restricciones puedes ir después a Google Cloud Console.

### 3. Pegar la clave en `.env`

Abre `.env` y deja, como mínimo:

```bash
GEMINI_API_KEY=tu_clave_real_aqui
GEMINI_MODEL=gemini-2.5-flash-lite
```

### 4. Levantar la aplicación

Esto se debe arrancar desde donde tengas el `docker-compose.yml`.

```bash
docker compose up --build
```

Docker arranca:

- PostgreSQL en `localhost:5432`
- backend FastAPI en `localhost:8000`
- frontend Next.js en `localhost:3000`

El frontend se ejecuta con `next start` sobre una build de producción. Si quieres recarga en caliente, usa la ejecución sin Docker.

### 5. Verificar que todo ha arrancado

```bash
curl http://localhost:8000/health
```

Respuesta esperada:

```json
{"status":"ok"}
```

### 6. Verificar si Gemini ha quedado configurado

```bash
curl http://localhost:8000/ai/status
```

Si la clave está bien cargada, deberías ver algo parecido a:

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash-lite",
  "configured": true,
  "mode": "ai",
  "image_provider": "http-search",
  "images_enabled": true
}
```

Si `configured` sale `false`, revisa:

- que la clave está realmente escrita en `.env`
- que has levantado Docker después de editar `.env`
- que no hay espacios o comillas sobrantes en `GEMINI_API_KEY`

### 7. Abrir la app

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs
- Healthcheck: http://localhost:8000/health

### 8. Comprobar el flujo real

1. Entra en `Ingredientes`.
2. Si no quieres cargar ingredientes a mano, usa el flujo de ingredientes de prueba desde la UI cuando el generador te lo ofrezca.
3. Pulsa `Generar menú semanal`.
4. Si Gemini está bien configurado y con cuota disponible, el backend intentará generar el menú con IA real.
5. Si no hay clave válida, la app te avisará antes y podrás continuar con modo demo local.

## Ejecución local sin Docker

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Por defecto, el backend usa SQLite local si no defines `DATABASE_URL`. Para PostgreSQL manual:

```bash
export DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/menu_planner"
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Variables de entorno

| Variable                | Uso                                                         | Valor por defecto            |
| ----------------------- | ----------------------------------------------------------- | ---------------------------- |
| `GEMINI_API_KEY`      | Clave local de Gemini API. Si falta, se usa fallback local. | vacío                        |
| `GEMINI_MODEL`        | Modelo usado para `generateContent`.                      | `gemini-2.5-flash-lite`    |
| `DATABASE_URL`        | Conexión SQLAlchemy del backend.                            | SQLite local fuera de Docker |
| `NEXT_PUBLIC_API_URL` | URL de la API para el navegador.                            | `http://localhost:8000`    |

## Problemas habituales al crear o usar la clave Gemini

### `configured: false` en `/ai/status`

Suele deberse a uno de estos casos:

- `.env` no existe o no se copió desde `.env.example`
- la clave no se pegó realmente en `GEMINI_API_KEY`
- editaste `.env` después de levantar Docker y no reconstruiste
- hay espacios, comillas o saltos de línea extra en la clave

Solución:

```bash
docker compose up --build
curl http://localhost:8000/ai/status
```

### No puedes crear la clave en Google AI Studio

Según la documentación oficial de Google, suele deberse a permisos insuficientes sobre el proyecto de Google Cloud asociado.

Soluciones prácticas para esta prueba:

- usar un proyecto personal
- importar manualmente el proyecto correcto desde `Dashboard > Projects > Import projects`
- pedir permisos si es un proyecto compartido u organizacional

### La clave existe, pero el modelo devuelve errores temporales

Puede ocurrir por:

- cuota o rate limit del plan disponible
- saturación temporal del proveedor
- clave bloqueada o filtrada

La app registra estos casos en `system_logs` y distingue entre error, saturación y fallback. Si necesitas revisar trazas:

```bash
curl "http://localhost:8000/logs?module=ai&limit=20"
```

## Logging y errores

La app guarda logs estructurados en la tabla `system_logs`. Cada registro incluye:

- `level`: `info`, `warning` o `error`.
- `module`: origen del evento, por ejemplo `frontend`, `api`, `backend`, `database`, `ai` o `menu_planning`.
- `message`: descripción corta y legible.
- `context`: JSON con datos útiles para depurar, sin secretos.
- `stack_trace`: detalle técnico opcional para errores.
- `created_at`: fecha y hora del evento.

Endpoints útiles:

```bash
curl http://localhost:8000/logs
curl "http://localhost:8000/logs?module=frontend&limit=20"
```

## Flujo de demo

1. Pulsa "Generar menú semanal". Si no hay ingredientes, la app mostrará un aviso para ir a Ingredientes o cargar ingredientes de prueba.
2. Si hay menos de 5 ingredientes, la app pedirá ampliar la nevera antes de generar.
3. Ajusta preferencias: tipo de dieta, restricciones, ingredientes excluidos desde tu nevera, objetivos y variedad semanal.
4. Pulsa "Generar menú semanal".
5. Si no hay clave válida de Gemini, acepta el aviso para continuar con modo demo.
6. Sustituye un plato para mostrar el flujo de regeneración.
7. Repite una receta guardada desde el selector.
8. Filtra el recetario, abre una tarjeta, crea una receta manual, marca una favorita y edita raciones, dificultad, foto, ingredientes o pasos.
9. Entra en Recetas y deja que la grid complete algunas imágenes de forma progresiva. Abre el detalle de una receta si quieres forzar manualmente la siguiente alternativa cacheada sin bloquear la generación semanal.

## Referencias oficiales usadas para esta configuración

- Google AI Studio / Gemini API: https://ai.google.dev/aistudio
- Gestión de claves Gemini API: https://ai.google.dev/gemini-api/docs/api-key
- Referencia API Gemini: https://ai.google.dev/api
- Troubleshooting oficial Gemini API: https://ai.google.dev/gemini-api/docs/troubleshooting

# Prompt Log

Durante el desarrollo se utilizaron herramientas de IA para analizar la prueba, definir arquitectura, diseñar la interfaz, implementar funcionalidades, depurar errores y mejorar la experiencia de usuario.
Estos son los prompts más relevantes del proceso.

---

## 1. Análisis inicial, arquitectura y planificación

**Herramienta:** ChatGPT / Codex
**Objetivo:** Convertir la prueba técnica en un plan ejecutable dentro de 72 horas.

**Prompt usado:**

> Revisa la PRUEBA TÉCNICA - VIBE CODER INTERN.pdf y ayúdame a ejecutar esta prueba de la mejor forma posible, optimizando para una entrega sólida en 72 horas.
>
> La idea será una aplicación web de planificación automática de menús semanales mediante IA. El usuario podrá registrar ingredientes disponibles en la nevera y, a partir de sus preferencias, generar un menú semanal distinto cada semana, teniendo en cuenta la semana anterior para evitar repeticiones. También podrá repetir recetas, guardar recetas, filtrarlas, consultarlas, eliminarlas y sustituir platos del menú semanal.
>
> Quiero que trabajemos con mentalidad de prueba técnica: priorizar un MVP funcional, bien documentado, ejecutable localmente y fácil de defender, antes que añadir complejidad innecesaria.
>
> Antes de construir nada:
>
> 1. Analiza los requisitos de la prueba y conviértelos en un checklist.
> 2. Propón la arquitectura más adecuada.
> 3. Define el MVP exacto.
> 4. Diseña una estructura de carpetas.
> 5. Propón el esquema inicial de base de datos.
> 6. Define el flujo principal de usuario.
> 7. Propón un plan de ejecución por fases para 72 horas.

**Por qué funcionó:**
Convirtió un enunciado abierto en decisiones accionables: arquitectura, MVP, prioridades, entregables y plan de trabajo.

**Qué se ajustó después:**
Se redujo el alcance para priorizar una demo funcional, dockerizada y fácil de explicar.

---

## 2. Diseño inicial de interfaz con Figma AI

**Herramienta:** Figma AI
**Objetivo:** Obtener una dirección visual inicial para la aplicación.

**Prompt usado:**

> Diseña la interfaz de una aplicación web responsive para planificación automática de menús semanales.
>
> La aplicación permite al usuario registrar los ingredientes disponibles en su nevera, definir sus preferencias alimentarias y generar un menú semanal personalizado con ayuda de inteligencia artificial. El sistema debe evitar repetir platos de semanas anteriores, permitir sustituir platos del menú, guardar recetas, filtrarlas, consultarlas y reutilizarlas.
>
> Necesito una interfaz moderna, limpia, intuitiva y profesional, pensada para una demo de producto real. Debe parecer una aplicación SaaS actual.
>
> Pantallas necesarias:
>
> - dashboard principal
> - menú semanal
> - gestión de ingredientes
> - recetas guardadas con filtros
> - detalle de receta
> - preferencias del usuario
>
> Incluye navegación clara, tarjetas, filtros, formularios simples, botones de acción destacados, estados vacíos y textos de ejemplo realistas en español.

**Por qué funcionó:**
Sirvió para explorar rápidamente una dirección visual coherente: navegación lateral, dashboard, tarjetas, filtros y estructura tipo SaaS.

**Qué se ajustó después:**
No se copió el diseño completo; se usó como referencia visual y se adaptó al MVP real implementado.

---

## 3. Backend, PostgreSQL e integración IA con fallback

**Herramienta:** Codex / Antigravity
**Objetivo:** Crear una base backend funcional sin depender al 100% de una clave externa de IA.

**Prompt usado:**

> Implementa un backend con FastAPI y PostgreSQL para gestionar ingredientes, recetas, preferencias y menús semanales.
>
> El backend debe incluir modelos persistentes para ingredientes, recetas, menús semanales y relaciones entre platos y recetas.
>
> Además, crea un servicio de integración con Gemini 2.0 Flash Lite para generar menús semanales, proponer sustituciones y explicar por qué se eligió cada plato.
>
> Si no existe clave de Gemini configurada, la aplicación no debe fallar: debe usar un fallback local documentado para permitir una demo funcional.
>
> Mantén separada la lógica de dominio, persistencia e integración con IA. Añade manejo de errores y deja el comportamiento documentado en README y CLAUDE.md.

**Por qué funcionó:**
Separó la integración con IA del dominio principal y redujo el riesgo de que la demo quedara bloqueada por falta de clave o cuota.

**Qué se ajustó después:**
Se añadió un aviso previo en la UI cuando no hay clave de Gemini, en lugar de mostrar el origen IA/fallback dentro del menú generado.

---

## 4. Flujo de generación, ingredientes insuficientes y modo demo

**Herramienta:** Codex / Antigravity
**Objetivo:** Mejorar la experiencia de usuario antes de generar un menú.

**Prompt usado:**

> Corrige y mejora el flujo de generación de menú semanal cuando faltan ingredientes o falta la clave de IA.
>
> Si el usuario intenta generar un menú y no tiene ingredientes:
>
> - no redirigir automáticamente a Ingredientes
> - mostrar un modal claro
> - explicar que primero necesita añadir ingredientes
> - ofrecer acciones: “Ir a ingredientes”, “Añadir ingredientes de prueba” y “Cancelar”
>
> Añade también una validación de ingredientes mínimos. No debe generarse un menú con solo uno o dos ingredientes. Si hay pocos ingredientes, mostrar un aviso antes de llamar a Gemini o al fallback.
>
> Si hay suficientes ingredientes pero no hay clave de Gemini configurada:
>
> - mostrar un aviso antes de generar
> - explicar que se usará modo demo/fallback local
> - permitir continuar o cancelar
>
> No mostrar después en el menú etiquetas protagonistas como “Gemini real” o “fallback local”. Esa diferencia debe quedar documentada en README, no como parte principal de la UI.

**Por qué funcionó:**
Mejoró la UX de decisión: evita redirecciones inesperadas, valida mínimos útiles y mantiene la app funcional sin clave de IA.

**Qué se ajustó después:**
El botón de ingredientes de prueba se movió al modal correspondiente, para que no apareciera como acción principal fuera de contexto.

---

## 5. Mejora de ingredientes, preferencias y recetas para alimentar mejor la IA

**Herramienta:** Codex / Antigravity
**Objetivo:** Hacer que los datos usados por la IA fueran más realistas y útiles.

**Prompt usado:**

> Vamos a mejorar ingredientes, preferencias y recetas para que la generación de menú sea coherente con la idea principal del producto.
>
> Ingredientes:
>
> - “Añadir ingrediente” debe abrir un modal.
> - El modal debe incluir nombre, categoría, cantidad y fecha de caducidad con calendario.
> - Las categorías deben venir de base de datos, con algunas precargadas.
> - Añadir filtros por nombre, categoría, fecha de caducidad ASC/DESC y cantidad si es viable.
>
> Preferencias:
>
> - Los ingredientes excluidos deben seleccionarse desde los ingredientes existentes en la nevera.
> - La generación del menú debe respetar esos ingredientes excluidos.
>
> Recetas:
>
> - Las tarjetas deben ser clicables y abrir el detalle.
> - Añadir botón para crear recetas propias.
> - Añadir sistema de favoritos.
> - Las favoritas deben tener más peso en la generación del menú si encajan con los ingredientes disponibles.
>
> Generación de menú:
>
> - Usar ingredientes disponibles, preferencias, ingredientes excluidos, recetas guardadas, favoritas e historial.
> - Priorizar recetas guardadas y favoritas compatibles.
> - Generar recetas nuevas solo si no hay suficientes recetas guardadas compatibles.
> - No inventar ingredientes principales que no estén en la nevera.

**Por qué funcionó:**
Convirtió la nevera, las preferencias y el recetario en fuentes reales para el generador, reforzando la propuesta principal del producto.

**Qué se ajustó después:**
Se separaron algunas mejoras por fases para evitar meter demasiada complejidad de golpe y mantener el MVP estable.

---

## 6. UI escalable para ingredientes excluidos

**Herramienta:** Codex / Antigravity
**Objetivo:** Hacer usable la selección de ingredientes excluidos cuando la nevera crece.

**Prompt usado:**

> Vamos a mejorar la UI/UX de la sección "Ingredientes excluidos" en Preferencias. La lista actual como cuadrícula de tarjetas grandes no escala bien si el usuario tiene 20, 40 o más ingredientes.
>
> Sustituye la cuadrícula por un componente compacto con buscador, filtros rápidos por categoría, lista con checkboxes, scroll interno, resumen de selección, chips de ingredientes excluidos, limpiar selección y estado  vacío con botón "Ir a ingredientes".

**Por qué funcionó:**
Convierte una lista visualmente pesada en un selector compacto y escalable sin tocar el contrato de generación.

**Qué se ajustó después:**
Se mantuvieron los IDs reales de ingredientes y se persistieron las preferencias en el navegador para no perder exclusiones al refrescar.

---

## 7. Recetario manual, navegación y favoritos

**Herramienta:** Codex / Antigravity
**Objetivo:** Sustituir el flujo de variantes por edición, creación manual y favoritas con peso en la generación.

**Prompt usado:**

> Vamos a mejorar la sección de recetas: quitar "Crear variante", hacer las tarjetas navegables, añadir "Añadir receta", permitir foto, ingredientes, cantidades, pasos, tiempo, dificultad, raciones y etiquetas, y añadir favoritas que pesen más en la generación si encajan.

**Por qué funcionó:**
Refuerza el recetario como fuente real del menú: el usuario puede crear, editar, abrir y marcar favoritas sin depender de un flujo secundario de variantes.

**Qué se ajustó después:**
El backend prioriza favoritas compatibles en el prompt/fallback, pero sigue permitiendo recetas nuevas si las guardadas no encajan con nevera y preferencias.

---

## 8. Reservar Gemini para el flujo principal del menú

**Herramienta:** Codex / Gemini
**Objetivo:** Reducir consumo de cuota y dejar Gemini solo para la generación semanal del menú.

**Prompt usado:**

> Quiero cambiar la estrategia del proyecto para hacer un uso mucho más eficiente de Gemini: Gemini debe quedar reservado solo para la generación de menús semanales y la resolución de imágenes debe salir de Gemini por completo.

**Por qué funcionó:**
Obligó a separar claramente lo crítico del producto de lo accesorio: el presupuesto de Gemini se reserva al menú semanal y las imágenes dejan de competir por cuota.

**Qué se ajustó después:**
La UI de menú pasó a comunicar mejor los estados de saturación, cooldown y error temporal de Gemini, mientras que el recetario dejó de lanzar resoluciones automáticas al cargar.

---

## 9. Resolución de imágenes por búsqueda HTTP y candidatos cacheados

**Herramienta:** Codex / Antigravity
**Objetivo:** Sacar las imágenes fuera de Gemini y convertirlas en un flujo secundario, barato y controlado.

**Prompt usado:**

> La resolución de imágenes ya no debe usar Gemini. Dada una receta, usa el nombre del plato para buscar candidatos por HTTP, valida una lista corta, persiste esos candidatos y haz que el botón de reintento avance entre alternativas ya encontradas en lugar de lanzar una nueva búsqueda completa.

**Por qué funcionó:**
Movió la complejidad a un flujo mucho más predecible: se buscan páginas por HTTP, se extraen imágenes desde metadatos estándar y se reutilizan candidatos ya validados sin gastar cuota de Gemini.

**Qué se ajustó después:**
Se limitó el número de alternativas visibles por receta y se introdujo el estado `attempts_exhausted` para dejar de insistir cuando ya no compensa seguir buscando.

---

## 10. Robustez del generador semanal con IA

**Herramienta:** Codex / Antigravity
**Objetivo:** Evitar que la generación semanal caiga a `fallback-local` por respuestas parcialmente inválidas del modelo.

**Prompt usado:**

> Quiero robustecer la generación semanal con IA: registrar por qué se rechaza un payload parseable, hacer un retry controlado antes del fallback, intentar reparar slots inválidos y dejar trazabilidad clara de los casos `rate_limited`, `upstream_error`, `invalid` o `not_found`.

**Por qué funcionó:**
Permitió diagnosticar problemas reales del flujo, reducir fallback silencioso y dejar logs defendibles en `system_logs` sobre validación, retry y rechazo de Gemini.

**Qué se ajustó después:**
Se endurecieron después las reglas de despensa básica y se priorizó devolver error controlado ante `429` o saturación temporal, en lugar de persistir menús de fallback engañosos.

---

## 11. Reglas domésticas de despensa y UX de estados

**Herramienta:** Codex / Antigravity
**Objetivo:** Hacer el producto más realista en cocina doméstica y mejorar los estados visuales de espera, rate limit y resolución de imagen.

**Prompt usado:**

> Ajusta la lógica del generador para aceptar una despensa básica limitada sin vaciar el valor del producto, trata aceite de oliva, sal, pimienta y agua como apoyo libre, evita invalidaciones artificiales y revisa la UX para que la generación semanal y la resolución de imagen siempre muestren carga, cooldown, error o éxito de forma clara y sin glitches visuales.

**Por qué funcionó:**
Mejoró dos capas a la vez: las recetas rechazaban menos casos razonables y la interfaz dejó de dar sensación de bloqueo silencioso o mezcla de estados contradictorios.

**Qué se ajustó después:**
La grid de recetas se limpió visualmente para quitar badges técnicos de la superficie principal y dejar la trazabilidad técnica en el detalle de receta y en logs.

---

## 12. Corrección del flujo de reintento de imagen

**Herramienta:** Codex / Antigravity
**Objetivo:** Eliminar glitches visuales y convertir el reintento de imagen en una rotación limpia entre candidatos ya encontrados.

**Prompt usado:**

> Revisa el flujo de reintento de imagen en el detalle de receta. Quiero una máquina de estados clara, sin mezclar “Buscando...” con errores viejos, con botón deshabilitado durante la espera y haciendo que cada reintento avance a la siguiente alternativa cacheada en vez de repetir la búsqueda completa.

**Por qué funcionó:**
Obligó a separar correctamente el estado de carga del estado previo, a evitar llamadas duplicadas y a convertir el reintento en un flujo determinista y mucho menos costoso.

**Qué se ajustó después:**
La UI pasó a distinguir mejor entre `pending`, `invalid`, `not_found`, `upstream_error` y `attempts_exhausted`, con copy específico para resolución de imagen por HTTP.

---

## 13. Evaluación de Ollama local para la generación textual

**Herramienta:** Codex / Ollama
**Objetivo:** Evaluar si un proveedor local de texto podía convertirse en el camino principal para generar el menú semanal y las sustituciones sin depender de servicios externos.

**Prompt usado:**

> Separa la arquitectura para soportar un proveedor local de texto y valida si un flujo con Ollama en CPU puede sostener la generación semanal completa con suficiente estabilidad y latencia razonable para la prueba técnica.

**Por qué funcionó:**
Permitió comprobar con datos reales que el desacoplamiento arquitectónico era correcto, pero también que la generación semanal completa con modelo pequeño en CPU seguía siendo demasiado frágil para esta entrega.

**Qué se ajustó después:**
La decisión final fue no mezclar ese experimento con la entrega principal. La rama `main` se mantiene en la vía más estable y el experimento local con Ollama queda preservado en `experiment/local-ollama-menu` para retomarlo más adelante.

---

## 14. Control de cuota y tráfico secundario

**Herramienta:** Codex / Antigravity
**Objetivo:** Evitar que la vista de recetas dispare tráfico secundario innecesario y reservar Gemini para los menús, sin renunciar a mejorar la grid progresivamente.

**Prompt usado:**

> Revisa si la vista de recetas está disparando búsquedas de imagen al cargar y rediseña el flujo para que la resolución use una cola progresiva pequeña: solo unas pocas recetas visibles, un único lote en vuelo, candidatos cacheados y sin competir con la generación del menú semanal.

**Por qué funcionó:**
Forzó una política más realista para el MVP: las imágenes enriquecen el producto, pero no deben competir con el flujo principal ni lanzar tormentas de llamadas al entrar en `Recetas`.

**Qué se ajustó después:**
La grid pasó a completar imágenes de forma progresiva y controlada sobre un pequeño conjunto de recetas visibles. Cada lote resuelve pocas recetas, reutiliza candidatos cacheados y deja fuera cualquier reintento automático cuando una receta ya agotó sus intentos o entró en un estado final.

---

## 15. Restricciones duras de dieta y explicaciones limpias

**Herramienta:** Codex / Antigravity
**Objetivo:** Evitar que una dieta vegetariana deje pasar proteínas animales y limpiar el texto explicativo para que suene a producto, no a prompt interno.

**Prompt usado:**

> Quiero que la dieta vegetariana se trate como una restricción obligatoria en backend y que el campo “Por qué este plato” se limpie o regenere si filtra instrucciones internas del sistema.

**Por qué funcionó:**
Forzó a dejar de confiar solo en el prompt. La validación semanal ahora invalida carne, pescado y marisco cuando el usuario marca vegetariano, y el campo `explanation` pasa por una capa de saneado para que no mencione reglas, contexto o razonamiento interno.

**Qué se ajustó después:**
La misma regla dura se aplicó también al contexto de recetas guardadas compatibles para no alimentar al modelo con recetas que ya nacen fuera de dieta.

---

## 16. Prevalidación contextual antes de gastar cuota

**Herramienta:** Codex / Antigravity
**Objetivo:** Evitar llamadas inútiles a Gemini cuando las preferencias dejan una base de ingredientes demasiado pobre para construir una semana válida.

**Prompt usado:**

> Antes de llamar a la IA, calcula los ingredientes realmente compatibles con dieta, restricciones, exclusiones y nivel de variedad. Si no queda una base mínima viable, no hagas la llamada y devuelve un mensaje claro explicando que faltan ingredientes compatibles o que hace falta relajar alguna preferencia.

**Por qué funcionó:**
Convirtió un error genérico al final del flujo en una decisión temprana y explicable. El backend ahora corta antes de gastar cuota cuando la combinación de filtros deja demasiado poco margen real para construir el menú semanal.

**Qué se ajustó después:**
La validación se hizo contextual en lugar de limitarse a la regla fija de “menos de 5 ingredientes”: endurece el umbral si coinciden restricciones de dieta, baja en carbohidratos o variedad alta, y devuelve un mensaje accionable con los factores que están bloqueando la generación.

---

## 17. Selección de imágenes más práctica para platos simples

**Herramienta:** Codex / Antigravity
**Objetivo:** Evitar que recetas sencillas como ensaladas, bowls o salteados se queden sin imagen por una heurística demasiado literal.

**Prompt usado:**

> Relaja la selección de imágenes para aceptar resultados visualmente razonables del mismo tipo de plato aunque tengan algún ingrediente secundario extra. Rechaza solo lo claramente irrelevante.

**Por qué funcionó:**
Atacó el sitio correcto: no se relajó la validación HTTP de la imagen, sino la heurística de recuperación. Las búsquedas pasan a ser menos literales y el descarte por URL deja de bloquear términos como `banner` que en muchos sitios de recetas corresponden justo a la imagen principal del plato.

**Qué se ajustó después:**
La estrategia se mantiene conservadora con ruido evidente (`logo`, `icon`, `avatar`, `placeholder`), pero deja de exigir una coincidencia demasiado rígida entre el nombre exacto de la receta y la imagen recuperada.

---

## 18. Búsqueda semántica para recetas simples y postres lácteos

**Herramienta:** Codex / Antigravity
**Objetivo:** Evitar que recetas genéricas como yogur con fruta, ensaladas o bowls se queden sin imagen por depender demasiado del título exacto.

**Prompt usado:**

> Para recetas simples o genéricas, genera queries más naturales y semánticas por familia visual del plato: yogur con frutas, copa de yogur, parfait, postre lácteo, ensalada, bowl o tostada. No quiero que la búsqueda dependa solo del título exacto.

**Por qué funcionó:**
Corrigió el cuello de botella real: las búsquedas por título completo eran pobres para platos sencillos. Al introducir familias visuales y variantes naturales, el backend llega a páginas mucho más útiles sin relajar la validación HTTP de la imagen.

**Qué se ajustó después:**
Se mantuvo el descarte de ruido claro (`logo`, `icon`, `avatar`, `placeholder`), pero la recuperación ya no penaliza recetas como `Yogur con Fruta Fresca y Queso`, donde el queso puede no ser evidente visualmente aunque la imagen represente bien el plato.

---

## 19. Refactorización táctica del frontend antes de la entrega

**Herramienta:** Codex / Antigravity
**Objetivo:** Reducir el tamaño y la complejidad de `frontend/app/page.tsx` sin abrir una reescritura ni cambiar el comportamiento visible de la app.

**Prompt usado:**

> Quiero una refactorización táctica del frontend: extrae solo los bloques visuales grandes y cohesionados que de verdad bajen el peso de `page.tsx`, manteniendo la página principal como contenedor de estado y composición.

**Por qué funcionó:**
Fijó bien el alcance. En lugar de mover medio frontend, la refactorización se centró en componentes con responsabilidad clara (`RecipeDetailView`, `RecipeModal`, `IngredientModal`, banners y superficies visuales) y en un módulo compartido de tipos y helpers.

**Qué se ajustó después:**
`page.tsx` pasó de 3778 a 2101 líneas manteniendo la misma UX visible, el mismo contrato con backend y la misma orquestación principal dentro de `Home`.

---

## 20. Galería de alternativas para imágenes de receta

**Herramienta:** Codex / Antigravity
**Objetivo:** Dejar atrás el flujo ciego de “probar otra imagen” y convertir la selección de imagen en una galería real sobre candidatos ya cacheados.

**Prompt usado:**

> Si una receta ya tiene candidatos de imagen cacheados, no quiero más reintentos lineales. Quiero navegar libremente entre alternativas, volver a una anterior, elegir una como definitiva o dejar la receta sin foto, sin lanzar nuevas búsquedas.

**Por qué funcionó:**
Obligó a separar dos conceptos que antes estaban mezclados: la alternativa que el usuario está previsualizando y la foto que queda finalmente persistida. Con ese ajuste, el backend conserva el cache y el frontend puede tratarlo como una galería pequeña y estable.

**Qué se ajustó después:**
La receta ahora expone `image_candidates` e `image_candidate_index`, el detalle permite moverse con `Anterior` y `Siguiente`, elegir `Usar esta imagen` o `Quitar foto`, y la búsqueda HTTP solo se vuelve a lanzar cuando de verdad no hay candidatos guardados.

---

# Roadmap después del MVP

- Autenticación real mediante JSON WEB TOKEN y perfiles de usuario.
- Migraciones con Alembic.
- Tests unitarios y E2E con Playwright.
- Lista de compra agregada por semana.
- Objetivos nutricionales y restricciones médicas verificables.
- Mejor control de coste, cuota y trazabilidad de prompts.
- Preferencias por cantidad de personas en la familia.
- Recetas con resta automática de ingredientes en la nevera usados.
