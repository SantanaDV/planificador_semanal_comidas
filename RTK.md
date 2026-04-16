# RTK.md local - Review and Test Kit

Este documento convierte la prueba tecnica en una lista operativa para revisar la entrega antes de enviarla. Se usa junto con `CLAUDE.md`: `CLAUDE.md` guarda memoria y decisiones; `RTK.md` marca lo que debe verificarse.

## Reglas de entrega

- El repositorio debe ser ejecutable por un evaluador siguiendo solo el `README.md`.
- No se debe commitear ninguna clave real, archivo `.env`, build local, cache o dependencia instalada.
- La clave de Gemini debe vivir en `.env` local o en variables de entorno del sistema.
- La llamada a Gemini debe hacerse desde el backend; el frontend no debe recibir ni exponer `GEMINI_API_KEY`.
- Si Gemini no esta configurado o falla, el fallback local puede mantener la demo funcionando; la UI debe avisar antes de generar, pero no destacar `ai_model` como etiqueta principal del menu.

## Checklist antes de entregar

- [X] `README.md` explica como crear la clave en Google AI Studio.
- [X] `.env.example` contiene solo placeholders.
- [X] `.env` esta ignorado por Git.
- [X] `GEMINI_MODEL` usa `gemini-2.5-flash-lite` por defecto.
- [X] `docker compose config` no muestra claves reales.
- [X] `docker compose up --build` arranca con Docker Desktop activo.
- [X] `http://localhost:3000` carga el frontend.
- [X] `http://localhost:8000/docs` carga la API.
- [X] Flujo demo: ingredientes -> preferencias -> generar menu -> sustituir -> repetir receta -> filtrar recetario.
- [X] La nevera vacia muestra estado claro y permite cargar ingredientes de prueba bajo demanda.
- [X] `POST /ingredients/demo` persiste ingredientes demo en base de datos; no hay precarga automatica en arranque.
- [X] Las categorias de ingredientes vienen de base de datos mediante `GET /ingredient-categories`.
- [X] Ingredientes usa modal de alta con nombre, categoria, cantidad y fecha de caducidad.
- [X] Ingredientes permite filtrar por busqueda/categoria y ordenar por caducidad o cantidad.
- [X] Preferencias permite excluir solo ingredientes existentes en la nevera y la generacion valida que queden al menos 5 ingredientes disponibles.
- [X] La seleccion de ingredientes excluidos usa buscador, filtros por categoria, lista compacta con scroll, chips y limpiar seleccion.
- [X] El generador recibe recetas guardadas compatibles con la nevera filtrada como contexto, sin incluir las que contienen ingredientes excluidos.
- [X] El recetario permite abrir cards navegables, crear recetas manuales con foto y marcar favoritas.
- [X] La generacion prioriza favoritas compatibles sin forzarlas cuando no encajan con nevera o preferencias.
- [X] `GET /ai/status` expone si se usara Gemini real o fallback local.
- [X] Generar menu con nevera vacia o con menos de 5 ingredientes abre modal, no redirige automaticamente.
- [X] Sin clave valida de Gemini, la app avisa antes de continuar con modo demo.
- [X] Existe tabla `system_logs` para logs estructurados.
- [X] `GET /logs` y `POST /logs` funcionan localmente.
- [X] Prompt log tiene al menos 3 prompts.
- [X] Video de 3 minutos cubre problema, solucion, IA usada, incluyendo Antigravity/Codex, Figma AI y Gemini, demo y mejoras.

## Uso del codigo de Figma

- [X] Revisar `../Diseño-web-figma` como referencia visual, no como arquitectura a migrar.
- [X] Reutilizar objetivos visuales compatibles con el MVP: navegacion, dashboard, estadisticas, menu semanal claro, bloque IA y filtros.
- [X] Descartar por alcance: Vite, React Router, MUI/Radix/shadcn completos, mock data estatica, rutas separadas de detalle/preferencias y modales avanzados.
- [X] Separar la UI en vistas internas: Dashboard, Menu semanal, Ingredientes, Recetas y Preferencias.
- [X] Adaptar Preferencias al patron Figma: dieta, restricciones, excluidos, objetivos y variedad.
- [X] Verificar render inicial en navegador headless.
- [X] Verificar en navegador que la UI adaptada conserva el flujo demo y no tapa el uso real de la API.
- [X] Recetario usa cards visuales tipo Figma y filtros plegables por busqueda, etiqueta, dificultad y tiempo.
- [X] Recetario elimina el flujo de variantes y concentra modificaciones en detalle editable.
- [X] Dashboard muestra los 7 dias del menu semanal y marca el dia actual cuando la semana coincide.
- [X] Detalle de receta permite consulta completa y edicion persistente de metadatos, ingredientes, pasos y etiquetas.
- [X] Si una receta asociada al menu se elimina, dashboard y menu muestran "Plato no disponible" y permiten sustituir el plato.

## Decision Docker/Next

- [X] Evitar `next dev`/Turbopack en Docker porque produjo panics `Failed to write app endpoint /page` durante el primer arranque.
- [X] Usar build de produccion en Docker: `npm ci`, `npm run build` y `next start`.
- [X] Mantener recarga en caliente solo en la ejecucion sin Docker.

## Logging y errores

- [X] Backend centraliza logs en `backend/app/logging_service.py`.
- [X] Logs persistidos con nivel, modulo, mensaje, contexto, stack trace opcional y fecha.
- [X] FastAPI registra excepciones HTTP y errores no controlados.
- [X] Integracion Gemini registra fallback o fallo de API externa.
- [X] Frontend reporta errores y eventos criticos mediante `POST /logs`.

## Comandos de verificacion

```bash
docker compose config
docker compose up --build
```

Verificacion sin Docker para backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Verificacion sin Docker para frontend:

```bash
cd frontend
npm install
npm run build
npm run dev
```
