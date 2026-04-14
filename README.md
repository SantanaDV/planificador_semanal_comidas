# Planificador semanal de comidas con IA

Aplicacion web para crear menus semanales a partir de ingredientes disponibles, preferencias e historial de recetas. El MVP usa Next.js, FastAPI, PostgreSQL, Docker Compose y Gemini configurable. Para probar IA real necesitas tu propia clave de Gemini; si no la configuras, el backend usa un fallback local para que la demo siga funcionando.

## Entregables de la prueba

- Repositorio ejecutable con instrucciones locales.
- Video de maximo 3 minutos explicando problema, solucion, uso de IA y mejoras.
- Prompt log con al menos 3 prompts clave.

## Funcionalidad MVP

- Usuario demo sin login.
- Alta y eliminacion de ingredientes con categoria persistida, cantidad y fecha de caducidad.
- Generacion de menu semanal con comida y cena de lunes a domingo.
- Guardado automatico de recetas generadas.
- Sustitucion de platos del menu.
- Repeticion de recetas guardadas en un hueco del menu.
- Recetario con filtro, eliminacion y variantes.
- Detalle editable de receta con ingredientes, cantidades, pasos, dificultad, raciones y etiquetas.
- Explicacion breve de por que se eligio cada plato.
- Estado vacio de ingredientes y carga de ingredientes de prueba bajo demanda en base de datos.
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

Sin una `GEMINI_API_KEY` valida, el menu se genera con fallback local controlado. Esto es intencional para que la entrega sea ejecutable aunque no haya cuota o conexion con Gemini, pero para evaluar la integracion IA real configura tu propia clave. Si no hay ingredientes en la nevera, la app no genera un menu con datos inventados: muestra un estado vacio y permite cargar ingredientes de prueba en PostgreSQL desde la UI.

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

| Variable                | Uso                                                         | Valor por defecto            |
| ----------------------- | ----------------------------------------------------------- | ---------------------------- |
| `GEMINI_API_KEY`      | Clave local de Gemini API. Si falta, se usa fallback local. | vacio                        |
| `GEMINI_MODEL`        | Modelo usado para `generateContent`.                      | `gemini-2.5-flash-lite`    |
| `DATABASE_URL`        | Conexion SQLAlchemy del backend.                            | SQLite local fuera de Docker |
| `NEXT_PUBLIC_API_URL` | URL de la API para el navegador.                            | `http://localhost:8000`    |

La clave no debe escribirse en codigo ni commitearse. Google recomienda tratarla como una contrasena, no exponerla en cliente y preferir llamadas server-side. Por eso la app llama a Gemini desde FastAPI y solo publica `.env.example` con placeholders.

## Datos de prueba y fallback

- La app no precarga ingredientes al arrancar.
- Las categorias de ingredientes viven en la base de datos y se crean en arranque si faltan: Verduras, Frutas, Proteinas, Lacteos, Cereales, Legumbres, Especias y Otros.
- La vista Ingredientes usa un modal para anadir alimentos con nombre, categoria, cantidad y fecha de caducidad.
- Los filtros de Ingredientes permiten buscar por nombre/categoria, filtrar por categoria y ordenar por caducidad o cantidad. Por defecto se priorizan los proximos a caducar.
- Si la nevera esta vacia o tiene menos de 5 ingredientes, al intentar generar menu aparece un modal con opciones para ir a Ingredientes, cargar ingredientes de prueba o cancelar.
- Al pulsar "Anadir ingredientes de prueba" en ese aviso, el frontend llama a `POST /ingredients/demo` y el backend guarda esos ingredientes en la base de datos.
- La generacion de menus exige al menos 5 ingredientes reales guardados, ya sean introducidos manualmente o cargados mediante el endpoint demo.
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
3. Ajusta preferencias: "cenas ligeras, comidas rapidas, evitar repetir pasta".
4. Pulsa "Generar menu semanal".
5. Si no hay clave valida de Gemini, acepta el aviso para continuar con modo demo.
6. Sustituye un plato para mostrar el flujo de regeneracion.
7. Repite una receta guardada desde el selector.
8. Filtra el recetario, abre el detalle de una receta y edita raciones, dificultad, ingredientes o pasos.

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
   Funciono porque marco un refinamiento visual concreto y una mejora de demo: navegacion por vistas tipo SaaS y carga controlada de ingredientes desde backend.
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
15. "Implementa la vista extendida de detalle de receta siguiendo el diseno actual y dejandola preparada para edicion real."
    Funciono porque convierte el recetario en una superficie de producto completa: consulta, edicion persistente, metadatos y preparacion sin rehacer arquitectura.
16. "Eliminar mocks hardcodeados y sustituirlos por estados vacios, datos demo bajo demanda y fallback documentado."
    Funciono porque separa datos reales, demo persistente y fallback local, dejando claro al evaluador que la app no depende de arrays mock de UI para funcionar.

17. "Corregir el flujo de generacion cuando faltan ingredientes o falta la clave de IA."
    Funciono porque mejora la UX de decision: modal antes de redirigir, minimo de ingredientes y aviso previo antes de usar modo demo.
18. "Mejorar la gestion de ingredientes con modal, categorias en base de datos, caducidad y filtros."
    Funciono porque convierte la nevera en una fuente de datos mas realista para IA: categorias controladas, orden por caducidad y cantidad completa sin depender de texto libre de unidad.

## Guion sugerido para video de 3 minutos

- 0:00-0:25: problema cotidiano: planificar comidas consume tiempo y se repiten platos.
- 0:25-0:55: stack y arquitectura: Next.js, FastAPI, PostgreSQL, Docker, Gemini con fallback.
- 0:55-2:10: demo: ingredientes, preferencias, generar menu, sustituir plato, repetir receta y recetario con detalle editable.
- 2:10-2:35: uso de IA: Antigravity/Codex para desarrollo, Figma AI para explorar interfaz y Gemini para generar menus con ingredientes, preferencias e historial.
- 2:35-3:00: mejoras: login real, nutricion, tests E2E, migraciones y lista de compra.

## Roadmap despues del MVP

- Autenticacion real y perfiles de usuario.
- Migraciones con Alembic.
- Tests unitarios y E2E con Playwright.
- Lista de compra agregada por semana.
- Objetivos nutricionales y restricciones medicas verificables.
- Mejor control de coste, cuota y trazabilidad de prompts.
