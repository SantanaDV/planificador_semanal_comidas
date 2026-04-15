# Planificador semanal de comidas con IA

Aplicacion web para crear menus semanales a partir de ingredientes disponibles, preferencias e historial de recetas. El MVP usa Next.js, FastAPI, PostgreSQL y Docker Compose. La generacion textual del menu ya esta preparada para usar un proveedor local de texto via Ollama, mientras que Gemini queda reservado para la resolucion opcional de imagenes de recetas.

## Entregables de la prueba

- Repositorio ejecutable con instrucciones locales.
- Video de maximo 3 minutos explicando problema, solucion, uso de IA y mejoras.
- Prompt log con al menos 3 prompts clave.

## Funcionalidad MVP

- Usuario demo sin login.
- Alta y eliminacion de ingredientes con categoria persistida, cantidad y fecha de caducidad.
- Generacion de menu semanal con comida y cena de lunes a domingo.
- Preferencias estructuradas con ingredientes excluidos seleccionados desde la nevera real.
- Guardado automatico de recetas generadas.
- Sustitucion de platos del menu.
- Repeticion de recetas guardadas en un hueco del menu.
- Recetario con filtro, eliminacion, favoritas y creacion manual de recetas.
- Detalle editable de receta con foto, ingredientes, cantidades, pasos, dificultad, raciones y etiquetas.
- Resolucion bajo demanda de imagen real para recetas, con validacion minima de `image_url`, fuente y estado de busqueda.
- Explicacion breve de por que se eligio cada plato.
- Estado vacio de ingredientes y carga de ingredientes de prueba bajo demanda en base de datos.
- Logging transversal en base de datos para eventos de backend, frontend, IA y planificacion.

## Requisitos

- Docker Desktop con Docker Compose.
- Integracion WSL activada si se ejecuta desde WSL en Windows.
- Node.js 20.9+ si ejecutas el frontend sin Docker.
- Python 3.12 si ejecutas el backend sin Docker.
- Ollama levantado localmente si quieres probar la generacion textual real en esta fase.
- Clave de Gemini API solo si quieres probar la resolucion de imagenes reales.

## Arranque rapido con Docker

Este es el flujo recomendado para levantar el proyecto y dejar preparada la configuracion local. En esta fase, `docker-compose` sigue levantando frontend, backend y base de datos, pero el servicio de Ollama todavia no se integra dentro del propio Compose.

### 1. Preparar variables de entorno

WSL / Linux / macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 2. Preparar Ollama local para la generacion textual

Ejemplo de arranque fuera de Docker Compose:

```bash
ollama serve
ollama pull qwen2.5:1.5b
```

Si no tienes `ollama` instalado todavia, consulta la documentacion oficial: https://docs.ollama.com/

### 3. Crear una clave Gemini API en Google AI Studio

Paso a paso contrastado con la documentacion oficial de Google AI for Developers:

1. Entra en Google AI Studio: https://aistudio.google.com/
2. Inicia sesion con tu cuenta de Google.
3. Si es tu primera vez, acepta los terminos de servicio cuando te los pida AI Studio.
4. Abre la pagina de claves: https://aistudio.google.com/apikey
5. Si AI Studio ya te muestra un proyecto y una clave, puedes usar esa clave.
6. Si no ves un proyecto disponible:
   - abre `Dashboard`
   - entra en `Projects`
   - si eres usuario nuevo, AI Studio puede haberte creado un proyecto por defecto automaticamente
   - si ya tenias proyectos de Google Cloud, usa `Import projects` y busca tu proyecto por nombre o `project ID`
7. Vuelve a `API Keys` y crea una clave en el proyecto elegido.
8. Copia la clave y guardala localmente. No se vuelve a publicar desde este repositorio.

Casos reales a tener en cuenta:

- Si el boton de crear clave aparece deshabilitado o ves un mensaje del tipo `You do not have permission to create a key in this project`, el problema no es del proyecto: faltan permisos en Google Cloud sobre ese proyecto.
- Si no tienes permisos sobre un proyecto corporativo u organizacional, la salida mas simple para esta prueba es crear o usar un proyecto personal que controles.
- Google AI Studio muestra y gestiona las claves desde su propia pagina de `API Keys`, pero para administracion avanzada o restricciones puedes ir despues a Google Cloud Console.

