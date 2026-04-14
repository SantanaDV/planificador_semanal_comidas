# Memoria viva del proyecto

Ultima actualizacion: 2026-04-13.

## Resumen del reto

Prueba tecnica asincrona "Vibe Coder Intern", opcion A: construir una solucion web o de terminal usando herramientas de IA. La evaluacion no busca el proyecto mas complejo, sino ver criterio, uso de IA, claridad y una entrega ejecutable.

Entregables obligatorios del PDF:

- Repositorio en GitHub, publico o privado con acceso compartido.
- README con instrucciones claras para ejecutar localmente.
- Codigo ejecutable, aunque no sea perfecto.
- Video de maximo 3 minutos con pantalla y voz.
- Prompt log con al menos 3 prompts clave y 1-2 lineas de explicacion por prompt.

Restricciones relevantes:

- No copiar un tutorial.
- El plazo es de 72 horas.
- Priorizar una app que funcione localmente.

## Producto elegido

Aplicacion web para planificar automaticamente menus semanales con IA. El usuario registra ingredientes disponibles y preferencias. El sistema genera un menu semanal distinto, evita repetir recetas recientes y permite guardar, consultar, filtrar, eliminar, repetir y sustituir platos.

Problema defendible en el video: planificar comidas semanales consume tiempo, genera desperdicio de ingredientes y suele acabar en platos repetidos. La IA aporta valor porque puede combinar restricciones, preferencias, ingredientes disponibles e historial.

## Stack decidido

- Frontend: Next.js + TypeScript + Tailwind CSS.
- Backend: FastAPI.
- Base de datos: PostgreSQL.
- Contenedores: Docker + Docker Compose.
- Autenticacion: usuario demo en MVP.
- IA: Gemini 2.5 Flash Lite con fallback determinista si no hay clave o si la API falla.

Decision IA: se actualiza el modelo por defecto a `gemini-2.5-flash-lite` porque la documentacion oficial de Gemini marca `gemini-2.0-flash-lite` como deprecado con shutdown el 2026-06-01. El modelo sigue siendo configurable mediante `GEMINI_MODEL`; el fallback mantiene la demo local funcionando sin depender de cuota o disponibilidad.

## Checklist de entregables y calidad

- [ ] App arranca localmente con `docker compose up --build`.
- [ ] Frontend accesible en `http://localhost:3000`.
- [ ] API accesible en `http://localhost:8000/docs`.
- [x] README contiene pasos claros, variables de entorno y solucion de problemas minima.
- [x] Prompt log con al menos 3 prompts y explicacion breve.
- [x] CLAUDE.md registra decisiones, cambios, roadmap y riesgos.
- [x] RTK.md existe como checklist operativo de revision y entrega.
- [x] Flujo principal completo: ingredientes -> preferencias -> generar menu -> sustituir plato -> consultar/filtrar/eliminar recetas.
- [x] La app funciona sin `GEMINI_API_KEY` usando fallback local.
- [x] El video de 3 minutos tiene guion: problema, solucion, IA usada, demo, mejoras.

## Arquitectura propuesta

Monolito modular dockerizado con dos servicios de aplicacion:

- `frontend`: Next.js renderiza la experiencia de usuario y consume la API REST.
- `backend`: FastAPI concentra reglas de negocio, persistencia y adaptador Gemini.
- `db`: PostgreSQL.

Justificacion: para una prueba de 72 horas evita complejidad de microservicios, colas o autenticacion avanzada, pero mantiene separacion clara frontend/backend y una arquitectura facil de defender.

## MVP exacto

En alcance:

- Usuario demo sin registro.
- CRUD basico de ingredientes.
- Generacion de menu semanal para comida y cena de 7 dias.
- Persistencia de menus y recetas generadas.
- Historial basico: el prompt recibe recetas recientes para evitar repeticion.
- Sustitucion de un plato concreto.
- Repeticion de receta guardada en un hueco del menu.
- Listado de recetas guardadas con filtro por texto o etiqueta.
- Eliminacion de recetas guardadas.
- Detalle editable de recetas guardadas con ingredientes/cantidades, pasos, etiquetas, tiempo, dificultad y raciones.
- Explicacion breve de por que se eligio cada plato.
- Fallback sin Gemini para ejecucion local estable.

