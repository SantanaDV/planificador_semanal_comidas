# Memoria viva del proyecto

Ultima actualizacion: 2026-04-14.

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

- [X] App arranca localmente con `docker compose up --build`.
- [X] Frontend accesible en `http://localhost:3000`.
- [X] API accesible en `http://localhost:8000/docs`.
- [X] README contiene pasos claros, variables de entorno y solucion de problemas minima.
- [X] Prompt log con al menos 3 prompts y explicacion breve.
- [X] CLAUDE.md registra decisiones, cambios, roadmap y riesgos.
- [X] RTK.md existe como checklist operativo de revision y entrega.
- [X] Flujo principal completo: ingredientes -> preferencias -> generar menu -> sustituir plato -> consultar/filtrar/eliminar recetas.
- [X] La app funciona sin `GEMINI_API_KEY` usando fallback local.
- [X] El video de 3 minutos tiene guion: problema, solucion, IA usada, demo, mejoras.

## Arquitectura propuesta

Monolito modular dockerizado con dos servicios de aplicacion:

- `frontend`: Next.js renderiza la experiencia de usuario y consume la API REST.
- `backend`: FastAPI concentra reglas de negocio, persistencia y adaptador Gemini.
- `db`: PostgreSQL.

Justificacion: para una prueba de 72 horas evita complejidad de microservicios, colas o autenticacion avanzada, pero mantiene separacion clara frontend/backend y una arquitectura facil de defender.

## MVP exacto

En alcance:

- Usuario demo sin registro.
- CRUD basico de ingredientes con categorias persistidas, cantidad y fecha de caducidad.
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
- `ingredient_categories`: categorias controladas para ingredientes, ampliables en el futuro.
- `ingredients`: ingredientes de la nevera por usuario, categoria, cantidad y fecha de caducidad.
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

## Politica Git y control de versiones

## Memoria de trabajo: Prompt log y trazabilidad

El prompt log público ya está documentado en `README.md`.
Esta sección de `CLAUDE.md` sirve como regla interna para decidir cuándo registrar nuevos prompts o decisiones relevantes.

### Objetivo

Mantener trazabilidad honesta del uso de IA durante el desarrollo, especialmente en decisiones que afecten a arquitectura, producto, IA, UX, documentación, debugging, seguridad o entrega.

La prueba valora cómo se usa la IA, no solo el resultado final. Por eso, los prompts importantes deben quedar registrados con contexto suficiente para poder defender el proceso.

---

## Criterios para registrar un prompt

Registrar un prompt cuando cumpla al menos una de estas condiciones:

- Cambia una decisión técnica relevante.
- Define o modifica arquitectura, modelos, endpoints o flujo de datos.
- Cambia el alcance del MVP.
- Mejora una funcionalidad visible en la demo.
- Corrige un problema importante de UX o debugging.
- Afecta al uso de Gemini, fallback local o generación de menús.
- Cambia el comportamiento de Docker, README, ejecución local o entrega.
- Mejora el control de calidad, Git, testing, logging o manejo de errores.
- Sirve para explicar cómo se usó IA en el proyecto.

No registrar prompts triviales como:

- pequeños cambios de texto
- renombrados menores
- ajustes visuales sin impacto
- correcciones mecánicas sin decisión detrás

---

## Formato obligatorio para nuevos registros

Cuando haya un prompt reseñable, añadirlo al prompt log público usando este formato:

```md
### Prompt — <categoría o fase>

**Herramienta:** <ChatGPT / Codex / Antigravity / Figma AI / Gemini / otra>
**Objetivo:** <qué se quería conseguir>

**Prompt usado:**
> <prompt resumido o completo si es clave>

**Por qué funcionó:**
<1–2 líneas explicando el valor>

**Qué se ajustó después:**
<1–2 líneas si hubo iteración o cambio posterior>
```

## Reglas Git

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

## Revision local de Diseño-web-figma