### 4. Configurar `.env`

Abre `.env` y deja, como minimo:

```bash
TEXT_AI_PROVIDER=ollama
IMAGE_AI_PROVIDER=gemini
LOCAL_TEXT_BASE_URL=http://localhost:11434
LOCAL_TEXT_MODEL=qwen2.5:1.5b
GEMINI_API_KEY=tu_clave_real_aqui
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_ENABLE_GOOGLE_SEARCH=true
```

No subas `.env` al repositorio. La clave Gemini se usa solo en el backend y unicamente para imagenes; el frontend no la recibe.

### 5. Levantar la aplicacion

```bash
docker compose up --build
```

Docker arranca:

- PostgreSQL en `localhost:5432`
- backend FastAPI en `localhost:8000`
- frontend Next.js en `localhost:3000`

El frontend se ejecuta con `next start` sobre una build de produccion. Si quieres recarga en caliente, usa la ejecucion sin Docker.

### 6. Verificar que todo ha arrancado

```bash
curl http://localhost:8000/health
```

Respuesta esperada:

```json
{"status":"ok"}
```

### 7. Verificar el proveedor de texto configurado

```bash
curl http://localhost:8000/ai/status
```

Si la configuracion esta bien cargada, deberias ver algo parecido a:

```json
{
  "provider": "ollama",
  "model": "qwen2.5:1.5b",
  "configured": true,
  "mode": "ai"
}
```

Si `configured` sale `false`, o la generacion devuelve error, revisa:

- que `TEXT_AI_PROVIDER=ollama`
- que `LOCAL_TEXT_BASE_URL` apunta a un Ollama real
- que `LOCAL_TEXT_MODEL` existe ya en tu instancia de Ollama
- que has levantado Docker despues de editar `.env`
- que tu equipo tiene recursos suficientes para ejecutar el modelo local en CPU

### 8. Abrir la app

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs
- Healthcheck: http://localhost:8000/health

### 9. Comprobar el flujo real

1. Entra en `Ingredientes`.
2. Si no quieres cargar ingredientes a mano, usa el flujo de ingredientes de prueba desde la UI cuando el generador te lo ofrezca.
3. Pulsa `Generar menu semanal`.
4. Si Ollama esta levantado y responde en `LOCAL_TEXT_BASE_URL`, el backend intentara generar el menu con IA local.
5. Si Gemini esta configurado, la app podra enriquecer imagenes de recetas bajo demanda, pero eso no afecta a la generacion principal del menu.

Nota practica de esta fase:

- `qwen2.5:1.5b` es el mejor equilibrio encontrado hasta ahora entre calidad y peso en local.
- En CPU, la generacion semanal puede seguir siendo lenta y devolver un error claro si Ollama no responde a tiempo o no cierra un menu valido.
- Las sustituciones puntuales responden mejor que la generacion semanal completa.

## Creacion de la clave Gemini API: resumen corto

Si solo quieres el minimo imprescindible:

1. Ve a https://aistudio.google.com/apikey
2. Inicia sesion
3. Crea o importa un proyecto si hace falta
4. Genera una API key
5. Copiala en `.env` como `GEMINI_API_KEY=...`
6. Reinicia `docker compose up --build`
7. Comprueba `curl http://localhost:8000/ai/status`

Sin una `GEMINI_API_KEY` valida, la app sigue funcionando para la parte critica del menu si Ollama esta disponible; lo que se pierde es la resolucion real de imagenes. Si no hay ingredientes en la nevera, la app no genera un menu con datos inventados: muestra un estado vacio y permite cargar ingredientes de prueba en PostgreSQL desde la UI.

## Ejecucion local sin Docker

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