Fuera de alcance inicial:

- Autenticacion real y multiusuario.
- Planes nutricionales exactos, macros y calorias verificadas.
- Compras automaticas o integracion con supermercados.
- Migraciones Alembic.
- Tests E2E completos.
- Generacion de imagenes de recetas.

## Estructura de carpetas

```text
.
|-- backend/
|   |-- app/
|   |   |-- ai.py
|   |   |-- database.py
|   |   |-- main.py
|   |   |-- models.py
|   |   `-- schemas.py
|   |-- Dockerfile
|   `-- requirements.txt
|-- frontend/
|   |-- app/
|   |   |-- globals.css
|   |   |-- layout.tsx
|   |   `-- page.tsx
|   |-- public/
|   |-- Dockerfile
|   `-- package.json
|-- docker-compose.yml
|-- .env.example
|-- README.md
|-- RTK.md
`-- CLAUDE.md
```

## Esquema inicial de base de datos

- `users`: usuario demo y preferencias generales.
- `ingredients`: ingredientes de la nevera por usuario.
- `recipes`: recetas guardadas/generadas, ingredientes, pasos, etiquetas y fuente.
- `weekly_menus`: menu generado por semana, preferencias usadas, modelo IA y metadatos.
- `menu_items`: plato de un dia y tipo de comida, enlazado a receta y con explicacion.
- `system_logs`: logs transversales del proyecto con nivel, modulo, mensaje, contexto JSON, stack trace opcional y fecha.

Se usa `create_all` en arranque para acelerar el MVP. Alembic queda como mejora futura.

## Flujo principal

1. El usuario entra en la pantalla principal.
2. Anade ingredientes disponibles y escribe preferencias/restricciones.
3. Pulsa "Generar menu".
4. El backend toma ingredientes, preferencias y recetas recientes.
5. Gemini devuelve JSON estructurado; si falla, se usa fallback local.
6. El usuario revisa comida/cena por dia.
7. Puede sustituir un plato, repetir una receta guardada o eliminar recetas del recetario.
8. El recetario permite filtrar por texto o etiqueta.

## Plan de ejecucion 72 horas

Fase 1, base entregable:

- Documentar decisiones iniciales en CLAUDE.md.
- Crear estructura Docker, backend, frontend y README.
- Implementar persistencia y endpoints esenciales.

Fase 2, valor IA:

- Integrar adaptador Gemini con JSON estricto.
- Anadir fallback determinista.
- Guardar explicaciones y evitar repeticion usando historial reciente.

Fase 3, UX y defensa:

- Pantalla unica clara para ingredientes, preferencias, menu y recetas.
- Estados de carga/error.
- Preparar prompt log y guion del video.

Fase 4, pulido:

- Verificar arranque local.
- Revisar README.
- Registrar riesgos y mejoras.

## Video final: puntos clave

- Que construimos: planificador semanal de comidas con IA y recetario.
- Por que: ahorrar tiempo, evitar desperdicio y reducir repeticion.
- Herramientas IA: Antigravity/Codex para desarrollo, Figma AI para explorar la interfaz y Gemini para generacion dentro del producto.
- Como se uso la IA: prompts estructurados con ingredientes, preferencias e historial; respuesta JSON persistida.
- Que mejoraria: autenticacion, nutricion, tests E2E, compra automatica, mejoras visuales y migraciones.

## Prompt log inicial

1. Prompt de planificacion: "Analiza la prueba tecnica y conviertela en entregables, arquitectura, MVP, estructura, base de datos, flujo y plan de 72 horas". Funciono porque transformo un enunciado abierto en una lista accionable.
2. Prompt de producto: "Construye un MVP de planificador semanal con ingredientes, preferencias, historial y sustituciones, priorizando ejecucion local". Funciono porque recorto alcance y mantuvo el foco en valor demostrable.
3. Prompt de IA en producto: "Genera un menu semanal en JSON estricto evitando repetir recetas recientes y explicando cada eleccion". Funciono porque hace que la salida sea persistible y facil de validar.

## Politica de prompt log

- El prompt log del README es un entregable vivo, no una lista estatica creada al final.
- Cada vez que un prompt cambie una decision tecnica, de producto, IA, seguridad, documentacion o entrega, se debe anadir al prompt log con 1-2 lineas explicando por que funciono o que se ajusto.
- No hace falta registrar prompts triviales de mantenimiento; se registran los que ayuden a defender el proceso.
- Prompt resenable anadido: "RTK es https://github.com/rtk-ai/rtk; manten el archivo Review and Test Kit y registra que el prompt log se actualiza cuando haya prompts resenables." Funciono porque separo la herramienta RTK externa del checklist local `RTK.md` y fijo una regla operativa para mantener el entregable honesto.
- Prompt resenable anadido: "A partir de ahora, gestiona Git con commits pequenos, Conventional Commits, revision previa de estado/diff y sin comandos destructivos." Funciono porque convierte el control de versiones en una regla explicita de trabajo y evita mezclar cambios accidentales con entregables revisables.
- Prompt resenable anadido: "Disena la interfaz de una aplicacion web responsive para planificacion automatica de menus semanales..." Funciono como prompt de Figma AI para explorar una direccion visual SaaS con dashboard, menu semanal, ingredientes, recetas y preferencias. Se usara como referencia de UX, priorizando replicar solo lo que encaje en el MVP.
- Prompt resenable anadido: "Me gustaria que las preferencias fueran mas como las que te adjunto del proyecto de Figma." Funciono porque concreta una mejora visual y funcional: pasar de textarea libre a configuracion estructurada de dieta, restricciones, excluidos, objetivos y variedad.
- Prompt resenable anadido: "Generar la parte de recetas con unas cards mas parecidas a Figma y cuidar el tema de filtros." Funciono porque concreta el recetario como superficie visual clave: busqueda, filtros reales y cards con imagen, tiempo, dificultad y acciones.
- Prompt resenable anadido: "La barra de busqueda con un icono filtros que al darle salgan las distintas opciones." Funciono porque corrige una desviacion visual detectada en uso real: filtros plegables para mantener alineacion y claridad.
- Prompt resenable anadido: "En el dashboard deberian salir todos los dias y deberia indicar en que dia estas." Funciono porque mejora la demo: el dashboard pasa de preview parcial a lectura semanal completa con indicador temporal.
- Prompt resenable anadido: "Implementa la vista extendida de detalle de receta siguiendo el diseno actual y dejandola preparada para edicion real." Funciono porque convierte el recetario en una pantalla completa de producto y obliga a cerrar el contrato backend de edicion.

## Politica Git y control de versiones

- No ejecutar comandos destructivos (`git reset --hard`, `git clean -fd`, `git push --force`, reescritura de historial) salvo peticion explicita.
- Antes de cualquier commit revisar `git status`, `git diff`, archivos sensibles y artefactos generados.
- No incluir `.env`, secretos, claves, caches, builds, logs, `node_modules`, `.next`, `__pycache__` ni archivos temporales.
- Mantener `.gitignore` actualizado si aparecen artefactos que no deben versionarse.
- Agrupar commits por intencion funcional y pequena. Separar cuando sea razonable: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.
- Usar Conventional Commits con titulos claros que expliquen la intencion del cambio.
- No mezclar cambios no relacionados en el mismo commit.
- Si aparecen cambios colaterales dudosos o no solicitados, avisar antes de incluirlos.
- Antes de cerrar una unidad de trabajo, ejecutar validaciones razonables: tests relevantes, typecheck/build, lint o arranque local si aplica.
- Si una validacion no puede ejecutarse, registrarlo claramente antes de proponer commit.
- No cambiar de rama, hacer merge o crear ramas sin necesidad. Si se propone rama nueva, justificarla.
- Al dejar cambios listos para versionar, informar archivos cambiados, objetivo del cambio y mensaje de commit sugerido. No ejecutar el commit hasta que el usuario lo confirme.
- Mantener historial limpio, revisable y orientado a pull request.

## Riesgos y decisiones abiertas

- Docker Linux no esta disponible en esta WSL. `docker.exe compose config` funciona, pero `docker.exe compose build` falla porque Docker Desktop no esta activo (`dockerDesktopLinuxEngine` no existe). Pendiente arrancar Docker Desktop y ejecutar `docker compose up --build`.
- Node esta instalado como `node.exe` de Windows, no como binario Linux `node`. Se valido frontend creando un enlace temporal `/tmp/node` hacia `node.exe`.
- `RTK.md` fue referenciado en las instrucciones y no existia en el arbol del proyecto. Se crea como "Review and Test Kit" para que sea usado como checklist de entrega.
- Aclaracion 2026-04-13: RTK se refiere tambien a la herramienta externa `rtk-ai/rtk` (`https://github.com/rtk-ai/rtk`), un proxy CLI en Rust que compacta salidas de comandos para reducir consumo de tokens en sesiones con LLM. El archivo local `RTK.md` se mantiene igualmente como "Review and Test Kit" del proyecto.
- RTK externo esta instalado en esta maquina en `/home/santana/.local/bin/rtk`, version `0.34.2`. `rtk init --show` indica que Codex no esta configurado todavia con RTK global/local. No se ejecuta `rtk init -g --codex` sin confirmacion explicita porque modifica archivos globales en `~/.codex`.
- Regla de uso desde ahora: cuando haya comandos de lectura, busqueda, git, build o test con salida potencialmente larga, priorizar `rtk ...` o comandos equivalentes RTK (`rtk grep`, `rtk read`, `rtk git diff`, `rtk next build`, `rtk err ...`) para reducir ruido. Para ediciones se sigue usando `apply_patch`.
- Figma Make link revisado: `https://www.figma.com/make/tdfrWw69PwmWzeJkKQbapG/Interfaz-aplicaci%C3%B3n-planificaci%C3%B3n-men%C3%BAs?t=56tlbYpnUAHoGpVb-1`. Se pudo leer metadata/oEmbed, pero no inspeccionar el canvas completo desde entorno headless; el visor queda cargando y los thumbnails publicos salen casi vacios. Despues se anadio export local en `../Diseño-web-figma` para revisar el codigo generado.
- Decision de producto/diseno: usar Figma AI como referencia para mejorar la UX, pero no intentar replicar todas las pantallas generadas. Para el MVP conviene adaptar una estructura tipo app SaaS con navegacion, dashboard compacto, menu semanal legible, panel de ingredientes/preferencias y recetario; dejar pantallas completas de detalle/preferencias como mejora si amenaza el plazo.