- Export revisado: app Vite/React con `react-router`, `lucide-react`, dependencias MUI/Radix/shadcn y pantallas estaticas (`Dashboard`, `WeeklyMenu`, `Ingredients`, `Recipes`, `RecipeDetail`, `Preferences`).
- Reutilizable para el MVP: sidebar/navegacion por secciones, dashboard con estadisticas, vista rapida del menu, tarjetas de dia/plato, bloque de sugerencias IA, filtros del recetario y jerarquia visual blanca/neutra con acento verde.
- No reutilizar ahora: migrar a Vite, importar `react-router`, copiar el paquete completo de componentes `ui`, anadir MUI/Radix, usar mock data estatica, crear rutas completas de detalle/preferencias, implementar edicion de ingredientes o modales/drawers si no aportan al flujo demo.
- Decision: adaptar `frontend/app/page.tsx` manteniendo Next.js, Tailwind y datos reales de FastAPI. La referencia Figma guia la composicion visual, no la arquitectura ni el alcance funcional.

## Cambios implementados el 2026-04-13

- Backend FastAPI con modelos `User`, `Ingredient`, `Recipe`, `WeeklyMenu` y `MenuItem`.
- Endpoints: health, ingredientes, recetas, ultimo menu, generar menu, sustituir plato y usar receta guardada.
- Servicio Gemini por REST usando `x-goog-api-key` y `responseMimeType: application/json`.
- Fallback local para generar menus y sustituciones sin clave de Gemini.
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
- Decision actualizada el 2026-04-14: el backend ya no precarga ingredientes al arrancar. La nevera vacia se muestra como estado real y los ingredientes de prueba se cargan bajo demanda con `POST /ingredients/demo`.

## Cambios implementados tras ajuste de preferencias Figma

- La vista Preferencias deja de ser un textarea libre y pasa a ser un formulario estructurado inspirado en Figma.
- Se anaden selectores de tipo de dieta, restricciones alimentarias, ingredientes excluidos, objetivos y nivel de variedad semanal.
- El frontend construye automaticamente el resumen textual que se envia al backend/Gemini a partir de esas selecciones.
- El boton "Guardar cambios" registra el evento en el sistema de logging frontend y deja claro que las preferencias quedan listas para la siguiente generacion.

## Cambios implementados tras ajuste de recetario Figma

- La vista Recetas pasa a usar cards visuales con imagen, etiqueta de origen IA/fallback, tiempo, dificultad derivada y etiquetas.
- Los filtros del recetario se amplian: busqueda por texto/ingrediente/etiqueta, filtro por etiqueta, dificultad y tramo de tiempo.
- Se mantiene la funcionalidad real del MVP: abrir detalle y eliminar receta desde cada card.
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

## Cambios implementados tras eliminar mocks hardcodeados

- Se elimina la precarga automatica de ingredientes demo en el arranque del backend.
- Se anade `POST /ingredients/demo` para cargar ingredientes de prueba bajo demanda y persistirlos en base de datos.
- Se anade `GET /ai/status` para que el frontend pueda decidir si debe avisar antes de usar el fallback local.
- El backend bloquea `POST /menus/generate` cuando no hay ingredientes guardados, evitando menus con ingredientes inventados.
- El fallback local se mueve a `backend/app/demo_fallback.py` y queda documentado como modo demo/desarrollo.
- Los ingredientes demo viven en `backend/app/demo_data.py`, separados del flujo principal de API.
- El frontend muestra estado vacio para nevera sin ingredientes y ofrece una accion visible para cargar ingredientes de prueba.
- Las preferencias iniciales quedan neutras: sin restricciones, excluidos ni objetivos preseleccionados del prototipo.

## Cambios implementados tras ajuste del flujo de generacion

- Se define un minimo de 5 ingredientes para generar un menu semanal util.
- El frontend deja de redirigir automaticamente a Ingredientes cuando el usuario pulsa "Generar menu semanal" sin nevera suficiente.
- Se anade un modal de aviso para nevera vacia o insuficiente con acciones: "Ir a ingredientes", "Anadir ingredientes de prueba" y "Cancelar".
- El boton "Anadir ingredientes de prueba" deja de aparecer como accion principal del dashboard.
- Si hay ingredientes suficientes pero no hay clave valida de Gemini, se muestra un modal previo para continuar con modo demo o cancelar.
- La UI deja de mostrar `Gemini real`, `Menu IA`, `fallback local` o `ai_model` como etiquetas protagonistas del menu generado; esa diferencia queda para README y logs.
- El backend valida tambien el minimo de 5 ingredientes antes de llamar a Gemini o al fallback local.