| Variable                        | Uso                                                                      | Valor por defecto            |
| ------------------------------- | ------------------------------------------------------------------------ | ---------------------------- |
| `TEXT_AI_PROVIDER`            | Proveedor principal de texto (`ollama`, `gemini`, `deterministic`).      | `ollama`                     |
| `IMAGE_AI_PROVIDER`           | Proveedor de resolucion de imagenes.                                     | `gemini`                     |
| `LOCAL_TEXT_BASE_URL`         | URL base del proveedor local de texto.                                   | `http://localhost:11434`     |
| `LOCAL_TEXT_MODEL`            | Modelo local usado para menu y sustituciones.                            | `qwen2.5:1.5b`               |
| `GEMINI_API_KEY`              | Clave local de Gemini API para imagenes bajo demanda.                    | vacio                        |
| `GEMINI_MODEL`                | Modelo usado para `generateContent`.                                   | `gemini-2.5-flash-lite`    |
| `GEMINI_ENABLE_GOOGLE_SEARCH` | Activa la busqueda web de Gemini para intentar resolver imagenes reales. | `true`                     |
| `DATABASE_URL`                | Conexion SQLAlchemy del backend.                                         | SQLite local fuera de Docker |
| `NEXT_PUBLIC_API_URL`         | URL de la API para el navegador.                                         | `http://localhost:8000`    |

La clave no debe escribirse en codigo ni commitearse. Google recomienda tratarla como una contrasena, no exponerla en cliente y preferir llamadas server-side. Por eso la app llama a Gemini desde FastAPI y solo publica `.env.example` con placeholders.

## Problemas habituales al crear o usar la clave Gemini

### `configured: false` en `/ai/status`

Suele deberse a uno de estos casos:

- `.env` no existe o no se copio desde `.env.example`
- la clave no se pego realmente en `GEMINI_API_KEY`
- editaste `.env` despues de levantar Docker y no reconstruiste
- hay espacios, comillas o saltos de linea extra en la clave

Solucion:

```bash
docker compose up --build
curl http://localhost:8000/ai/status
```

### No puedes crear la clave en Google AI Studio

Segun la documentacion oficial de Google, suele deberse a permisos insuficientes sobre el proyecto de Google Cloud asociado.

Soluciones practicas para esta prueba:

- usar un proyecto personal
- importar manualmente el proyecto correcto desde `Dashboard > Projects > Import projects`
- pedir permisos si es un proyecto compartido u organizacional

### La clave existe, pero el modelo devuelve errores temporales

Puede ocurrir por:

- cuota o rate limit del plan disponible
- saturacion temporal del proveedor
- clave bloqueada o filtrada

La app registra estos casos en `system_logs` y distingue entre error, saturacion y fallback. Si necesitas revisar trazas:

```bash
curl "http://localhost:8000/logs?module=ai&limit=20"
```

## Datos de prueba y fallback