## Revision local de Diseño-web-figma

- Export revisado: app Vite/React con `react-router`, `lucide-react`, dependencias MUI/Radix/shadcn y pantallas estaticas (`Dashboard`, `WeeklyMenu`, `Ingredients`, `Recipes`, `RecipeDetail`, `Preferences`).
- Reutilizable para el MVP: sidebar/navegacion por secciones, dashboard con estadisticas, vista rapida del menu, tarjetas de dia/plato, bloque de sugerencias IA, filtros del recetario y jerarquia visual blanca/neutra con acento verde.
- No reutilizar ahora: migrar a Vite, importar `react-router`, copiar el paquete completo de componentes `ui`, anadir MUI/Radix, usar mock data estatica, crear rutas completas de detalle/preferencias, implementar edicion de ingredientes o modales/drawers si no aportan al flujo demo.
- Decision: adaptar `frontend/app/page.tsx` manteniendo Next.js, Tailwind y datos reales de FastAPI. La referencia Figma guia la composicion visual, no la arquitectura ni el alcance funcional.

## Cambios implementados el 2026-04-13

- Backend FastAPI con modelos `User`, `Ingredient`, `Recipe`, `WeeklyMenu` y `MenuItem`.
- Endpoints: health, ingredientes, recetas, variante, ultimo menu, generar menu, sustituir plato y usar receta guardada.
- Servicio Gemini por REST usando `x-goog-api-key` y `responseMimeType: application/json`.
- Fallback local para generar menus, sustituciones y variantes sin clave de Gemini.
- Frontend Next.js 16.2.3 + TypeScript + Tailwind con pantalla unica del flujo principal.
- Docker Compose con PostgreSQL 16, backend y frontend.
- README ampliado con pasos de ejecucion, prompt log, guion de video y roadmap.
- `RTK.md` anadido como checklist operativo.