## Cambios implementados tras mejora de ingredientes

- Se anade la tabla `ingredient_categories` con categorias iniciales: Verduras, Frutas, Proteinas, Lacteos, Cereales, Legumbres, Especias y Otros.
- Se anade `GET /ingredient-categories` y `category_id` en el contrato de ingredientes; se mantiene la columna legacy `category` solo para compatibilidad con bases existentes.
- Se sustituye el campo de UI `unidad` por `fecha de caducidad`; la cantidad pasa a ser un texto completo como `500 g`.
- Se anade `expires_at` a ingredientes y se incluye en el payload que recibe Gemini/fallback para poder priorizar productos proximos a caducar.
- Se anade una migracion ligera de arranque para asegurar `expires_at` y `category_id` en bases existentes sin introducir Alembic en el MVP.
- Se anade un backfill conservador para completar caducidad y cantidad de los ingredientes demo legacy si ya existian en una base local.
- La vista Ingredientes deja de mostrar formulario fijo y usa un modal de alta con nombre, categoria, cantidad y calendario de caducidad.
- Los filtros de Ingredientes incluyen busqueda, categoria y orden por caducidad ASC/DESC o cantidad parseada del texto.

## Cambios implementados tras recetas eliminadas en menu

- Se mantiene la estrategia de datos existente: al eliminar una receta asociada a un menu, el backend limpia `menu_items.recipe_id` y conserva el hueco del menu.
- El backend registra cuantos `menu_items` quedaron afectados cuando se borra una receta.
- Se corrige la respuesta de sustitucion/reutilizacion para que, tras rellenar un hueco que tenia `recipe_id = NULL`, la relacion `item.recipe` quede actualizada en memoria antes de serializar el menu.
- La UI deja de mostrar "Receta eliminada" y renderiza "Plato no disponible" con el texto "Esta receta ya no esta disponible".
- El dashboard y la vista Menu semanal ofrecen una accion `Sustituir plato` para resolver el hueco sin romper el menu.

## Cambios implementados tras preferencias conectadas a nevera

- La vista Preferencias deja de permitir ingredientes excluidos como texto libre y muestra una lista seleccionable con los ingredientes reales guardados en la nevera.
- El resumen de preferencias que recibe el backend traduce los IDs excluidos a nombres visibles para que Gemini entienda la restriccion sin desconectarla de la base de datos.
- El frontend valida que queden al menos 5 ingredientes disponibles despues de aplicar exclusiones antes de mostrar el aviso de Gemini/fallback.
- El backend filtra `excluded_ingredient_ids` antes de llamar a Gemini o al fallback tanto en generacion semanal como en sustitucion de platos.
- `weekly_menus.preferences` guarda los IDs excluidos usados para trazabilidad del menu generado.
- El backend calcula recetas guardadas compatibles con la nevera filtrada y las anade como contexto al generador, evitando recetas que contengan ingredientes excluidos por nombre.
- El prompt de Gemini se endurece para pedir solo ingredientes disponibles; el fallback local ya no anade aceite/sal/pimienta como ingredientes implicitos.

## Cambios implementados tras mejora UI de ingredientes excluidos

- La seccion "Ingredientes excluidos" deja de usar una cuadricula grande de tarjetas y pasa a un selector compacto con buscador, filtros por categoria y lista con scroll interno.
- El selector muestra un resumen visible de ingredientes excluidos, chips para quitar elementos concretos y accion para limpiar toda la seleccion.
- El estado vacio de la seccion ofrece "Ir a ingredientes" para conectar la configuracion de preferencias con la nevera real.
- Las preferencias se persisten en `localStorage` para mantener exclusiones, dieta, restricciones, objetivos y variedad tras refrescar la pagina.

## Cambios implementados tras mejora de recetario manual y favoritas