- La app no precarga ingredientes al arrancar.
- Las categorias de ingredientes viven en la base de datos y se crean en arranque si faltan: Verduras, Frutas, Proteinas, Lacteos, Cereales, Legumbres, Especias y Otros.
- La vista Ingredientes usa un modal para anadir alimentos con nombre, categoria, cantidad y fecha de caducidad.
- Los filtros de Ingredientes permiten buscar por nombre/categoria, filtrar por categoria y ordenar por caducidad o cantidad. Por defecto se priorizan los proximos a caducar.
- Si la nevera esta vacia o tiene menos de 5 ingredientes, al intentar generar menu aparece un modal con opciones para ir a Ingredientes, cargar ingredientes de prueba o cancelar.
- Al pulsar "Anadir ingredientes de prueba" en ese aviso, el frontend llama a `POST /ingredients/demo` y el backend guarda esos ingredientes en la base de datos.
- La generacion de menus exige al menos 5 ingredientes reales guardados, ya sean introducidos manualmente o cargados mediante el endpoint demo.
- Los ingredientes excluidos se seleccionan desde los ingredientes existentes en la nevera. Si tras aplicar exclusiones quedan menos de 5 ingredientes disponibles, la app avisa antes de llamar a Gemini o al fallback.
- El backend pasa como contexto recetas guardadas compatibles y prioriza las favoritas compatibles sin forzarlas si no encajan.
- La generacion semanal prioriza estabilidad: Gemini construye el menu y las recetas sin intentar resolver imagenes para los 14 platos en la misma llamada.
- La resolucion de imagenes reales se hace bajo demanda al entrar en Recetas para un lote pequeno de recetas nuevas y tambien desde el detalle de receta cuando hace falta reintentar.
- Con `gemini-2.5-flash-lite`, el uso de tools no se puede combinar con `responseMimeType=application/json`, asi que el backend usa JSON estricto para la generacion del menu y parseo controlado por prompt en la resolucion de imagen.
- La IA prioriza `image_source_url` como pagina fuente del plato. El backend intenta extraer una imagen real desde metadatos estandar de esa pagina (`og:image`, `twitter:image`, JSON-LD/schema.org `) y solo usa `image_url` directa si pasa validacion.
- El backend valida la URL de imagen con una comprobacion HTTP minima y degrada a `image_url = null` cualquier valor sospechoso, no accesible o que no responda como imagen real.
- Los estados de resolucion distinguen entre `found`, `invalid`, `not_found`, `rate_limited` y `upstream_error`.
- Si la IA no encuentra una imagen fiable, la receta sigue siendo valida y el frontend muestra un placeholder limpio con opcion de reintento.
- El fallback local vive separado en `backend/app/demo_fallback.py` y solo se usa cuando Gemini no esta configurado o cuando la llamada externa falla.
- Si hay suficientes ingredientes pero no hay clave valida de Gemini, la app avisa antes de generar y permite continuar con modo demo local.

## RTK

El archivo `RTK.md` contiene el checklist operativo antes de entregar: claves, Docker, flujo demo, prompt log y video. Usalo como ultima revision junto con este README.

## Logging y errores

La app guarda logs estructurados en la tabla `system_logs`. Cada registro incluye:

- `level`: `info`, `warning` o `error`.
- `module`: origen del evento, por ejemplo `frontend`, `api`, `backend`, `database`, `ai` o `menu_planning`.
- `message`: descripcion corta y legible.
- `context`: JSON con datos utiles para depurar, sin secretos.
- `stack_trace`: detalle tecnico opcional para errores.
- `created_at`: fecha y hora del evento.

Endpoints utiles:

```bash
curl http://localhost:8000/logs
curl "http://localhost:8000/logs?module=frontend&limit=20"
```

## Flujo de demo

1. Pulsa "Generar menu semanal". Si no hay ingredientes, la app mostrara un aviso para ir a Ingredientes o cargar ingredientes de prueba.
2. Si hay menos de 5 ingredientes, la app pedira ampliar la nevera antes de generar.
3. Ajusta preferencias: tipo de dieta, restricciones, ingredientes excluidos desde tu nevera, objetivos y variedad semanal.
4. Pulsa "Generar menu semanal".
5. Si no hay clave valida de Gemini, acepta el aviso para continuar con modo demo.
6. Sustituye un plato para mostrar el flujo de regeneracion.
7. Repite una receta guardada desde el selector.
8. Filtra el recetario, abre una tarjeta, crea una receta manual, marca una favorita y edita raciones, dificultad, foto, ingredientes o pasos.
9. Entra en Recetas para que la app intente resolver imagenes de nuevas recetas en segundo plano. Si una sigue sin foto, abre su detalle y reintenta desde ahi sin bloquear la generacion semanal.

## Referencias oficiales usadas para esta configuracion

- Google AI Studio / Gemini API: https://ai.google.dev/aistudio
- Gestion de claves Gemini API: https://ai.google.dev/gemini-api/docs/api-key
- Referencia API Gemini: https://ai.google.dev/api
- Troubleshooting oficial Gemini API: https://ai.google.dev/gemini-api/docs/troubleshooting

## Guion sugerido para video de 3 minutos

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
**Objetivo:** Hacer usable la seleccion de ingredientes excluidos cuando la nevera crece.

**Prompt usado:**

> Vamos a mejorar la UI/UX de la seccion "Ingredientes excluidos" en Preferencias. La lista actual como cuadricula de tarjetas grandes no escala bien si el usuario tiene 20, 40 o mas ingredientes.
>
> Sustituye la cuadricula por un componente compacto con buscador, filtros rapidos por categoria, lista con checkboxes, scroll interno, resumen de seleccion, chips de ingredientes excluidos, limpiar seleccion y estado vacio con boton "Ir a ingredientes".

**Por qué funcionó:**
Convierte una lista visualmente pesada en un selector compacto y escalable sin tocar el contrato de generacion.

**Qué se ajustó después:**
Se mantuvieron los IDs reales de ingredientes y se persistieron las preferencias en el navegador para no perder exclusiones al refrescar.

---

## 7. Recetario manual, navegación y favoritos

**Herramienta:** Codex / Antigravity
**Objetivo:** Sustituir el flujo de variantes por edicion, creacion manual y favoritas con peso en la generacion.

**Prompt usado:**

> Vamos a mejorar la seccion de recetas: quitar "Crear variante", hacer las tarjetas navegables, anadir "Anadir receta", permitir foto, ingredientes, cantidades, pasos, tiempo, dificultad, raciones y etiquetas, y anadir favoritas que pesen mas en la generacion si encajan.

**Por qué funcionó:**
Refuerza el recetario como fuente real del menu: el usuario puede crear, editar, abrir y marcar favoritas sin depender de un flujo secundario de variantes.

**Qué se ajustó después:**
El backend prioriza favoritas compatibles en el prompt/fallback, pero sigue permitiendo recetas nuevas si las guardadas no encajan con nevera y preferencias.

---

## 8. Metadatos visuales generados por IA

**Herramienta:** Codex / Gemini
**Objetivo:** Hacer que Gemini intente resolver una imagen real de la receta usando busqueda web, sin inventar URLs.

**Prompt usado:**

> Modifica la generacion para que Gemini use busqueda web y devuelva `image_url` real, `image_source_url`, `image_alt_text`, `image_lookup_status` e `image_lookup_reason`, dejando `image_url` en null cuando no pueda verificar una imagen fiable.

**Por qué funcionó:**
Permite que la propia llamada a Gemini intente resolver una imagen real del plato y que el backend solo persista lo que pasa una validacion minima.

**Qué se ajustó después:**
Fue necesario separar la resolucion de imagenes de la generacion semanal: con `gemini-2.5-flash-lite`, buscar 14 recetas con imagen en la misma llamada elevaba el riesgo de `ReadTimeout`, asi que el menu se genera primero y la imagen se resuelve bajo demanda en el detalle.

---

## 9. Resolucion de imagenes desde pagina fuente

**Herramienta:** Codex / Gemini
**Objetivo:** Dejar de depender de una `image_url` directa sugerida por Gemini y pasar a un flujo mas robusto basado en pagina fuente.

**Prompt usado:**

> Quiero la solucion arquitectonica y funcional mas robusta para la resolucion de imagenes en este MVP. Gemini debe ayudar a encontrar la pagina fuente del plato (`image_source_url`) y el backend debe extraer la imagen real desde metadatos estandar (`og:image`, `twitter:image`, `schema.org image`). La resolucion debe seguir siendo bajo demanda, no parte obligatoria de la generacion semanal, y debe distinguir entre `found`, `invalid`, `not_found`, `rate_limited` y `upstream_error`.

**Por qué funcionó:**
Cambió el problema desde “que Gemini adivine la URL final” a un flujo mucho mas estable: Gemini encuentra la pagina y el backend valida la imagen real.

**Qué se ajustó después:**
Se añadió persistencia de `image_lookup_attempted_at` y `image_lookup_retry_after`, junto con resolucion en lote pequeña al entrar en Recetas y reintento manual en el detalle.

---

## 10. Robustez del generador semanal con IA

**Herramienta:** Codex / Antigravity
**Objetivo:** Evitar que la generacion semanal caiga a `fallback-local` por respuestas parcialmente invalidas del modelo.

**Prompt usado:**

> Quiero robustecer la generacion semanal con IA: registrar por que se rechaza un payload parseable, hacer un retry controlado antes del fallback, intentar reparar slots invalidos y dejar trazabilidad clara de los casos `rate_limited`, `upstream_error`, `invalid` o `not_found`.

**Por qué funcionó:**
Permitió diagnosticar problemas reales del flujo, reducir fallback silencioso y dejar logs defendibles en `system_logs` sobre validacion, retry y rechazo de Gemini.

**Qué se ajustó después:**
Se endurecieron despues las reglas de despensa basica y se priorizo devolver error controlado ante `429` o saturacion temporal, en lugar de persistir menus de fallback engañosos.

---

## 11. Reglas domesticas de despensa y UX de estados

**Herramienta:** Codex / Antigravity
**Objetivo:** Hacer el producto mas realista en cocina domestica y mejorar los estados visuales de espera, rate limit y resolucion de imagen.

**Prompt usado:**

> Ajusta la logica del generador para aceptar una despensa basica limitada sin vaciar el valor del producto, trata aceite de oliva, sal, pimienta y agua como apoyo libre, evita invalidaciones artificiales y revisa la UX para que la generacion semanal y la resolucion de imagen siempre muestren carga, cooldown, error o exito de forma clara y sin glitches visuales.

**Por qué funcionó:**
Mejoró dos capas a la vez: las recetas rechazaban menos casos razonables y la interfaz dejó de dar sensacion de bloqueo silencioso o mezcla de estados contradictorios.

**Qué se ajustó después:**
La grid de recetas se limpió visualmente para quitar badges tecnicos de la superficie principal y dejar la trazabilidad tecnica en el detalle de receta y en logs.

---

## 12. Correccion del flujo de reintento de imagen

**Herramienta:** Codex / Antigravity
**Objetivo:** Eliminar glitches visuales y reintentos duplicados cuando Gemini se satura durante la resolucion de imagenes.

**Prompt usado:**

> Revisa el flujo de reintento de imagen en el detalle de receta cuando Gemini devuelve `rate_limited` o `upstream_error`. Quiero una maquina de estados clara, sin mezclar “Buscando...” con errores viejos, con boton deshabilitado durante la espera y sin duplicar llamadas por re-render o cambios de estado en React.

**Por qué funcionó:**
Obligó a separar correctamente el estado de carga del estado previo, a respetar `retry_after` y a poner una guarda local por `recipe_id` para evitar tormentas de peticiones en el frontend.

**Qué se ajustó después:**
El copy de la UI se hizo más específico: ahora habla de “resolucion de imagenes” y de saturacion de Gemini, en lugar de mostrar un error genérico que parecía romper la receta completa.

---

## 13. Desacoplamiento de texto e imagen para la IA

**Herramienta:** Codex / Antigravity
**Objetivo:** Separar internamente la generacion textual del menu de la resolucion de imagenes, sin cambiar aun el comportamiento externo del producto.

**Prompt usado:**

> Ejecuta una Fase 1 de desacoplamiento con el menor riesgo posible: crea `TextProvider`, `ImageProvider`, `TextGenerationService` e `ImageResolutionService`, encapsula el fallback actual como proveedor reutilizable y haz que `main.py` deje de depender directamente del modulo mixto actual, sin cambiar rutas ni romper el frontend.

**Por qué funcionó:**
Permitio preparar la arquitectura para introducir un proveedor local de texto en la siguiente fase sin rehacer la API ni tocar todavia Docker u Ollama.

**Qué se ajustó después:**
La configuracion pasa a distinguir `text_ai_provider` e `image_ai_provider`; Gemini sigue igual para imagenes y el texto mantiene el comportamiento actual hasta enchufar el proveedor local.

---

## 14. Proveedor local de texto con Ollama

**Herramienta:** Codex / Ollama
**Objetivo:** Sustituir a Gemini como proveedor principal de texto sin tocar todavia la capa de imagenes ni romper la API publica.

**Prompt usado:**

> Ejecuta la Fase 2: implementa `LocalOllamaTextProvider`, conecta `TextGenerationService` a un proveedor local por HTTP, manten la API publica estable, deja Gemini solo para imagenes y valida el flujo real con un modelo pequeno y razonable para esta prueba.

**Por qué funcionó:**
Permitio mover la responsabilidad critica del menu y las sustituciones a una interfaz local de texto reutilizando la validacion y las reglas de negocio existentes.

**Qué se ajustó después:**
Se probaron `qwen2.5:3b` y `qwen2.5:1.5b` en CPU. `3b` agotaba timeout con demasiada facilidad, asi que se dejo `qwen2.5:1.5b` como opcion por defecto. Para reducir latencia y mantener compatibilidad con la validacion actual, Ollama genera un JSON compacto y el backend completa el resto de campos mediante su normalizacion existente.

---

## 15. Estabilizacion del menu semanal local en CPU

**Herramienta:** Codex / Ollama
**Objetivo:** Reducir la fragilidad del menu semanal con un modelo local pequeno en CPU sin cambiar la API publica ni la logica de imagenes.

**Prompt usado:**

> Analiza por que el menu semanal local sigue siendo inestable con Ollama en CPU y aplica el cambio minimo mas defendible para esta prueba. Prioriza estabilidad real del menu semanal, manteniendo la API intacta y sin tocar todavia Docker Compose ni la capa de imagenes.

**Por qué funcionó:**
Obligo a dejar de tratar el menu semanal como una sola respuesta perfecta y a mover la estrategia hacia bloques adaptativos, con validacion por slot y recuperacion progresiva cuando el modelo no cierra bien el contexto.

**Qué se ajustó después:**
La generacion semanal local paso a usar bloques grandes por tipo de comida, con particion recursiva solo cuando un bloque falla, `num_predict` adaptativo y un formato delimitado por lineas para los bloques semanales en lugar de JSON anidado. El objetivo fue reducir errores de parsing y llamadas innecesarias cuando el modelo ya habia demostrado que un bloque completo no era fiable.

---

## 16. Intento final con weekly slot-first

**Herramienta:** Codex / Ollama
**Objetivo:** Confirmar si una estrategia de menu semanal basada directamente en generacion por slot era suficiente para cerrar el weekly local como camino principal del producto.

**Prompt usado:**

> Haz un ultimo intento acotado: convierte el weekly local a una estrategia slot-first reutilizando la ruta de sustitucion, valida de forma honesta y termina con una conclusion binaria sobre si compensa seguir o no para esta entrega.

**Por qué funcionó:**
Permitio aislar la pregunta correcta: no si la arquitectura ya estaba desacoplada, sino si el weekly local completo era realmente defendible en tiempo y estabilidad con `qwen2.5:1.5b` en CPU.

**Qué se ajustó después:**
La prueba final confirmo que el slot-first puro sigue tardando demasiado y no cierra el weekly con suficiente fiabilidad para esta entrega. La conclusion fue no seguir empujando esta via como camino principal sin cambiar el marco tecnico o el modelo.


# Estructura del video y presentación

- 0:00-0:25: problema cotidiano: planificar comidas consume tiempo y se repiten platos.
- 0:25-0:55: stack y arquitectura: Next.js, FastAPI, PostgreSQL, Docker, Gemini con fallback.
- 0:55-2:10: demo: ingredientes, preferencias, generar menu, sustituir plato, repetir receta y recetario con detalle editable.
- 2:10-2:35: uso de IA: Antigravity/Codex para desarrollo, Figma AI para explorar interfaz y Gemini para generar menus con ingredientes, preferencias e historial.
- 2:35-3:00: mejoras: login real, nutricion, tests E2E, migraciones y lista de compra.

Roadmap despues del MVP

- Autenticacion real y perfiles de usuario.
- Migraciones con Alembic.
- Tests unitarios y E2E con Playwright.
- Lista de compra agregada por semana.
- Objetivos nutricionales y restricciones medicas verificables.
- Mejor control de coste, cuota y trazabilidad de prompts.