## Cambios implementados tras revision RTK

- Modelo por defecto actualizado a `gemini-2.5-flash-lite` en backend, Compose, `.env.example` y README.
- README documenta que el evaluador debe crear su propia clave en Google AI Studio y guardarla en `.env`.
- La clave no se expone al frontend; las llamadas a Gemini se hacen en FastAPI.
- `.env.example` solo contiene placeholders y `.env` sigue ignorado.

## Cambios implementados tras aclaracion RTK

- Se documenta que RTK externo es `rtk-ai/rtk`, no el archivo local `RTK.md`.
- Se mantiene `RTK.md` local como "Review and Test Kit" del proyecto.
- Se establece que el prompt log se actualizara durante el desarrollo cuando aparezcan prompts resenables.
- README actualizado con el prompt resenable de esta decision.

## Cambios implementados tras politica Git

- Se incorpora una politica de control de versiones profesional en `CLAUDE.md`.
- Se establece que no se haran commits sin revision previa de estado, diff, archivos sensibles y validaciones razonables.
- Se establece que los commits se propondran con Conventional Commits y se ejecutaran solo tras confirmacion del usuario.

## Cambios implementados tras Figma AI

- README actualizado para mencionar Figma AI en el guion del video.
- Prompt log actualizado con el prompt de generacion de interfaz mediante Figma AI.
- CLAUDE.md actualizado con la decision de usar el diseno como referencia UX, no como alcance obligatorio completo.
- Se registra limitacion tecnica de la primera revision: no habia export local y el canvas de Figma no pudo revisarse visualmente en headless.