- Se elimina el flujo de "Crear variante" del recetario; la modificacion de recetas queda concentrada en el detalle editable.
- Las cards del recetario pasan a ser navegables completas, manteniendo acciones internas con propagacion controlada para editar, eliminar o marcar favorita.
- Se anade un modal "Anadir receta" para crear recetas manuales con nombre, foto por URL, descripcion, ingredientes/cantidades, pasos, tiempo, dificultad, raciones, etiquetas y favorito.
- `Recipe` incorpora `image_url` y mantiene `is_favorite`; la migracion ligera de arranque asegura ambas columnas en bases existentes.
- El generador recibe favoritas compatibles separadas de recetas guardadas compatibles y las prioriza en el prompt si encajan sin forzarlas.
- El fallback local tambien lee el contexto de favoritas compatibles y puede priorizarlas en los primeros huecos sin saltarse los ingredientes disponibles.
- El historial reciente deja de tomar todo el recetario y pasa a usar recetas realmente vinculadas a `menu_items`, para no penalizar una receta manual recien creada que aun no se ha usado en menus.

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
- Se instrumentan eventos backend en arranque, ingredientes, generacion de menu, sustitucion y reutilizacion de recetas.
- Se instrumenta el adaptador Gemini para registrar fallback por falta de API key o fallo de llamada externa.
- Se anade `reportClientLog` en frontend para errores y eventos de acciones criticas.

## Verificacion realizada

- `python3 -m compileall backend/app` con dependencias instaladas en `/tmp/menu-backend-deps`: OK.
- Smoke test con `fastapi.testclient` y SQLite temporal: OK. Valida health, ingredientes, generacion de 14 platos, sustitucion y repetir receta.
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
- `docker compose up --build -d`: OK tras los cambios de UI y carga demo inicial.
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

## Verificacion tras eliminar mocks hardcodeados

- `git diff --check -- .env.example CLAUDE.md README.md RTK.md backend/app/ai.py backend/app/config.py backend/app/main.py backend/app/schemas.py backend/app/demo_data.py backend/app/demo_fallback.py frontend/app/page.tsx`: OK.
- `python3 -m compileall backend/app`: OK.
- `npm run build` en frontend: OK.
- Smoke test backend con SQLite temporal y `GEMINI_API_KEY=`: OK. Valida `GET /ai/status` en modo fallback, `GET /ingredients` vacio, `POST /menus/generate` 400 sin ingredientes, `POST /ingredients/demo` crea 10 ingredientes y `POST /menus/generate` devuelve 14 platos con `ai_model=fallback-local`.
- `docker compose config`: OK, sin claves reales.
- `docker compose up --build -d`: OK. Recompila backend/frontend y arranca contra PostgreSQL existente.
- `docker compose ps`: db, backend y frontend `Up`; db `healthy`.
- `curl http://localhost:8000/health`: `{"status":"ok"}`.
- `curl -I http://localhost:8000/docs`: HTTP 200.
- `curl http://localhost:8000/ai/status`: fallback local cuando `GEMINI_API_KEY` esta vacia.
- `curl -I http://localhost:3000`: HTTP 200.

## Verificacion tras ajuste del flujo de generacion

- `git diff --check -- .env.example CLAUDE.md README.md RTK.md backend/app/ai.py backend/app/config.py backend/app/main.py backend/app/schemas.py backend/app/demo_data.py backend/app/demo_fallback.py frontend/app/page.tsx`: OK.
- `python3 -m compileall backend/app`: OK.
- `npm run build` en frontend: OK.
- Smoke test backend con SQLite temporal y `GEMINI_API_KEY=`: OK. Valida `POST /menus/generate` 400 con 0 ingredientes, 400 con 1 ingrediente, `POST /ingredients/demo` y generacion posterior de 14 platos con `ai_model=fallback-local`.
- `docker compose up --build -d frontend`: OK. Recompila backend/frontend y arranca contra PostgreSQL existente.
- `docker compose ps`: db, backend y frontend `Up`; db `healthy`.
- `curl http://localhost:8000/health`: `{"status":"ok"}`.
- `curl -I http://localhost:3000`: HTTP 200.

## Verificacion tras mejora de ingredientes

