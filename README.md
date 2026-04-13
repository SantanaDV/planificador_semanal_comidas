# Planificador semanal de comidas con IA

Aplicacion web para crear menus semanales a partir de ingredientes disponibles, preferencias e historial de recetas. El MVP usa Next.js, FastAPI, PostgreSQL, Docker Compose y Gemini configurable. Para probar IA real necesitas tu propia clave de Gemini; si no la configuras, el backend usa un fallback local para que la demo siga funcionando.

## Entregables de la prueba

- Repositorio ejecutable con instrucciones locales.
- Video de maximo 3 minutos explicando problema, solucion, uso de IA y mejoras.
- Prompt log con al menos 3 prompts clave.

## Funcionalidad MVP

- Usuario demo sin login.
- Alta y eliminacion de ingredientes.
- Generacion de menu semanal con comida y cena de lunes a domingo.
- Guardado automatico de recetas generadas.
- Sustitucion de platos del menu.
- Repeticion de recetas guardadas en un hueco del menu.
- Recetario con filtro, eliminacion y variantes.
- Explicacion breve de por que se eligio cada plato.
- Ingredientes demo precargados para poder generar un primer menu sin preparar datos manualmente.
- Logging transversal en base de datos para eventos de backend, frontend, IA y planificacion.

## Requisitos

- Docker Desktop con Docker Compose.
- Integracion WSL activada si se ejecuta desde WSL en Windows.
- Node.js 20.9+ si ejecutas el frontend sin Docker.
- Python 3.12 si ejecutas el backend sin Docker.
- Clave de Gemini API para probar generacion real con `gemini-2.5-flash-lite`.

## Ejecucion local con Docker

1. Copia las variables de entorno:

```bash
cp .env.example .env
```

2. Crea una clave en Google AI Studio:

- Entra en https://aistudio.google.com/apikey.
- Crea o selecciona un proyecto.
- Genera una API key para Gemini.

3. Abre `.env` y pega tu clave localmente:

```bash
GEMINI_API_KEY=tu_clave
GEMINI_MODEL=gemini-2.5-flash-lite
```

No subas `.env` al repositorio. La clave se usa solo en el backend mediante la variable `GEMINI_API_KEY`; el frontend no la recibe.

4. Levanta la aplicacion:

```bash
docker compose up --build
```

Docker arranca el frontend con `next start` sobre una build de produccion. Para desarrollo con recarga en caliente usa la ejecucion sin Docker.

5. Abre:

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs
- Healthcheck: http://localhost:8000/health

Sin `GEMINI_API_KEY`, el menu se genera con fallback local. Esto es intencional para que la entrega sea ejecutable aunque no haya cuota o conexion con Gemini, pero para evaluar la integracion IA real configura tu propia clave.

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

| Variable | Uso | Valor por defecto |
| --- | --- | --- |
| `GEMINI_API_KEY` | Clave local de Gemini API. Si falta, se usa fallback local. | vacio |
| `GEMINI_MODEL` | Modelo usado para `generateContent`. | `gemini-2.5-flash-lite` |
| `DATABASE_URL` | Conexion SQLAlchemy del backend. | SQLite local fuera de Docker |
| `NEXT_PUBLIC_API_URL` | URL de la API para el navegador. | `http://localhost:8000` |

La clave no debe escribirse en codigo ni commitearse. Google recomienda tratarla como una contrasena, no exponerla en cliente y preferir llamadas server-side. Por eso la app llama a Gemini desde FastAPI y solo publica `.env.example` con placeholders.

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

En DBeaver, la tabla aparece en `menu_planner -> Schemas -> public -> Tables -> system_logs`.

## Flujo de demo

1. Revisa los ingredientes demo precargados.
2. Anade algun ingrediente propio si quieres personalizar la prueba.
3. Ajusta preferencias: "cenas ligeras, comidas rapidas, evitar repetir pasta".
4. Pulsa "Generar menu semanal".
5. Sustituye un plato para mostrar IA/fallback.
6. Repite una receta guardada desde el selector.
7. Filtra el recetario y crea una variante.

## Prompt log

1. "Analiza la prueba tecnica y conviertela en checklist de entregables, arquitectura, MVP, estructura, base de datos, flujo y plan de 72 horas."
   Funciono porque convirtio un enunciado abierto en decisiones accionables y priorizadas.

2. "Implementa un backend FastAPI con modelos PostgreSQL para ingredientes, recetas, menus semanales y un servicio Gemini con fallback local."
   Funciono porque separo la integracion IA del dominio y redujo el riesgo de una demo bloqueada por claves o cuota.