## Cambios implementados tras export local de Figma

- Se reviso `../Diseño-web-figma` como referencia visual y se descarto importar su arquitectura Vite/React Router o sus dependencias generadas.
- `frontend/app/page.tsx` se adapto a un layout tipo SaaS con sidebar, dashboard, estadisticas, vista rapida del menu, nevera/preferencias y recetario con filtros por etiquetas.
- Se mantuvo la app como pantalla unica conectada a la API real para proteger el MVP y facilitar la demo de 3 minutos.

## Cambios implementados tras primer `docker compose up --build`

- El primer arranque Docker completo mostro que PostgreSQL y backend estaban OK y el frontend respondia HTTP 200, pero `next dev` repetia un panic de Turbopack: `Failed to write app endpoint /page` y `Next.js package not found`.
- Decision: Docker Compose pasa a modo estable de entrega. El frontend se construye en la imagen con `npm ci` + `npm run build` y arranca con `next start`; se eliminan los bind mounts y el volumen `frontend_node_modules` del frontend.
- El backend tambien deja de sobreescribir el `CMD` del Dockerfile con `--reload` y se elimina el bind mount en Compose. Para recarga en caliente se mantiene la ruta sin Docker del README.
- Se desactiva la telemetria de Next en el contenedor con `NEXT_TELEMETRY_DISABLED=1`.

## Cambios implementados tras separacion por capas Figma