- `python3 -m compileall backend/app`: OK.
- `npm run build` en frontend: OK.
- Smoke test backend con SQLite temporal y `GEMINI_API_KEY=` usando dependencias en `/tmp/menu-backend-deps`: OK. Valida `GET /ingredient-categories`, `POST /ingredients` con `category_id` y `expires_at`, `POST /menus/generate` 400 con 1 ingrediente, `POST /ingredients/demo` y generacion posterior de 14 platos con `ai_model=fallback-local`.
- `docker compose up --build -d`: OK. Recompila backend/frontend y aplica migracion ligera sobre PostgreSQL existente.
- Smoke test Docker/API real: `GET /health` 200, `GET /ingredient-categories` devuelve 8 categorias, `POST /ingredients` con caducidad 201 y `DELETE /ingredients/{id}` 204 para un ingrediente temporal.
- `curl http://localhost:8000/ingredients`: OK. Los ingredientes demo legacy quedan con `category_id`, cantidad completa y `expires_at`.
- `curl -I http://localhost:3000`: HTTP 200.

## Verificacion tras recetas eliminadas en menu

- `python3 -m compileall backend/app`: OK.
- `git diff --check -- backend/app/main.py frontend/app/page.tsx CLAUDE.md README.md RTK.md`: OK.
- `npm run build` en frontend: OK.
- Smoke test backend con SQLite temporal y `GEMINI_API_KEY=` usando dependencias en `/tmp/menu-backend-deps`: OK. Valida generar menu, eliminar una receta asociada, obtener `recipe: null` en el hueco y sustituir ese `menu_item` devolviendo de nuevo una receta.

## Verificacion tras preferencias conectadas a nevera

- `python3 -m compileall backend/app`: OK.
- `npm run build` en frontend: OK.
- `git diff --check -- backend/app/main.py backend/app/schemas.py backend/app/ai.py backend/app/demo_fallback.py frontend/app/page.tsx README.md CLAUDE.md RTK.md`: OK.
- `rg` confirma que no quedan referencias al campo libre antiguo `excludedIngredients`/`excludedIngredientDraft`.
- Smoke test backend con SQLite temporal y `GEMINI_API_KEY=` usando dependencias en `/tmp/menu-backend-deps`: OK. Valida cargar ingredientes demo, bloquear generacion cuando las exclusiones dejan menos de 5 ingredientes, pasar solo recetas guardadas compatibles, generar 14 platos excluyendo un ingrediente concreto y sustituir un plato respetando la misma exclusion.

## Verificacion tras UI escalable de ingredientes excluidos

- `npm run build` en frontend: OK.
- `git diff --check -- frontend/app/page.tsx README.md CLAUDE.md RTK.md`: OK.
- `docker compose up --build -d frontend`: OK. Recompila frontend y recrea backend/frontend por dependencias de Compose; db permanece healthy.
- `docker compose ps`: db, backend y frontend `Up`; db `healthy`.
- `curl http://localhost:8000/health`: `{"status":"ok"}`.
- `curl -I http://localhost:3000`: HTTP 200.
- Bundle Docker verificado con el texto `Buscar por nombre`, confirmando que la UI nueva esta en el contenedor levantado.

## Verificacion tras mejora de recetario manual y favoritas

- `python3 -m compileall backend/app`: OK.
- `npm run build` en frontend: OK.
- Smoke test backend con SQLite temporal y `GEMINI_API_KEY=` usando dependencias en `/tmp/menu-backend-deps`: OK. Valida crear receta manual con foto y favorita, alternar favorito, generar menu con favorita compatible en `favorite_recipe_titles` y priorizarla en fallback local.
- `git diff --check -- backend/app/models.py backend/app/schemas.py backend/app/main.py backend/app/ai.py backend/app/demo_fallback.py frontend/app/page.tsx README.md CLAUDE.md RTK.md`: OK.
- `docker compose up --build -d`: OK. Recompila backend/frontend y arranca contra PostgreSQL existente.
- `docker compose ps`: db, backend y frontend `Up`; db `healthy`.
- `curl http://localhost:8000/health`: `{"status":"ok"}`.
- `curl -I http://localhost:3000`: HTTP 200.
- Smoke test Docker/API real: `POST /recipes` con foto/favorita 201, `PATCH /recipes/{id}` alternando favorito 200 y `DELETE /recipes/{id}` 204 para una receta temporal.
- PostgreSQL contiene columnas `recipes.image_url` y `recipes.is_favorite`.
- Bundle Docker verificado con el texto `Anadir receta`, confirmando que la UI nueva esta en el contenedor levantado.