3. "Construye una pantalla Next.js para el flujo ingredientes -> preferencias -> menu -> sustituciones -> recetario, priorizando MVP y claridad."
   Funciono porque evito pantallas innecesarias y centro la UX en el recorrido que se vera en el video.

4. "RTK es https://github.com/rtk-ai/rtk; manten el archivo Review and Test Kit y registra que el prompt log se actualiza cuando haya prompts resenables."
   Funciono porque separo la herramienta RTK externa del checklist local `RTK.md` y fijo una regla operativa para mantener el entregable honesto.

5. "A partir de ahora, gestiona Git con commits pequenos, Conventional Commits, revision previa de estado/diff y sin comandos destructivos."
   Funciono porque convierte el control de versiones en una regla explicita de trabajo y evita mezclar cambios accidentales con entregables revisables.

6. "Disena la interfaz de una aplicacion web responsive para planificacion automatica de menus semanales..."
   Funciono como prompt de Figma AI para explorar una direccion visual SaaS con dashboard, menu semanal, ingredientes, recetas y preferencias. Se usara como referencia de UX, priorizando replicar solo lo que encaje en el MVP.

7. "He subido el codigo completo a Diseño-web-figma; quedarnos con el tema visual, usar por objetivos lo que podamos y marcar lo que no."
   Funciono porque convirtio la exportacion de Figma en una revision pragmatica: reutilizar composicion visual y descartar rutas, mocks y dependencias que no ayudan al MVP.

8. "Te dejo la ejecucion de la primera vez que he hecho docker compose up; ha habido algun error, hay que ver el por que."
   Funciono porque detecto que `next dev` con Turbopack en Docker producia panics intermitentes aunque la pagina devolviera 200. Se ajusto Docker a build de produccion con `next start` para una entrega mas estable.

9. "Quiero que el diseno se asemeje mas a Figma, mas separado por capas: dashboard, menu semanal, ingredientes, recetas y preferencias. Tambien algunos ingredientes previamente anadidos."
   Funciono porque marco un refinamiento visual concreto y una mejora de demo: navegacion por vistas tipo SaaS y semilla de ingredientes reales desde backend.

10. "Implementar un sistema de logging y manejo de errores consistente para frontend y backend."
    Funciono porque fijo el logging como preocupacion transversal: tabla `system_logs`, servicio central en backend, endpoint para eventos frontend y estandar de modulos por origen.

11. "Me gustaria que las preferencias fueran mas como las del proyecto de Figma."
    Funciono porque llevo la pantalla de preferencias desde un textarea libre a un formulario defendible: dieta, restricciones, ingredientes excluidos, objetivos y variedad semanal.

12. "Generar la parte de recetas con unas cards mas parecidas a Figma y cuidar el tema de filtros."
    Funciono porque convierte el recetario en una pantalla mas demostrable: busqueda, filtros por etiqueta, dificultad y tiempo, y cards visuales con imagen y acciones.

13. "La barra de busqueda con un icono filtros que al darle salgan las distintas opciones."
    Funciono porque corrige un problema visual real: la busqueda queda alineada y los filtros avanzados aparecen solo cuando aportan valor.

14. "En el dashboard deberian salir todos los dias y deberia indicar en que dia estas."
    Funciono porque convierte el dashboard en una lectura semanal completa y mejora la orientacion temporal de la demo marcando el dia actual.

## Guion sugerido para video de 3 minutos

- 0:00-0:25: problema cotidiano: planificar comidas consume tiempo y se repiten platos.
- 0:25-0:55: stack y arquitectura: Next.js, FastAPI, PostgreSQL, Docker, Gemini con fallback.
- 0:55-2:10: demo: ingredientes, preferencias, generar menu, sustituir plato, repetir receta y recetario.
- 2:10-2:35: uso de IA: Antigravity/Codex para desarrollo, Figma AI para explorar interfaz y Gemini para generar menus con ingredientes, preferencias e historial.
- 2:35-3:00: mejoras: login real, nutricion, tests E2E, migraciones y lista de compra.

## Roadmap despues del MVP

- Autenticacion real y perfiles de usuario.
- Migraciones con Alembic.
- Tests unitarios y E2E con Playwright.
- Lista de compra agregada por semana.
- Objetivos nutricionales y restricciones medicas verificables.
- Mejor control de coste, cuota y trazabilidad de prompts.
