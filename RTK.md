# RTK.md local - Review and Test Kit

Este documento convierte la prueba tecnica en una lista operativa para revisar la entrega antes de enviarla. Se usa junto con `CLAUDE.md`: `CLAUDE.md` guarda memoria y decisiones; `RTK.md` marca lo que debe verificarse.

Nota: este archivo local se mantiene por decision del proyecto como "Review and Test Kit". No sustituye al RTK externo de `rtk-ai/rtk`, que es una herramienta CLI para compactar salidas de comandos.

## Reglas de entrega

- El repositorio debe ser ejecutable por un evaluador siguiendo solo el `README.md`.
- No se debe commitear ninguna clave real, archivo `.env`, build local, cache o dependencia instalada.
- La clave de Gemini debe vivir en `.env` local o en variables de entorno del sistema.
- La llamada a Gemini debe hacerse desde el backend; el frontend no debe recibir ni exponer `GEMINI_API_KEY`.
- Si Gemini no esta configurado o falla, el fallback local puede mantener la demo funcionando, pero la UI debe mostrar el modelo usado mediante `ai_model`.

## Checklist antes de entregar

- [ ] `README.md` explica como crear la clave en Google AI Studio.
- [ ] `.env.example` contiene solo placeholders.
- [ ] `.env` esta ignorado por Git.
- [ ] `GEMINI_MODEL` usa `gemini-2.5-flash-lite` por defecto.
- [x] `docker compose config` no muestra claves reales.
- [x] `docker compose up --build` arranca con Docker Desktop activo.
- [x] `http://localhost:3000` carga el frontend.
- [x] `http://localhost:8000/docs` carga la API.
- [ ] Flujo demo: ingredientes -> preferencias -> generar menu -> sustituir -> repetir receta -> filtrar recetario.
- [x] La nevera del usuario demo arranca con ingredientes precargados para probar sin alta manual.
- [x] Existe tabla `system_logs` para logs estructurados.
- [x] `GET /logs` y `POST /logs` funcionan localmente.
- [x] Prompt log tiene al menos 3 prompts.
- [ ] Video de 3 minutos cubre problema, solucion, IA usada, incluyendo Antigravity/Codex, Figma AI y Gemini, demo y mejoras.

## Uso del codigo de Figma

- [x] Revisar `../Diseño-web-figma` como referencia visual, no como arquitectura a migrar.
- [x] Reutilizar objetivos visuales compatibles con el MVP: navegacion, dashboard, estadisticas, menu semanal claro, bloque IA y filtros.
- [x] Descartar por alcance: Vite, React Router, MUI/Radix/shadcn completos, mock data estatica, rutas separadas de detalle/preferencias y modales avanzados.
- [x] Separar la UI en vistas internas: Dashboard, Menu semanal, Ingredientes, Recetas y Preferencias.
- [x] Adaptar Preferencias al patron Figma: dieta, restricciones, excluidos, objetivos y variedad.
- [x] Verificar render inicial en navegador headless.
- [ ] Verificar en navegador que la UI adaptada conserva el flujo demo y no tapa el uso real de la API.
- [x] Recetario usa cards visuales tipo Figma y filtros plegables por busqueda, etiqueta, dificultad y tiempo.
- [x] Dashboard muestra los 7 dias del menu semanal y marca el dia actual cuando la semana coincide.

## Decision Docker/Next

- [x] Evitar `next dev`/Turbopack en Docker porque produjo panics `Failed to write app endpoint /page` durante el primer arranque.
- [x] Usar build de produccion en Docker: `npm ci`, `npm run build` y `next start`.
- [x] Mantener recarga en caliente solo en la ejecucion sin Docker.

## Logging y errores

- [x] Backend centraliza logs en `backend/app/logging_service.py`.
- [x] Logs persistidos con nivel, modulo, mensaje, contexto, stack trace opcional y fecha.
- [x] FastAPI registra excepciones HTTP y errores no controlados.
- [x] Integracion Gemini registra fallback o fallo de API externa.
- [x] Frontend reporta errores y eventos criticos mediante `POST /logs`.
- [ ] Revisar en DBeaver `public.system_logs` durante la demo si hace falta explicar trazabilidad.

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

## Decision sobre claves de Gemini

No se incluye una clave compartida en el repositorio. Es mejor que cada evaluador cree su propia clave gratuita en Google AI Studio y la ponga en `.env`, porque una clave commiteada puede consumir cuota, generar costes si hay billing y exponer datos del proyecto asociado.