- `frontend/app/page.tsx` se reestructura como app shell con navegacion interna por vistas: Dashboard, Menu semanal, Ingredientes, Recetas y Preferencias.
- La UI ya no es una pagina larga con anclas; cada vista aparece como una capa separada, mas cercana al prototipo Figma, manteniendo una sola ruta Next.js para no ampliar complejidad.
- Dashboard concentra resumen, imagen, estadisticas, vista rapida del menu, ingredientes listos y recetas recientes.
- Menu semanal, ingredientes, recetario y preferencias quedan como superficies independientes con sus acciones reales conectadas a FastAPI.
- El backend precarga 10 ingredientes demo para el usuario `demo-user` cuando la nevera esta vacia: pollo, huevos, garbanzos, arroz, pasta, tomate, espinacas, calabacin, yogur y queso feta.

## Cambios implementados tras ajuste de preferencias Figma

- La vista Preferencias deja de ser un textarea libre y pasa a ser un formulario estructurado inspirado en Figma.
- Se anaden selectores de tipo de dieta, restricciones alimentarias, ingredientes excluidos, objetivos y nivel de variedad semanal.
- El frontend construye automaticamente el resumen textual que se envia al backend/Gemini a partir de esas selecciones.
- El boton "Guardar cambios" registra el evento en el sistema de logging frontend y deja claro que las preferencias quedan listas para la siguiente generacion.

## Cambios implementados tras ajuste de recetario Figma

- La vista Recetas pasa a usar cards visuales con imagen, etiqueta de origen IA/fallback, tiempo, dificultad derivada y etiquetas.
- Los filtros del recetario se amplian: busqueda por texto/ingrediente/etiqueta, filtro por etiqueta, dificultad y tramo de tiempo.
- Se mantiene la funcionalidad real del MVP: crear variante y eliminar receta desde cada card.
- Las imagenes se asignan de forma determinista desde un conjunto de imagenes de comida remotas, sin introducir modelo nuevo ni cambios de backend.
- Las cards de recetas usan animacion hover CSS/Tailwind: elevacion, sombra, borde activo, overlay sutil y zoom suave de imagen.
- La cabecera de Recetas se ajusta a busqueda visible + boton `Filtros`; las opciones de etiqueta, dificultad y tiempo quedan dentro de un panel desplegable para evitar desalineacion visual.

## Cambios implementados tras ajuste de dashboard

- El dashboard muestra los 7 dias del menu semanal, no solo una preview de los primeros dias.
- Se calcula el dia actual comparando `week_start_date` con la fecha local y se marca la tarjeta correspondiente con un estado visual `Hoy`.
- Si el menu guardado no pertenece a la semana actual, el dashboard sigue mostrando toda la semana sin forzar un indicador incorrecto.

## Cambios implementados tras detalle editable de receta

- Se anade una vista interna `recipeDetail` dentro del shell actual, manteniendo sidebar y sin introducir rutas ni dependencias nuevas.
- La pantalla muestra cabecera con nombre, descripcion, tiempo, dificultad, raciones, estado guardada, imagen, etiquetas, ingredientes con cantidades, pasos numerados y consejo IA.
- El frontend permite editar nombre, descripcion, ingredientes/cantidades, pasos, etiquetas, tiempo, dificultad y raciones desde la misma pantalla.
- El backend anade `PATCH /recipes/{recipe_id}` y campos persistentes `difficulty` y `servings` en `Recipe`.
- Para bases existentes se anade una migracion ligera de arranque que asegura las columnas `difficulty` y `servings` sin introducir Alembic en el MVP.

## Estandar de logging y errores

- Logging es una preocupacion transversal. Cada nueva funcionalidad o correccion debe registrar eventos relevantes con `level`, `module`, `message`, `context`, `stack_trace` opcional y `created_at`.
- Tabla persistente: `system_logs`.
- Modulos/etiquetas recomendados: `frontend`, `api`, `backend`, `database`, `ai`, `menu_planning`, `auth`.
- Backend: usar `record_log` para eventos esperados y `record_exception` para excepciones con stack trace. No duplicar try/except en todo el codigo; usarlo en integraciones externas, generacion IA, acceso a datos y acciones de negocio criticas.
- Frontend: usar `reportClientLog` para errores de llamadas API y acciones criticas del usuario. No capturar todo el render ni cada componente; reportar puntos de fallo concretos.
- Seguridad: no enviar claves, secretos ni payloads sensibles en `context`; `logging_service` redacta claves cuyo nombre contenga `key`, `secret` o `password`.
- Endpoints: `GET /logs` lista logs recientes filtrables por `level` y `module`; `POST /logs` recibe eventos controlados del frontend.

## Cambios implementados tras sistema de logging

- Se anade modelo `SystemLog` y tabla `system_logs`.
- Se anade `backend/app/logging_service.py` como punto central para persistir logs y excepciones.
- Se anaden esquemas `SystemLogCreate` y `SystemLogOut`.
- Se anaden handlers globales de FastAPI para `HTTPException` y excepciones no controladas.
- Se anaden endpoints `GET /logs` y `POST /logs`.
- Se instrumentan eventos backend en arranque, ingredientes, variantes, generacion de menu, sustitucion y reutilizacion de recetas.
- Se instrumenta el adaptador Gemini para registrar fallback por falta de API key o fallo de llamada externa.
- Se anade `reportClientLog` en frontend para errores y eventos de acciones criticas.

## Verificacion realizada

- `python3 -m compileall backend/app` con dependencias instaladas en `/tmp/menu-backend-deps`: OK.
- Smoke test con `fastapi.testclient` y SQLite temporal: OK. Valida health, ingredientes, generacion de 14 platos, sustitucion, variante y repetir receta.
- `npm install` en frontend: OK.
- `npm audit --audit-level=high`: OK, 0 vulnerabilidades tras actualizar Next.
- `npm run build` en frontend: OK.
- `docker.exe compose config`: OK.
- `docker.exe compose build`: bloqueado porque Docker Desktop no esta activo.

## Verificacion tras cambio a Gemini 2.5 y RTK

- `python3 -m compileall backend/app`: OK.
- Smoke test backend con `GEMINI_API_KEY=` y fallback local: OK.
- `npm run build`: OK.
- `npm audit --audit-level=high`: OK, 0 vulnerabilidades.
- `docker.exe compose config`: OK, muestra `GEMINI_MODEL=gemini-2.5-flash-lite` y `GEMINI_API_KEY=""` cuando no hay `.env` local.

## Verificacion tras adaptacion visual Figma

- `npm run build` en frontend: OK.
- `git diff --check -- frontend/app/page.tsx CLAUDE.md README.md RTK.md`: OK.
- Backend local iniciado con SQLite temporal en `/tmp/menu-planner-figma-check.db`: `http://127.0.0.1:8000/health` devuelve `{"status":"ok"}`.
- Frontend dev iniciado con Next.js en `http://localhost:3000`; desde PowerShell devuelve HTTP 200. Desde WSL, `curl 127.0.0.1:3000` no lo ve porque el servidor queda como proceso Windows de `node.exe`.

## Verificacion tras correccion Docker/Turbopack

- `docker compose config`: OK.
- `docker compose up --build -d`: OK. El frontend ejecuta `next start --hostname 0.0.0.0` y ya no usa `next dev`/Turbopack.
- `docker compose ps`: db, backend y frontend quedan `Up`; db healthy.
- `curl -I http://localhost:3000`: HTTP 200.
- `curl http://localhost:8000/health`: `{"status":"ok"}`.
- `docker compose logs --tail=120 frontend`: sin `FATAL` ni panic de Turbopack.

## Verificacion tras separacion por capas Figma

- `npm run build` en frontend: OK.
- `python3 -m compileall backend/app`: OK.
- Smoke test backend con SQLite temporal y `GEMINI_API_KEY=`: OK. Valida 10 ingredientes demo, generacion de 14 platos y `ai_model=fallback-local`.
- `docker compose up --build -d`: OK tras los cambios de UI y seed.
- `curl -I http://localhost:3000`: HTTP 200.
- `curl http://localhost:8000/health`: `{"status":"ok"}`.
- `curl http://localhost:8000/ingredients`: devuelve 10 ingredientes demo.
- Chrome headless en Windows captura `http://localhost:3000` correctamente en `/tmp/menu-planner-screens/dashboard.png`.

## Verificacion tras sistema de logging

- `npm run build` en frontend: OK.
- `python3 -m compileall backend/app`: OK.
- Smoke test backend con SQLite temporal: OK. Valida 10 ingredientes demo, generacion de 14 platos, `POST /logs`, `GET /logs` y modulos `frontend`, `backend`, `database`, `ai`, `menu_planning`.
- `docker compose up --build -d`: OK.
- PostgreSQL contiene tabla `system_logs` junto a `ingredients`, `menu_items`, `recipes`, `users` y `weekly_menus`.
- `curl -I http://localhost:3000`: HTTP 200.
- `curl http://localhost:8000/health`: `{"status":"ok"}`.
- `POST /logs` devuelve `{"status":"logged"}` y `GET /logs?module=frontend` lista el evento.

## Verificacion tras ajuste de preferencias Figma

- `npm run build` en frontend: OK.
- `git diff --check -- frontend/app/page.tsx README.md CLAUDE.md RTK.md`: OK.
- `docker compose up --build -d frontend`: OK. Recompila frontend y recrea backend/frontend por dependencias de Compose; db permanece healthy.
- `curl -I http://localhost:3000`: HTTP 200.
- `curl http://localhost:8000/health`: `{"status":"ok"}`.

## Verificacion tras ajuste de recetario Figma

- `npm run build` en frontend: OK.
- `git diff --check -- frontend/app/page.tsx README.md CLAUDE.md RTK.md`: OK.
- `docker compose up --build -d frontend`: OK. Recompila frontend y recrea backend/frontend por dependencias de Compose; db permanece healthy.
- `curl -I http://localhost:3000`: HTTP 200.
- `curl http://localhost:8000/health`: `{"status":"ok"}`.

## Verificacion tras ajuste de dashboard

- `git diff --check -- frontend/app/page.tsx README.md CLAUDE.md RTK.md`: OK.
- `npm run build` en frontend: OK.
- `docker compose up --build -d frontend`: OK. Recompila frontend y recrea backend/frontend por dependencias de Compose; db permanece healthy.
- `curl -I http://localhost:3000`: HTTP 200.
- `curl http://localhost:8000/health`: `{"status":"ok"}`.
- `docker compose ps`: db, backend y frontend `Up`; db `healthy`.
- Chrome headless en Windows captura `http://localhost:3000` en `/tmp/menu-planner-dashboard-loaded.png`: se ven los 7 dias y `Lunes` marcado como `Hoy` para la semana `2026-04-13`.

## Verificacion tras detalle editable de receta

- `git diff --check -- backend/app/main.py backend/app/models.py backend/app/schemas.py frontend/app/page.tsx README.md CLAUDE.md RTK.md`: OK.
- `python3 -m compileall backend/app`: OK.
- `npm run build` en frontend: OK.
- Smoke test backend con SQLite temporal y dependencias en `/tmp/menu-backend-deps`: OK. Valida `POST /recipes`, `PATCH /recipes/{id}` actualizando titulo, dificultad, raciones, ingredientes y pasos.
- `docker compose up --build -d`: OK. Recompila backend/frontend y arranca contra PostgreSQL existente.
- Smoke test Docker/API real: `GET /health` 200, `POST /recipes` 201, `PATCH /recipes/{id}` 200 y `DELETE /recipes/{id}` 204 para una receta temporal.
- `curl -I http://localhost:3000`: HTTP 200.
- `docker compose ps`: db, backend y frontend `Up`; db `healthy`.
