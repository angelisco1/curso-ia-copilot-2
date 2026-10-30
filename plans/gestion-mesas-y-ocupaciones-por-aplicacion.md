# Plan: gestión de mesas y ocupaciones por aplicación

- ID de tarea: **21**.
- Rama de implementación: `21/gestion-mesas`.
- Worktree de implementación: `.vscode/worktrees/21/gestion-mesas`.
- Rama base: `development` (si no existe, crear desde `main` o, en su defecto, `master`).
- Validación del nombre: `git check-ref-format --branch 21/gestion-mesas`, correcta durante la planificación.
- Estado: bloques A–D (T01–T44) implementados y verificados localmente, e integrados en `21/gestion-mesas` junto con `master` (2026-10-30). Pendientes T45–T47 (documentación general y aceptación cruzada en navegador) y la marca de todos los CA.
- Organización: un bloque por aplicación, contratos previos y una integración final. Los identificadores Txx son pasos, no nuevas issues.

## Objetivo

Permitir que el administrador gestione las mesas de cada restaurante; que el cliente indique cuántas personas son, seleccione una mesa libre con capacidad suficiente y la ocupe únicamente al continuar hacia la carta; y que el personal autorizado consulte y cambie los estados y vea los pedidos de la ocupación actual.

Conservar los pedidos históricos y el flujo existente de preparación en cocina, bebidas en barra y entrega en salón.

## Alcance

### Incluido

- Mesas por restaurante con id, número, descripción, capacidad y estado `libre`, `ocupada` o `reservada`.
- CRUD de administrador, consulta de disponibilidad y confirmación de ocupación.
- Sesiones de ocupación para separar pedidos de visitas distintas a una misma mesa.
- Asociación de los nuevos pedidos de clientes a su mesa y sesión activa, validada en servidor.
- Salón con estados de todas las mesas y detalle de los pedidos de la sesión actual, incluidos los entregados.
- Persistencia en servidor y recuperación de la ocupación del cliente tras recargar o volver.
- Autorización y pertenencia al restaurante de las nuevas operaciones.
- Evolución no destructiva de la BD existente, datos de prueba, pruebas y documentación directamente relacionadas.

### Fuera de alcance

- Reservas con fecha, agenda, datos de contacto o confirmaciones: `reservada` es solo un estado manual.
- Unión de mesas, reparto de un grupo entre mesas, plano gráfico, pagos o facturación.
- Incorporación de otros clientes a una ocupación existente o transferencia de titularidad.
- WebSockets, cambios generales de autenticación o refactorización de dominios existentes a DDD.
- Corregir permisos o validaciones de endpoints ajenos a las operaciones modificadas.
- Implementar ahora: esta entrega solo crea este plan; no crea ramas, commits, contratos ni código funcional.

## Contexto comprobado

- El monorepo usa npm workspaces: [package.json](../package.json). Seguir [AGENTS.md](../AGENTS.md), la [arquitectura general](../docs/arquitectura/arquitectura-general.md), la [API](../docs/arquitectura/arquitectura-api.md) y el [frontend](../docs/arquitectura/arquitectura-frontend.md).
- No hay entidad de mesas. [database.ts](../packages/api/src/config/database.ts) crea las tablas mediante `CREATE TABLE IF NOT EXISTS`; `orders.table_id` es texto nullable sin FK. Añadir columnas requiere una evolución explícita para bases existentes: no basta con cambiar el CREATE.
- [order.service.ts](../packages/api/src/services/order.service.ts) genera un `OrderItem` por unidad con estado inicial `pendiente`. [order.repository.ts](../packages/api/src/repositories/order.repository.ts) considera activos los pedidos con al menos un ítem no entregado. No existe un estado global de pedido.
- [order.routes.ts](../packages/api/src/routes/order.routes.ts) exige autenticación, pero no diferencia actualmente los roles de las operaciones. El alcance incluye validar actor/sesión en la creación modificada, no una revisión general de todos los endpoints.
- El patrón para el nuevo dominio será por capas: `models/`, `repositories/`, `services/`, `controllers/`, `routes/`, no `contexts/employee/`.
- Hay contratos OpenAPI independientes en [docs de la API](../packages/api/docs/); no existe todavía uno de mesas ni uno de pedidos.
- Admin organiza cada feature con modelos, servicios HTTP, store con signals y páginas. [ingredient.store.ts](../packages/web-admin/src/app/features/ingredients/store/ingredient.store.ts) ya evita que respuestas tardías de otro restaurante sobrescriban el actual.
- [app.routes.ts de admin](../packages/web-admin/src/app/app.routes.ts), el [menú lateral](../packages/web-admin/src/app/core/layout/shell.component.html) y el [dashboard del restaurante](../packages/web-admin/src/app/features/restaurants/pages/restaurant-dashboard/restaurant-dashboard.component.html) son puntos de entrada a las features.
- [Salón](../packages/web-empleados/src/app/features/orders/pages/salon/salon.component.ts) muestra actualmente solo ítems `listo`. [OrderStore](../packages/web-empleados/src/app/features/orders/store/order.store.ts) consulta cada 30 segundos. Mantener el panel de entregas además de las nuevas mesas.
- [employee-access.ts](../packages/web-empleados/src/app/core/auth/employee-access.ts) permite salón a camarero, manager y admin, pero no a cocinero. Los componentes toman `restaurantId` del usuario; admin no tiene restaurante asignado y necesitará selector en salón.
- [Listado de restaurantes del cliente](../packages/web-clientes/src/app/features/restaurants/restaurant-list.component.ts) lleva directamente a la carta. [OrderService del cliente](../packages/web-clientes/src/app/core/services/order.service.ts) envía `tableId: null`; [CartStore](../packages/web-clientes/src/app/core/store/cart.store.ts) solo mantiene carrito/restaurante en memoria.
- Admin y empleados tienen `ng test --watch=false`. [Clientes](../packages/web-clientes/package.json) no tiene script de tests ni target de pruebas en [angular.json](../packages/web-clientes/angular.json). Añadir la configuración mínima equivalente a los otros paquetes es necesario para TDD, no considerar `npm test` cobertura frontend.
- API dispone de Vitest y Supertest. Hay ejemplos de integración SQLite en [ingredient.repository.test.ts](../packages/api/src/repositories/ingredient.repository.test.ts). No hay script de build de API; comprobar tipos con TypeScript.
- El checkout original contiene cambios ajenos en la skill de commits, issues y agentes. No modificarlos ni incorporarlos a los commits de esta tarea.

## Requisitos confirmados con el usuario

1. Camarero, manager y admin consultan y cambian mesas desde salón; cocina conserva su acceso actual.
2. Se registra una sesión de ocupación y el detalle de mesa muestra únicamente los pedidos de la sesión actual.
3. La liberación es manual, incluso con pedidos pendientes; borrar una mesa debe conservar su historial.
4. Salir, recargar o cambiar de restaurante no libera la mesa; al volver se recupera la ocupación hasta que un empleado la libere.

## Contrato de coordinación entre aplicaciones

Estas son decisiones de diseño propuestas por este plan, no hechos ya implementados. T01 las documentará en OpenAPI antes de programar consumidores.

### Modelo y reglas

- `RestaurantTable`: `id`, `restaurantId`, `number`, `description`, `capacity`, `status`; número y capacidad son enteros positivos. Descripción textual, admite cadena vacía; no introducir límite arbitrario de capacidad. En lectura, `activeSessionId` nullable permite invalidar detalles cuando cambia la visita; no es editable ni revela la identidad del cliente.
- Número único entre mesas no eliminadas del mismo restaurante; el mismo número se permite en restaurantes distintos. IDs UUID generados en servidor.
- Borrado lógico mediante `deletedAt`, fuera de los listados operativos y de disponibilidad. El id histórico no cambia ni se reutiliza aunque se cree otra mesa con el mismo número.
- `TableSession`: `id`, `restaurantId`, `tableId`, `clientId` nullable para ocupación manual, `partySize` nullable solo para ocupación manual, `startedAt`, `endedAt`.
- Una sesión abierta por mesa; una sesión de cliente abierta por restaurante y cliente. Un cliente puede conservar sesiones en restaurantes distintos: cambiar de restaurante no libera las anteriores.
- `Order` incorpora `tableSessionId` nullable para pedidos antiguos y `tableNumber` de presentación cuando haya mesa conocida. En lectura, `tableSessionEndedAt` nullable permite etiquetar pedidos de visitas cerradas sin consultar sesiones ajenas. Mantener `tableId` y todos los campos anteriores.
- Los pedidos históricos sin sesión siguen siendo consultables y procesables; no asociarlos por número ni atribuirlos automáticamente a una nueva visita.
- Solo `libre` y `capacity >= partySize` es elegible por clientes. Listar o seleccionar no cambia el estado. Continuar confirma en servidor y abre la sesión de forma atómica.
- Revalidar capacidad, estado, restaurante y titularidad al ocupar y al crear un pedido. Un cliente no puede enviar pedidos sin sesión propia activa ni falsificar `tableId`, `restaurantId` o una sesión ajena.
- Reintentar la misma confirmación del mismo cliente/mesa/grupo devuelve su sesión activa sin duplicarla. Intentar otra mesa teniendo sesión activa en ese restaurante devuelve conflicto y permite recuperar la existente.
- Cambiar `ocupada -> libre/reservada` cierra la sesión; `libre/reservada -> ocupada` manual abre una sesión sin cliente. Repetir `ocupada -> ocupada` no crea otra visita. No adoptar ni reemplazar al titular de una sesión existente.
- Liberar no entrega ni cancela pedidos. Los pendientes de sesiones cerradas continúan en cocina/barra/entregas, etiquetados como ocupación anterior cuando corresponda; nunca aparecen como pedidos de la nueva sesión.
- Borrar una mesa cierra su sesión y la elimina lógicamente, incluso ocupada, con advertencia de confirmación en admin. No eliminar sesiones, pedidos ni ítems.
- Cambiar capacidad de una mesa con sesión de cliente no puede reducirla por debajo de `partySize`; devolver conflicto. No cambiar una mesa de restaurante.

### Superficie HTTP prevista

Todos los paths parten de `/api/v1` y requieren JWT.

| Operación | Contrato | Permisos |
| --- | --- | --- |
| CRUD de mesas | `GET/POST /restaurants/:restaurantId/tables`, `GET/PUT/DELETE /restaurants/:restaurantId/tables/:tableId` | Crear/editar/borrar: admin. Leer: admin, manager y camarero |
| Cambiar estado | `PATCH /restaurants/:restaurantId/tables/:tableId/status`, `{status}` | admin, manager y camarero |
| Disponibilidad | `GET /restaurants/:restaurantId/tables/available?partySize=N` | cliente; respuesta con mesas libres suficientes |
| Ocupar | `POST /restaurants/:restaurantId/table-sessions`, `{tableId, partySize}` | cliente; `clientId` sale del JWT |
| Recuperar ocupación | `GET /restaurants/:restaurantId/table-sessions/current` | cliente; su sesión y mesa, o `null` si no existe |
| Pedidos de la visita actual | `GET /restaurants/:restaurantId/tables/:tableId/orders` | admin, manager y camarero; solo sesión abierta, todos sus ítems |
| Crear pedido | `POST /orders`, ampliado con `tableSessionId` y mesa coherente | cliente: sesión obligatoria; conservar llamadas no cliente existentes sin imponerles una sesión de cliente |

- Registrar `/available` antes de `/:tableId`; usar `mergeParams` en routers anidados.
- Manager/camarero solo operan en su restaurante; admin puede elegir cualquiera. Cocinero no accede a las nuevas operaciones de salón.
- No exponer datos personales de otros clientes en disponibilidad o listado de mesas.
- Estados de respuesta: `400` entrada inválida, `401` sin sesión, `403` rol/restaurante/titularidad no permitidos, `404` recurso inexistente o borrado, `409` conflicto de ocupación/número/capacidad. `201` ocupación nueva, `200` recuperación/reintento o actualización, `204` borrado.
- Los nuevos errores siguen `{error, message}` y el mecanismo de errores de dominio; documentar la creación de pedidos sin cambiar innecesariamente su respuesta de éxito. No ocultar fallos SQL como éxito o lista vacía.
- El servidor es fuente de verdad: no inferir ocupación desde localStorage ni usar solo comprobación previa seguida de escritura desprotegida.

## Tareas

Todos los pasos están pendientes y estiman entre 5 y 10 minutos. En cada paso de código aplicar rojo, verde y refactor; si supera 10 minutos, dividirlo antes de ejecutarlo, conservando el identificador original y registrando los nuevos. Las rutas marcadas como nuevas son destinos previstos.

### A. API — agente API Node Express

Propiedad: `packages/api/**`. Este agente entrega contrato y backend; no modifica los frontends. Los cambios generales de documentación quedan en integración.

- [x] **T01 (10 min)** ~~Documentar modelos, transiciones, permisos y endpoints de mesas~~
  - Archivos: `packages/api/docs/tables.openapi.yaml` (nuevo).
  - Dependencias: ninguna.
  - Comprobación: contrato con ejemplos de tres estados, capacidad, sesión actual, reintento, borrado lógico y errores; confrontar cada fila de la superficie HTTP con un path.
  - Evidencia: tarea documental, no aplica rojo/verde. `npx --yes @apidevtools/swagger-cli validate packages/api/docs/tables.openapi.yaml` válido; `npx --yes @redocly/cli@latest lint --extends minimal packages/api/docs/tables.openapi.yaml` sin errores (avisos de `servers: localhost` y esquema `CategoriaPlato` no referenciado en el contrato de pedidos). Revisado por agentes admin, empleados y clientes: los tres aprobaron; observaciones no bloqueantes registradas para implementación.
- [x] **T02 (5 min)** ~~Documentar la ampliación de pedidos y compatibilidad histórica~~
  - Archivos: `packages/api/docs/orders.openapi.yaml` (nuevo).
  - Dependencias: T01.
  - Comprobación: ejemplos con/sin sesión histórica, petición de cliente con sesión propia y respuesta con mesa; conservar expansión por unidad y categorías.
  - Evidencia: tarea documental, no aplica rojo/verde. `npx --yes @apidevtools/swagger-cli validate packages/api/docs/orders.openapi.yaml` válido; `npx --yes @redocly/cli@latest lint --extends minimal packages/api/docs/orders.openapi.yaml` sin errores, con avisos no bloqueantes de `servers: localhost` y esquema `CategoriaPlato` sin referencia. Los agentes admin, empleados y clientes revisaron el contrato completo y aprobaron iniciar implementación; anotaron casos de error de sesión para resolver durante T12/T41.
- [x] **T03 (10 min)** ~~Definir tipos y validaciones de mesa y ocupación~~
  - Archivos: `packages/api/src/models/table.model.ts`, `table-session.model.ts` (nuevos), `errors/DomainErrors.ts`; tests nuevos junto a los modelos.
  - Dependencias: T01.
  - Comprobación: tests rechazan estados desconocidos, número/capacidad/grupo cero, negativos, fracciones, strings, null y campos ausentes donde sean obligatorios.
  - Evidencia: rojo con `npx vitest run src/models` (exportaciones como stubs `not implemented`, para que el fallo no sea de importación): 57 tests fallidos por `expected error to be instance of Invalid…Error`/`got 'not implemented'`. Verde: 57/57 en `src/models`; `npm test` 12 archivos / 123 tests en verde. Cubre estados desconocidos (mayúsculas, vacío, null), número/capacidad/grupo 0, negativos, fracciones, strings, null, NaN, ausentes; descripción vacía válida; defaults de creación; id/restaurantId ignorados. `tsc --noEmit` solo muestra los 12 errores previos de `src/scripts/seed.ts` (`Object is possibly 'undefined'`, anteriores a esta tarea; se tratan en T17).
- [x] **T04 (10 min)** ~~Añadir esquema de mesas y sesiones con restricciones~~
  - Archivos: `packages/api/src/config/database.ts`, `config/database.test.ts` (nuevo).
  - Dependencias: T03.
  - Comprobación: SQLite en memoria; FK de restaurante/mesa, unicidad de número activo y de sesiones abiertas; inicializar dos veces no duplica ni destruye datos.
  - Evidencia: rojo con `npx vitest run src/config`: 12 tests fallidos (`no such table: restaurant_tables`). Verde: 12/12. Se añade `restaurant_tables` y `table_sessions` con CHECK de estado/número/capacidad/grupo, FK a restaurante/mesa, índice único parcial de número entre no borradas y de sesión abierta por mesa y por (restaurante, cliente). Las unicidades las impone SQLite, base de las garantías de atomicidad de T07/T08. `Database` acepta ahora ruta opcional (necesaria para probar reinicialización sobre archivo temporal: datos y 3 índices intactos tras una segunda `initialize`). `npm test` 13 archivos / 135 tests en verde.
- [x] **T05 (10 min)** ~~Evolucionar pedidos existentes sin borrar la base~~
  - Archivos: `packages/api/src/config/database.ts`, `config/database.test.ts`.
  - Dependencias: T04.
  - Comprobación: fixture con esquema anterior y pedido previo; detectar columna con `PRAGMA table_info`, añadir `table_session_id` nullable una sola vez; pedido/ítems previos intactos y reapertura correcta. No borrar `resttek.db`.
  - Evidencia: rojo con `npx vitest run src/config`: 4 tests fallidos (`table_session_id` inexistente en la base heredada y en la nueva). Verde: 16/16. Fixture con esquema anterior (pedido `o1` con mesa de texto `mesa-7` y dos ítems) creado con sqlite3 en archivo temporal: tras `initialize` la columna `table_session_id` (FK a `table_sessions`, nullable) existe una sola vez detectada con `PRAGMA table_info`, el pedido/ítems quedan intactos con `table_session_id` null y reabrir no repite la migración. FK aplicada a sesiones inexistentes. No se toca `resttek.db`. `npm test` 13 archivos / 139 tests en verde.
- [x] **T06 (10 min)** ~~Persistir CRUD, disponibilidad y borrado lógico de mesas~~
  - Archivos: `packages/api/src/repositories/table.repository.ts`, `table.repository.test.ts` (nuevos).
  - Dependencias: T04.
  - Comprobación: filtros por restaurante/estado/capacidad, duplicados por restaurante, número reutilizable tras borrado e IDs distintos; excluir borradas.
  - Evidencia: rojo con `npx vitest run src/repositories/table.repository` (repositorio como stub `not implemented`): 10 tests fallidos. Verde: 10/10 contra SQLite en memoria. Verificado: alta/lectura con `activeSessionId` (solo sesión abierta), `findById` acotado a restaurante y sin borradas, listado por número, disponibilidad (solo libres, capacidad suficiente, orden capacidad/número, sin borradas ni otros restaurantes), duplicado por restaurante → `TableNumberConflictError`, mismo número en otro restaurante, número reutilizable tras borrado con id distinto (el id histórico se conserva), `updateDetails` sin tocar restaurante/estado, null para ajena/borrada y conflicto de número; errores SQL distintos de la unicidad no se ocultan. `npm test` 14 archivos / 149 tests; `tsc` sin errores nuevos.
- [x] **T07 (10 min)** ~~Persistir ocupación y recuperación atómicas e idempotentes~~
  - Archivos: `packages/api/src/repositories/table-session.repository.ts`, `table-session.repository.test.ts` (nuevos); soporte transaccional acotado en `config/database.ts` si hace falta.
  - Dependencias: T04, T06.
  - Comprobación: dos clientes compiten por una mesa: una sesión ganadora y un conflicto; reintento del ganador no duplica. Fallo intermedio deja mesa libre y ninguna sesión huérfana. Evitar transacciones intercaladas en la conexión SQLite compartida.
  - Evidencia: rojo: `npx vitest run src/config` 6 fallos (`db.transaction is not a function`) y `src/repositories/table-session` con `occupy` como stub: 15 fallos (`not implemented`, errores de dominio esperados ausentes). Verde: 33/33 en repositorios y 22/22 en config; `npm test` 15 archivos / 170 tests. Atomicidad: `Database` serializa FIFO todas las sentencias de la conexión compartida y `transaction(work)` (BEGIN IMMEDIATE/COMMIT/ROLLBACK) conserva el turno hasta el cierre, así que una consulta o escritura ajena no se intercala ni se revierte con ella (pruebas `database.test.ts`: commit, rollback por excepción y por SQL fallido, lectura ajena no ve datos sin confirmar, escritura ajena sobrevive al rollback, transacciones serializadas). `occupy` valida y escribe dentro de una transacción con `UPDATE … WHERE status='libre'` y respaldo de los índices únicos de T04. Pruebas de carrera: dos clientes por una mesa → 1 ganador y 1 `TableNotAvailableError`; 10 simultáneos → 1 sesión abierta; mismo cliente doble envío → 1 `created:true` + 1 `false` con la misma sesión; mismo cliente en dos mesas → 1 sesión y 1 `ActiveTableSessionExistsError`. Rollback: INSERT duplicado de sesión y fallo inyectado `disk I/O error` tras el UPDATE dejan la mesa libre sin sesión abierta y la mesa sigue ocupable. Reintento idempotente, conflicto por otra mesa/grupo, sesiones en restaurantes distintos, mesas ajenas/borradas/reservadas/capacidad cubiertos. Limitación: el aislamiento es por conexión única de un proceso (como la app actual); varios procesos sobre la misma BD se apoyarían en BEGIN IMMEDIATE y los índices únicos.
- [x] **T08 (10 min)** ~~Implementar cambios de estado y borrado con cierre de sesión~~
  - Archivos: repositorios de T06–T07 y sus tests.
  - Dependencias: T07.
  - Comprobación: ocupar manualmente, reservar, liberar con pedidos pendientes y borrar ocupada son consistentes; cerrar sesión y cambiar estado/borrar es atómico. Competir liberación/borrado con ocupación no deja sesiones abiertas en mesas libres o borradas.
  - Evidencia: rojo con `npx vitest run src/repositories` (`replace`, `changeStatus` y `delete` como stubs): 16 fallos (`not implemented`, `TableCapacityConflictError`/`TableNumberConflictError` no lanzados, sesión manual no abierta al crear ocupada, sesión abierta tras borrar). Verde: 48/48 repositorios; `npm test` 15 archivos / 185 tests; `tsc` sin errores nuevos. Verificado: crear ocupada abre sesión manual (`clientId`/`partySize` null); libre/reservada→ocupada abre sesión manual; repetir ocupada no crea otra; ocupada→libre/reservada cierra la sesión sin tocar ítems ni `table_session_id` de pedidos pendientes; libre↔reservada sin sesiones; `replace` (PUT) aplica las mismas transiciones, rechaza capacidad < `partySize` de la sesión de cliente que sigue activa (`TableCapacityConflictError`, sin cambios parciales) y es atómico ante conflicto de número (estado y sesión intactos); borrar una mesa ocupada cierra la sesión, marca `deleted_at`, conserva sesión/pedido/ítems, libera el número y devuelve false si ya estaba borrada o es ajena. Todo cambio de estado y su sesión van en una única `db.transaction`. Carreras (pruebas): ocupar vs liberar y ocupar vs borrar en ambos órdenes nunca dejan sesión abierta en mesa libre ni borrada (ocupar tras borrar → `TableNotFoundError`); ocupación de cliente vs cambio manual a ocupada dejan una sola sesión. El test de T06 que creaba una mesa ocupada se ajustó porque ahora esa creación abre sesión (cambio de comportamiento previsto en T08); `updateDetails` se sustituyó por `replace` (sus pruebas se migraron).
- [x] **T09 (10 min)** ~~Implementar reglas de CRUD y transiciones en el servicio~~
  - Archivos: `packages/api/src/services/table.service.ts`, `table.service.test.ts`, mocks de repositorios (nuevos).
  - Dependencias: T03, T06, T08.
  - Comprobación: restaurante existente, pertenencia, campos inmutables, capacidad frente al grupo activo y conflictos; PUT y PATCH usan las mismas reglas de estado.
  - Evidencia: rojo con `npx vitest run src/services/table.service` (servicio como stub `not implemented`): 18 fallos. Verde: 18/18; `npm test` 17 archivos / 213 tests; `tsc` sin errores nuevos. Verificado con `MockTableRepository`: restaurante existente (404), pertenencia (manager/camarero solo el suyo; cocinero y cliente → `ForbiddenRestaurantError`; crear/PUT/borrar solo admin → `ForbiddenRoleError`), id y restaurantId inmutables (ignorados del cuerpo, UUID generado en servidor), PUT exige los cuatro campos, conflicto de número, conflicto de capacidad frente al grupo activo, 404 de mesa inexistente/borrada/ajena, PATCH idempotente y PUT/PATCH con la misma transición. Se añaden `models/actor.model.ts` (guard `toActor` de claims JWT sin `any`) con su test: ese modelo y su test se escribieron juntos y no tuvieron rojo previo observado; el resto sí. La atomicidad real de estas reglas está cubierta en T07/T08 (repositorio SQLite), no por el mock.
- [x] **T10 (10 min)** ~~Implementar confirmación y recuperación de la sesión propia~~
  - Archivos: `packages/api/src/services/table-session.service.ts`, `table-session.service.test.ts` (nuevos).
  - Dependencias: T07, T09.
  - Comprobación: solo libres suficientes; rechazar mesa ajena, borrada, reservada u ocupada por otro; recuperar solo la del actor y permitir sesiones en restaurantes distintos.
  - Evidencia: rojo con `npx vitest run src/services/table-session` (servicio como stub): 12 fallos (`not implemented`). Verde: 12/12; `npm test` 18 archivos / 225 tests; `tsc` sin errores nuevos. Verificado con mocks: disponibilidad solo con mesas libres y capacidad suficiente (vista `id/number/description/capacity`, sin estado ni sesión), `partySize` de query estricto (`'3'` válido; vacío, texto, 0, negativo, fracción, notación científica, array → `InvalidPartySizeError`); confirmar usa el `id` del JWT y descarta `clientId`/`restaurantId` del cuerpo; reintento idéntico → misma sesión (`created:false`); mesa ajena/inexistente/borrada → `TableNotFoundError`; reservada, ocupada (manual o por otro) → `TableNotAvailableError`; grupo mayor → `TableCapacityExceededError`; otra mesa con sesión activa → `ActiveTableSessionExistsError`; sesiones en restaurantes distintos permitidas; `current` devuelve null/propia, solo del actor y por restaurante; solo rol cliente (`ForbiddenRoleError`). La atomicidad frente a carreras sigue cubierta por T07/T08 sobre SQLite.
- [x] **T11 (10 min)** ~~Ampliar persistencia y consulta de pedidos por sesión~~
  - Archivos: `packages/api/src/models/order.model.ts`, `repositories/order.repository.ts`, `repositories/order.repository.test.ts` (nuevo), `repositories/mocks/MockOrderRepository.ts`.
  - Dependencias: T05, T07.
  - Comprobación: guardar/leer `tableSessionId` y número, proyectar cierre de sesión en pedidos activos, consultar todos los ítems de una sesión incluidos entregados, excluir visitas anteriores y mantener consultas antiguas sin sesión.
  - Evidencia: rojo con `npx vitest run src/repositories/order.repository` (`findBySession` stub y campos sin persistir): 6 fallos. Verde: 6/6 sobre SQLite en memoria; `npm test` completo verde; `tsc` sin errores nuevos. Verificado: se guarda y lee `tableSessionId`; `tableNumber` y `tableSessionEndedAt` se proyectan por JOIN (null en pedidos antiguos); `findActiveByRestaurant` conserva pendientes de sesiones cerradas con su cierre y excluye entregados; `findByClientId` incluye sesiones cerradas; `findBySession` devuelve todos los items (también entregados), solo de esa sesión, orden `createdAt` ASC; avance de items intacto. `OrderService.create` fija provisionalmente los tres campos a null hasta T12.
- [x] **T12 (10 min)** ~~Validar sesión del actor al crear nuevos pedidos de cliente~~
  - Archivos: `packages/api/src/services/order.service.ts`, `services/order.service.test.ts`, repositorios implicados y mocks.
  - Dependencias: T10, T11.
  - Comprobación: rechazar sesión cerrada/ajena, discordancia restaurante/mesa y ausencia de sesión de cliente; pedido correcto mantiene un ítem por unidad. Validación y escritura no permiten pedidos después de cerrar la sesión en una carrera concurrente.
  - Evidencia: rojo: 7 fallos en `npx vitest run src/repositories/order.repository` (`createInSession` stub) y 9 en `src/services/order.service` (el servicio ignoraba rol y sesión). Verde: 14/14 y 15/15; `npm test` 19 archivos / 250 tests; `tsc` sin errores nuevos. Atomicidad demostrada sobre SQLite real: `createInSession` valida la sesión y escribe pedido e items dentro de una única `transaction` (BEGIN IMMEDIATE + mutex FIFO). Pruebas de carrera: liberar mesa antes del pedido → pedido rechazado (`TableSessionClosedError`) y sin filas; pedido antes de liberar → guardado y sesión cerrada después; borrado lógico concurrente → ningún pedido; 10 pedidos previos + cierre + 5 posteriores → los posteriores fallan y no existen; rollback con item duplicado → sin pedido ni items y el repositorio sigue operativo. Servicio: cliente exige `tableSessionId` (`TableSessionRequiredError`), sesión inexistente/ajena/cerrada y discordancia de restaurante/mesa rechazadas (nuevos `TableSessionNotFoundError`, `TableSessionForbiddenError`, `TableSessionClosedError`, `TableSessionMismatchError`); `tableId` y `tableNumber` los fija la sesión; un ítem por unidad; actores no cliente conservan la llamada antigua (sesión opcional, sin exigir titularidad, pero no cerrada). Pendiente de confirmar en T13/T14: el contrato fija 400 con `{error,message}` para la discordancia; se usa `TableSessionMismatchError`. Aislamiento válido para una conexión SQLite en un único proceso.
- [x] **T13 (10 min)** ~~Exponer controladores, rutas de mesas y mapeo de errores~~
  - Archivos: `packages/api/src/controllers/table.controller.ts`, `table-session.controller.ts`, `routes/table.routes.ts`, `table-session.routes.ts` (nuevos), `app.ts`, `contexts/shared/infrastructure/http/errorHandler.ts`.
  - Dependencias: T09, T10.
  - Comprobación: endpoints conforme a T01, `available` no se interpreta como id, códigos 400/404/409 correctos; errores inesperados no se silencian. Usar tipos/guards del actor sin nuevos `any`.
  - Evidencia: rojo: `npx vitest run src/routes` 16 fallos (rutas inexistentes → 404). Verde: 16/16 (Supertest sobre BD en memoria); `npm test` 21 archivos / 266 tests; `tsc` sin errores nuevos. Verificado contra tables.openapi.yaml: POST/GET/GET id/PUT/PATCH status/DELETE (204 sin cuerpo) de mesas; `/tables/available` registrada antes de `/:tableId` y no se interpreta como id; `POST /table-sessions` 201 nueva / 200 reintento; `GET /current` 200 con `null` literal; el cuerpo no puede forzar `restaurantId`, `id` ni `clientId`. Mapeo en `errorHandler`: 404 (`TableNotFoundError`, `TableSessionNotFoundError`), 409 (número duplicado, capacidad, no disponible, excede capacidad, sesión activa, sesión cerrada), 403 (`ForbiddenRestaurantError`, `ForbiddenRoleError`, `TableSessionForbiddenError`), 401 (`InvalidActorError`), 400 por defecto; fallo inesperado de BD → 500 `InternalServerError` (no se oculta). Controladores usan `AuthRequest` + `toActor` sin nuevos `any`. Tests de permisos completos por rol/restaurante quedan para T15; `GET /tables/:tableId/orders` para T14.
- [x] **T14 (10 min)** ~~Conectar creación de pedidos y consulta de visita actual~~
  - Archivos: `packages/api/src/controllers/order.controller.ts`, `routes/order.routes.ts`, rutas/controladores de T13.
  - Dependencias: T11, T12, T13.
  - Comprobación: POST deriva identidad del JWT, mantiene respuesta de pedido y devuelve error explícito de sesión inválida; GET de mesa libre sin sesión devuelve lista vacía.
  - Evidencia: rojo: `npx vitest run src/routes/order src/services/table-order` (módulo `table-order.service` inexistente, 4 fallos HTTP: sesión ignorada y `GET .../orders` 404). Verde: 26/26 en `src/routes` + `table-order`; `npm test` completo verde; `tsc` sin errores nuevos. Verificado: `POST /orders` deriva `clientId` y rol del JWT (descarta `clientId` del cuerpo), responde 201 con un ítem por unidad y `tableId`/`tableNumber`/`tableSessionId`/`tableSessionEndedAt` fijados por la sesión; errores explícitos `{error,message}`: 400 `TableSessionRequiredError` y `TableSessionMismatchError` (restaurante/mesa), 403 `TableSessionForbiddenError`, 404 `TableSessionNotFoundError`, 409 `TableSessionClosedError` (sin crear pedido); el formato heredado `{error: mensaje}` de `Restaurant ID is required` no cambia; no cliente sin sesión conserva la llamada antigua. `GET /tables/:tableId/orders` (admin/manager/camarero): mesa libre sin sesión → `[]`; mesa ocupada → solo pedidos de la sesión abierta, todos los ítems (incluidos entregados) por `createdAt` ASC; mesa inexistente/otro restaurante → 404. Nota: la lectura de mesa y de pedidos son dos consultas (instantánea de la visita vigente en ese momento); la invariante de escritura de pedidos sigue protegida por la transacción de T12. `TableSessionMismatchError` (400) no figura por nombre en el contrato y debe confirmarse con los frontends.
- [x] **T15 (10 min)** ~~Cubrir permisos y aislamiento con pruebas HTTP~~
  - Archivos: `packages/api/src/routes/table.routes.test.ts`, `table-session.routes.test.ts` (nuevos).
  - Dependencias: T13, T14.
  - Comprobación: Supertest contra BD en memoria con cliente, camarero, manager, cocinero y admin; incluir otro restaurante, ids cruzados, sin JWT y evitar exposición de identidad en disponibilidad.
  - Evidencia: tarea de pruebas sobre código ya existente de T13/T14: no hubo rojo inicial (40/40 verdes en `src/routes` al escribirlas). Para comprobar que las pruebas detectan regresiones se hizo una mutación temporal (revertida, `git diff` limpio): ampliar `GET /tables/available` a personal hizo fallar 1 prueba; ampliar `DELETE` a manager/camarero NO falla porque `TableService` también exige admin (`ForbiddenRoleError` → 403): defensa en dos capas. `npm test` 23 archivos / 294 tests; Supertest con BD en memoria. Cubierto: admin/manager/camarero del restaurante leen, cambian estado y ven pedidos; solo admin crea/reemplaza/borra (manager, camarero, cocinero y cliente → 403 `{error}` sin modificar filas); cocinero y cliente sin acceso a operaciones de personal; manager/camarero de otro restaurante → 403 `ForbiddenRestaurantError` en todas las operaciones; ids cruzados entre restaurantes → 404 incluso para admin (GET, PUT, PATCH, orders y DELETE) sin efectos; token sin Bearer, inválido o mal firmado → 401 `{error}`; token firmado sin `id` → 401 `InvalidActorError`; el personal no puede usar disponibilidad/confirmación/current (403 sin sesiones creadas); disponibilidad sin `clientId`, estado ni sesión y sin mesas de otros restaurantes; la lista de mesas no expone identidad de clientes; `current` aislado por cliente y restaurante; sesiones en restaurantes distintos permitidas; un cliente no puede liberar su mesa.
- [x] **T16 (10 min)** ~~Cubrir recorrido completo e historial tras liberar o borrar~~
  - Archivos: `packages/api/src/routes/order.routes.test.ts` (nuevo), tests de repositorios de T07–T12.
  - Dependencias: T14, T15.
  - Comprobación: ocupar A, pedir, liberar con pendientes, ocupar B en la misma mesa: detalle B sin pedidos A; A sigue preparándose/entregándose y no puede pedir de nuevo. Borrado conserva pedido y sesión histórica.
  - Evidencia: tarea de pruebas de extremo a extremo sobre código de T11–T14: no hubo rojo inicial (9/9 verdes en `src/routes/order.routes.test.ts` al escribirlas; las tres pruebas de T16 repetidas 3 veces sin intermitencias). `npm test` 23 archivos / 297 tests; `tsc` sin errores nuevos. Verificado vía HTTP con BD en memoria: ocupar A → pedir (2 ítems) → liberar con pendientes → mesa sin pedidos → ocupar B (sesión distinta) → el detalle de la mesa no muestra pedidos de A y sí los de B; A sigue procesable por cocina (204) y aparece en `/orders/active` con `tableSessionEndedAt` y `tableNumber`; A no puede pedir con su sesión cerrada (409 `TableSessionClosedError`) ni con la de B (403); `/orders/mine` conserva el historial con el cierre. Borrado de mesa: 204, mesa y pedidos de mesa 404, sesión histórica conservada y cerrada, pedido e ítems conservados y consultables, `current` → null, nuevo pedido 409. Carrera HTTP: liberar mientras se piden 3 pedidos → cada pedido es 201 o 409, el nº de filas coincide con los 201 y todos son anteriores al cierre.
- [x] **T17 (10 min)** ~~Sembrar mesas y verificar entrega del backend~~
  - Archivos: `packages/api/src/scripts/seed.ts`; este plan para evidencias.
  - Dependencias: T16.
  - Comprobación: datos deterministas para mesas libres de capacidades 2/4/6, reservada y ocupada manual; nueva semilla no duplica mesas al repetirla. Ejecutar seed solo en una BD de prueba controlada. Ejecutar `npm test` y `npm exec -w @resttek/api -- tsc --noEmit -p tsconfig.json`; registrar resultados.
  - Evidencia: rojo: `npx vitest run src/scripts` falla por módulo `seed-tables` inexistente. Verde: 4/4 (BD en memoria): mesas deterministas de `rest-1` (nº 1/2/3 libres de capacidad 2/4/6, nº 4 reservada, nº 5 ocupada manual con sesión sin cliente ni grupo) y `rest-2` (3 libres); ids fijos con forma UUID; repetir no duplica ni pisa estados ni recrea mesas borradas; restaurantes inexistentes se omiten. Seed real ejecutado dos veces solo contra una BD temporal creada en el worktree (`packages/api/resttek.db`, ignorada por git y eliminada después): 8 mesas y 1 sesión abierta manual, idénticas tras la segunda ejecución. Hallazgo previo: el seed fallaba en BD nueva con `FOREIGN KEY constraint failed` porque insertaba empleados antes que restaurantes; se movió el insert de restaurantes antes de los empleados (cambio mínimo en `seed.ts`). También se corrigieron los 12 errores previos de `tsc` en `seed.ts` (`!` en índices). Resultados finales: `npm test` 24 archivos / 301 tests en verde; `npm exec -w @resttek/api -- tsc --noEmit -p tsconfig.json` exit 0 sin errores; `npx --yes @apidevtools/swagger-cli validate` válido para `tables.openapi.yaml` y `orders.openapi.yaml`. Aislamiento de transacciones verificado para una conexión SQLite en un único proceso. Pendiente (no verificado): despliegue. Revisión del bloque A (segundo agente): `npm test` 25 archivos / 307 tests y `tsc` exit 0; la confirmación del 400 `TableSessionMismatchError` queda resuelta por documentación en la sección «Errores de sesión de `POST /orders`» de este plan y en `orders.openapi.yaml`; los frontends deben consumirla al implementar T41. Tras verificar, los contratos `tables.openapi.yaml` y `orders.openapi.yaml` pasan de «PENDIENTE» a «implementado y verificado localmente (no desplegado)» y documentan `TableSessionMismatchError` (400); ambos válidos con swagger-cli y redocly lint (`--extends minimal`); no hay HTML derivado en `packages/api/docs`.

### B. Admin — agente Frontend Angular, alcance web-admin

Propiedad: `packages/web-admin/**`. No modificar API, otros frontends ni documentación general.

- [x] **T18 (10 min)** ~~Añadir modelos y servicio HTTP de mesas~~
  - Archivos: `packages/web-admin/src/app/features/tables/models/table.model.ts`, `services/table.service.ts`, `services/table.service.spec.ts` (nuevos).
  - Dependencias: T01.
  - Comprobación: HttpTestingController verifica paths con restaurante, métodos CRUD, DTOs y propagación de conflictos; sin importar tipos de otras apps.
  - Evidencia (agente admin, rama `21/gestion-mesas-admin`): contrato leído de `packages/api/docs/tables.openapi.yaml` (solo lectura, no incluido en commits). Rojo: con modelo y servicio esqueleto que lanza `not implemented`, `npm run test -w @resttek/web-admin -- --include '**/table.service.spec.ts'` → 6 de 6 tests fallan con `Error: not implemented`. Verde: tras implementar `TableService` (GET lista/uno, POST, PUT, DELETE bajo `/restaurants/:id/tables`), suite admin completa `npm run test -w @resttek/web-admin` → 5 archivos, 19 tests pasan (13 previos + 6). El 409 se propaga con `status` y cuerpo `{error,message}`. No se usa PATCH ni endpoints de otras apps.
- [x] **T19 (10 min)** ~~Añadir store de mesas aislado por restaurante~~
  - Archivos: `packages/web-admin/src/app/features/tables/store/table.store.ts`, `table.store.spec.ts` (nuevos).
  - Dependencias: T18.
  - Comprobación: signals de datos/carga/error, mutaciones tras éxito; cambiar A→B limpia A y una respuesta tardía de A no sustituye B ni su error/carga.
  - Evidencia: Rojo: con `TableStore` esqueleto vacío, `npm run test -w @resttek/web-admin -- --include '**/table.store.spec.ts'` → 9 de 9 fallan por aserciones. Verde: tras implementar (secuencia de carga, `restaurantId` actual, mutaciones aplicadas solo tras éxito y solo si el restaurante sigue siendo el actual, lista ordenada por número, errores de mutación relanzados sin tocar la lista), suite admin completa → 6 archivos, 28 tests pasan. Cubre A→B con datos/error/carga tardíos de A ignorados.
- [x] **T20 (10 min)** ~~Crear listado de mesas con estados y borrado confirmado~~
  - Archivos: `packages/web-admin/src/app/features/tables/pages/table-list/table-list.page.{ts,html,css,spec.ts}` (nuevos; clase `TableListPage`).
  - Dependencias: T19.
  - Comprobación: columnas de los cinco campos, acciones de alta/edición/borrado, estados vacío/cargando/error y aviso de cierre de ocupación/conservación de pedidos antes de borrar.
  - Ajuste de nomenclatura: el plan original decía `table-list.component.*`; por ser una pantalla asociada a una ruta se usa la convención de pages (`*.page.*`, clase `*Page`) de las instrucciones del agente frontend. Lo mismo aplica a `table-form` (T21/T22). No se renombran pantallas existentes.
  - Evidencia: Rojo: con `TableListPage` vacía, `--include '**/table-list.page.spec.ts'` → 9 de 9 fallan por aserciones (no carga, sin columnas/enlaces/estados, sin botón de borrar). Verde: tras implementar página, plantilla y estilos, suite admin completa → 7 archivos, 37 tests pasan. Verificado con DOM real y rutas (`RouterTestingHarness`): carga del restaurante de la ruta, columnas Número/Descripción/Capacidad/Estado, filas con Libre/Ocupada/Reservada, enlaces `/restaurants/rest-1/tables/new` y `.../t1/edit`, botón borrar, spinner, error, vacío, `confirm` con aviso de cierre de ocupación y conservación de pedidos, cancelar no llama a la API, confirmar llama `delete('rest-1','t1')`, fallo mantiene la fila y muestra error.
- [x] **T21 (10 min)** ~~Crear formulario de alta con validación de campos~~
  - Archivos: `packages/web-admin/src/app/features/tables/pages/table-form/table-form.page.{ts,html,css,spec.ts}` (nuevos; clase `TableFormPage`, ver ajuste de nomenclatura en T20).
  - Dependencias: T19.
  - Comprobación: entero positivo para número/capacidad, descripción y selector de tres estados; envío bloqueado mientras inválido o guardando; mostrar conflicto de número.
  - Evidencia: Rojo: con `TableFormPage` vacía, `--include '**/table-form.page.spec.ts'` → 12 de 12 fallan (no existen campos, botón ni mensajes). Verde: con formulario reactivo y validador de entero positivo, suite admin completa → 8 archivos, 49 tests pasan. Verificado: campos número/descripción/capacidad y selector con exactamente `libre/ocupada/reservada` (por defecto libre); botón deshabilitado y sin llamada al store con formulario inválido; 0, -1 y 1.5 rechazados en número y capacidad con mensaje; descripción vacía admitida; alta envía `create('rest-1', {number:3, description:'', capacity:4, status:'reservada'})` y vuelve a `/restaurants/rest-1/tables`; segundo envío bloqueado mientras guarda («Guardando...»); 409 muestra «Ya existe una mesa con ese número…» y permite reintentar; otros errores muestran mensaje genérico. La edición se añade en T22.
- [x] **T22 (10 min)** ~~Completar edición y errores de cambios de estado/capacidad~~
  - Archivos: formulario de T21 y sus tests.
  - Dependencias: T21.
  - Comprobación: precarga, guardar conserva id/restaurante, error de capacidad o recurso borrado visible; liberar mesa ocupada advierte que puede haber pedidos pendientes y no los elimina.
  - Evidencia: Rojo: ampliado `table-form.page.spec.ts` con 10 tests de edición; `--include '**/table-form.page.spec.ts'` → 10 fallan y los 12 de alta siguen pasando (la página aún no cargaba ni actualizaba). Verde: tras añadir carga por `TableService.getById`, `store.update` y avisos, suite admin completa → 8 archivos, 59 tests pasan. Verificado: precarga de los cuatro campos (incluido estado), título «Editar mesa», guardar llama `update('rest-1','t1',{…})` sin `create` y vuelve al listado, 409 de capacidad («La capacidad no puede ser menor…»), 409 de número duplicado, 404 al guardar o cargar («La mesa ya no existe o fue borrada…») con guardado bloqueado si falla la carga, `confirm` al pasar ocupada→libre/reservada con «pedidos pendientes… no se eliminan», cancelar no guarda, aceptar guarda, y sin aviso si sigue ocupada o no estaba ocupada. Nota: los nombres de error de la API están marcados «propuestos» en el contrato; la clasificación 409 se apoya en el texto `capacity`/`number` y, si no lo reconoce, muestra un mensaje que cubre ambas causas.
- [x] **T23 (10 min)** ~~Conectar rutas, dashboard y menú lateral solo para admin~~
  - Archivos: `packages/web-admin/src/app/features/tables/tables.routes.ts` (nuevo), `app.routes.ts`, `app.config.ts` (icono), `core/auth/admin.guard.ts` (nuevo, local de admin), `core/layout/shell.component.html`, dashboard del restaurante; tests nuevos `admin.guard.spec.ts`, `tables.routes.spec.ts`, `shell.component.spec.ts`, `restaurant-dashboard.component.spec.ts`.
  - Dependencias: T20, T22.
  - Comprobación: acceso desde restaurante al listado/nuevo/editar; guard específico de admin en rutas de mesas, no solo ocultar enlaces; manager no obtiene CRUD entrando URL directa. No cambiar permisos de features ajenas.
  - Evidencia: Rojo: con guard que devolvía `true` y `TABLE_ROUTES` vacío, `npm run test -w @resttek/web-admin` → 16 tests nuevos fallan (rutas sin definir, guard sin redirección, sin enlace/tarjeta Mesas); los de «manager no ve el enlace» ya pasaban porque el comportamiento previo no mostraba nada. Verde: tras implementar `adminGuard` (admin pasa; no autenticado → `/login`; resto → `/restaurants/:id/dashboard` o `/dashboard`), `TABLE_ROUTES` (`''`, `new`, `:id/edit`), ruta `restaurants/:restaurantId/tables` con `canActivate: [adminGuard]` y `loadChildren`, enlace «Mesas» en el menú lateral y tarjeta en el dashboard solo para admin, suite admin completa → 12 archivos, 79 tests pasan. Verificado con navegación real del router: admin entra a `/restaurants/rest-1/tables`, `/new` y `/t1/edit`; un manager por URL directa a las tres es redirigido a `/restaurants/rest-1/dashboard`. Las rutas y permisos de platos, ingredientes y empleados no se modificaron. Icono `LayoutGrid` registrado en `app.config.ts`.
- [x] **T24 (10 min)** ~~Probar navegación entre restaurantes y errores de CRUD~~
  - Archivos: tests del store, listado, formulario y rutas de mesas (`tables.navigation.spec.ts` nuevo) y `table-form.page.{ts,html}`.
  - Dependencias: T23.
  - Comprobación: navegar A→B con componente reutilizado actualiza listado y rutas de acciones; fallo HTTP no borra fila ni notifica éxito; cancelar confirmación no llama al servidor.
  - Evidencia: Rojo: `tables.navigation.spec.ts` (8 tests con store y HTTP reales, `HttpTestingController`) → 7 pasan y 1 falla: el formulario de edición no recargaba al pasar de restaurante/mesa A a B (defecto real: `TableFormPage` leía `restaurantId` e `id` del snapshot y la page se reutiliza). Verde: `restaurantId`, `tableId`, `isEditing`, `pageTitle` y `listUrl` pasan a signals/computed reactivos a `paramMap` (padre e hija), con descarte de cargas/envíos obsoletos; suite admin completa → 13 archivos, 87 tests pasan. Verificado: listado A→B recarga contra B, respuesta tardía de A ignorada, fallo HTTP al borrar mantiene la fila, borrado correcto, cancelar `confirm` no llama a la API, error de carga y 409 al guardar visibles.
- [x] **T25 (5 min)** ~~Validar el paquete admin y registrar evidencia~~
  - Archivos: este plan.
  - Dependencias: T17, T24.
  - Comprobación: `npm run test -w @resttek/web-admin` y `npm run build -w @resttek/web-admin`; prueba manual CRUD con API real, incluidos número duplicado y capacidad insuficiente durante ocupación.
  - Evidencia (agente admin): revisión T18–T24 contra `git show 21/gestion-mesas:packages/api/docs/tables.openapi.yaml`: paths (`/api/v1/restaurants/:id/tables[/:tableId]`), métodos (GET/POST/PUT/DELETE; PATCH de estado no usado por admin), DTOs (`CreateTableDto`, `UpdateTableDto` con los cuatro campos obligatorios) y `Mesa` coinciden; el mapeo de 409 del formulario se basa en `error`/`message` (`TableNumberConflictError`, `TableCapacityConflictError`) y 404 (`TableNotFoundError`) y es correcto; no hubo que corregir código. `npm run test -w @resttek/web-admin` → 13 archivos, 87 tests pasan; `npm run build -w @resttek/web-admin` → exit 0. Prueba contra API real SIN navegador: API de `21/gestion-mesas` (commit 9cc7205) en worktree desacoplado temporal con BD propia y `npm run seed`, `PORT=3011`; script curl (`login` admin/gerente1/cliente1) que reproduce las peticiones exactas de `TableService` (no se arrancó `ng serve`; no se probó en navegador). Resultados: POST alta → 201 (id nuevo, `activeSessionId` null); POST número duplicado → 409 `TableNumberConflictError`; PUT edición (número 50, capacidad 6, estado reservada→libre) → 200 con el mismo id; cliente1 ocupa la mesa con `partySize` 5 (POST `table-sessions` → 201); PUT capacidad 3 → 409 `TableCapacityConflictError` y la mesa queda intacta; PUT capacidad 5 → 200; manager POST → 403; DELETE de mesa ocupada por cliente → 204; GET/DELETE/PUT de la mesa borrada → 404 `TableNotFoundError`; el número 50 se reutiliza tras el borrado (201). Worktree temporal y proceso API eliminados. Limitación: la UI (cargas, mensajes) solo está cubierta por tests de componente con HTTP simulado.

### C. Empleados — agente Frontend Angular, alcance web-empleados

Propiedad: `packages/web-empleados/**`. Mantener intacta la matriz de acceso existente a cocina/barra/salón.

> **Estado (2026-10-29):** la excepción «sin tests» queda superada. Se añadió infraestructura de pruebas a web-empleados (target `test` con vitest, igual que web-admin; commit `build(web-empleados)`), y cada tarea se verifica con specs. No se integró `1/control-acceso-por-rol-web-empleados` (que no existe en esta base): el acceso al salón usa `core/auth/salon-access.ts` (ver T32); cocina/barra no se tocaron.

- [x] **T26 (10 min)** ~~Añadir modelos y servicio de mesas, estado y pedidos de visita~~
  - Archivos: `packages/web-empleados/src/app/features/tables/models/table.model.ts`, `services/table.service.ts`, `services/table.service.spec.ts` (nuevos); `features/orders/models/order.model.ts`.
  - Dependencias: T01, T02.
  - Comprobación: tests de HTTP verifican consulta, PATCH y pedidos de sesión actual; campos opcionales históricos compatibles.
  - Evidencia: specs `table.service.spec.ts` (3 casos HTTP: GET mesas, PATCH `/status` con `{status}`, GET `/tables/:id/orders`; campo histórico opcional). Rojo comprobado: cambiar `patch` por `put` en el servicio hace fallar el spec; con el servicio real pasa. `npm run test -w @resttek/web-empleados` verde.
- [x] **T27 (10 min)** ~~Añadir store de mesas con refresco y cancelación de ciclo~~
  - Archivos: `packages/web-empleados/src/app/features/tables/store/table.store.ts`, `table.store.spec.ts` (nuevos).
  - Dependencias: T26.
  - Comprobación: carga inicial y polling de 30 s, un único intervalo, limpieza al destruir/cambiar restaurante; respuestas tardías descartadas, errores visibles sin falsos éxitos.
  - Evidencia: `table.store.spec.ts` (14 casos, fake timers): carga inicial, polling 30 s con un único intervalo (también tras reiniciar), `stopPolling`, respuesta tardía de otro restaurante descartada, error visible sin vaciar mesas, PATCH sin actualizar antes del éxito, doble envío bloqueado, error de servidor, detalle por mesa/sesión (tardías descartadas, última petición gana, liberar limpia). Mutaciones que hacen fallar el spec: quitar la generación al cargar, no limpiar el intervalo, quitar el bloqueo de doble envío, quitar el contador de petición de detalle. `npm run test -w @resttek/web-empleados` verde (23 tests).
- [x] **T28 (10 min)** ~~Mostrar en salón todas las mesas con sus estados~~
  - Archivos: `packages/web-empleados/src/app/features/orders/pages/salon/salon.component.{ts,html,css}`, `salon.component.spec.ts` (nuevo); componente presentacional de mesa dentro de `features/tables/` si se reutiliza.
  - Dependencias: T27.
  - Comprobación: libre/ocupada/reservada distinguibles con texto, número y capacidad; mesa ocupada sin pedidos muestra ese caso, no desaparece.
  - Evidencia: `salon.component.spec.ts` (bloque T28): renderiza todas las mesas con «Mesa N», «Capacidad: N» y estado en texto (libre/ocupada/reservada), mesa ocupada sin pedidos visible, cargando/error/vacío explícitos, polling con restaurante del JWT y parada al destruir. Mutaciones comprobadas (no confirmar, quitar `disabled`, quitar etiqueta, quitar guarda de admin) hacen fallar el spec. Nota: salón, `TableOrdersComponent`, `table-label` y cambios de `OrderStore` van en este commit porque el salón los importa.
- [x] **T29 (10 min)** ~~Incorporar cambio de estado con confirmación y errores~~
  - Archivos: salón y store de mesas con tests.
  - Dependencias: T28.
  - Comprobación: tres estados, confirmación al cerrar ocupación, bloquear doble envío; liberar con pedidos pendientes permitido y advertido; mostrar errores del servidor y no actualizar antes del éxito.
  - Evidencia: `salon.component.spec.ts` (bloque T29) + `table.store.spec.ts`: tres botones de estado con el actual marcado; `confirm` solo al cerrar ocupación (cancelar no llama al store); liberar con pendientes permitido, advertido y sin llamar a `updateItemStatus`; no actúa si mismo estado o mesa en actualización (botones `disabled`); PATCH sin actualizar antes del éxito, error del servidor visible. Limitación: el aviso de pendientes solo cuenta ítems si el detalle de esa mesa está abierto.
- [x] **T30 (10 min)** ~~Añadir detalle de pedidos exclusivamente de la visita actual~~
  - Archivos: salón; `features/tables/components/table-orders/` (nuevo) y sus tests.
  - Dependencias: T28.
  - Comprobación: mostrar estados de todos los ítems incluidos entregados, distinguir pedidos múltiples y refrescar detalle; cambio de sesión/mesa descarta respuesta tardía y borra detalle anterior.
  - Evidencia: `table-orders.component.spec.ts` (pedidos separados «Pedido 1/2», todos los ítems incluidos entregados, vacío/cargando/error), bloque T30 de `salon.component.spec.ts` (ver pedidos solo en ocupadas, mesa sin visita) y `table.store.spec.ts` (cambio de mesa/sesión borra detalle y descarta respuesta tardía; última petición gana). El detalle usa solo `GET .../tables/:id/orders` (visita actual).
- [x] **T31 (10 min)** ~~Mantener entregas y visibilidad de pedidos de visitas cerradas~~
  - Archivos: salón, `features/orders/models/order.model.ts`, modelos/templates de barra y cocina para etiquetas de mesa cuando proceda; tests de filtros.
  - Dependencias: T02, T29, T30.
  - Comprobación: sigue existiendo panel de ítems `listo` y acción entregar; pendientes antiguos siguen en cocina/barra, sin mezclarse con nueva visita; usar número visible en lugar de UUID cuando esté disponible, fallback para pedidos antiguos.
  - Evidencia: `cocina.component.spec.ts` y `barra.component.spec.ts` (número visible `tableNumber` en lugar de UUID, «Visita cerrada» solo con `tableSessionEndedAt`, fallback a `tableId` en pedidos históricos, sin etiqueta sin mesa), `table-label.spec.ts`, bloque T31 de `salon.component.spec.ts` (panel solo con ítems `listo` y acción entregar llama a `updateItemStatus(..., 'entregado')`) y `order.store.spec.ts` (sin intervalos duplicados, respuesta tardía descartada). Mutación comprobada: usar `order.tableId` en cocina hace fallar el spec. Los pedidos pendientes de visitas cerradas siguen en cocina/barra porque el filtro por estado/categoría no cambió.
- [x] **T32 (10 min)** ~~Resolver restaurante de admin sin ampliar acceso a cocina~~
  - Archivos: salón, servicio de restaurantes local nuevo en `features/tables/services/`, tests; reutilizar guards existentes sin ampliar su matriz.
  - Dependencias: T28.
  - Comprobación: camarero/manager usan restaurante del JWT y no pueden seleccionar otro; admin sin asignación elige restaurante; cambio reinicia polling/detalle de mesas y pedidos; cocinero sigue sin salón.
  - Evidencia: En esta base no existen los guards de `1/control-acceso-por-rol-web-empleados` (rama no integrada), así que se añadió `core/auth/salon-access.ts` (solo salón: camarero/manager/admin; cocinero redirigido a `/`). No se modificó la matriz de cocina/barra ni el menú de cocinero/camarero/manager; el único cambio de permisos es que admin entra a Salón (necesario por la API: admin opera mesas) y no ve cocina/barra. Al integrar esa rama habrá que unificar `salonGuard` con `employeeRoleGuard` (conflicto previsible en `app.routes.ts` y shell). Specs: `salon-access.spec.ts`, `app.routes.spec.ts` (solo salón con guarda; raíz→salón solo admin), `shell.component.spec.ts` (menús previos intactos; admin solo Salón; cocinero/camarero sin restaurante bloqueados), bloque T32 de `salon.component.spec.ts` (camarero/manager usan JWT y no pueden elegir; admin sin restaurante elige, cambio reinicia polling y limpia mesas/pedidos).
- [x] **T33 (10 min)** ~~Verificar empleados y transiciones con API real~~
  - Archivos: specs de mesas/salón y este plan.
  - Dependencias: T17, T31, T32.
  - Comprobación: `npm run test -w @resttek/web-empleados` y `npm run build -w @resttek/web-empleados`; pruebas manuales de estados y pedido mixto comida/bebida conservando cocina/barra/entrega.
  - Evidencia: `npm run test -w @resttek/web-empleados`: 11 archivos, 60 tests verdes. `npm run build -w @resttek/web-empleados` correcto. API real: worktree desacoplado de `21/gestion-mesas` (8dad5f6), `npm run seed`, `PORT=3012`; script Python con las peticiones exactas del servicio: listar mesas 200; PATCH de estado en ocupada→ocupada→reservada→libre (200) y ocupada→libre con pendiente (200); `GET /restaurants/:id/tables/:tableId/orders` con la visita actual; pedido mixto (principal + bebida, creado por cliente con sesión propia) visible en `GET /orders/active` con ambos ítems (cocina filtra no-bebida, barra bebida), preparando→listo→entregado por ítem (204), y tras liberar la mesa sigue activo y entregable con `tableSessionEndedAt`. NO se usó navegador: no se probó la interfaz renderizada contra la API; solo las peticiones del servicio y specs de componentes. API y worktree temporal detenidos y eliminados.

### D. Clientes — agente Frontend Angular, alcance web-clientes

Propiedad: `packages/web-clientes/**`; solo este agente modifica dependencias/configuración de tests de ese paquete. No importar código de admin/empleados.

- [x] **T34 (10 min)** ~~Habilitar pruebas unitarias usando el patrón Angular del monorepo~~
  - Archivos: `packages/web-clientes/package.json`, `angular.json`, `tsconfig.spec.json` (nuevo); `package-lock.json` en raíz.
  - Dependencias: ninguna.
  - Comprobación: script `test` y target `@angular/build:unit-test` con Vitest; añadir únicamente dependencias de pruebas necesarias, compatibles con el paquete. Tras editar manifiesto ejecutar `npm install` desde raíz; smoke test rojo/verde ejecutable. El comando de tests de clientes pasa a existir en este paso.
  - Evidencia: rojo: `npm run test -w @resttek/web-clientes` con `smoke.spec.ts` falló por `Missing script: "test"`. Verde: añadidos script `test`, target `@angular/build:unit-test` (Vitest) y devDependencies `vitest`/`jsdom` con las mismas versiones que web-admin; `tsconfig.spec.json` ya existía con `vitest/globals`. Tras `npm install`, 1 test pasa.
- [x] **T35 (10 min)** ~~Añadir tipos y servicio HTTP de disponibilidad/ocupación~~
  - Archivos: `packages/web-clientes/src/app/core/models/table.model.ts`, `services/table.service.ts`, `services/table.service.spec.ts` (nuevos).
  - Dependencias: T01, T34.
  - Comprobación: GET con grupo, POST solo al continuar, GET current con sesión o null, errores 409 propagados; nunca enviar clientId.
  - Evidencia: contrato `tables.openapi.yaml` (propuesto, aún no implementado en la API; solo lectura, no incluido en commits frontend). Rojo: `table.service.spec.ts` no compilaba al no existir `TableService`. Verde: `npm run test -w @resttek/web-clientes` 9 tests; cubre GET con `partySize`, POST solo `{tableId, partySize}` (sin `clientId`), 201 y 200 idempotente, `current` con sesión, literal `null`/cuerpo sin sesión → `null`, 409 propagado con su cuerpo.
- [x] **T36 (10 min)** ~~Mantener y recuperar contexto de ocupación desde servidor~~
  - Archivos: `packages/web-clientes/src/app/core/store/table-session.store.ts`, `table-session.store.spec.ts` (nuevos).
  - Dependencias: T35.
  - Comprobación: signals de sesión/mesa/carga/error, recuperación por restaurante, no mezclar respuestas A/B; recarga reconstruye desde API sin confiar en datos locales. Salir/cambiar restaurante no llama a liberar.
  - Evidencia: rojo: specs no compilaban (`api-error` y `table-session.store` inexistentes). Verde: 30 tests. `TableSessionStore` (solo memoria, sin persistencia) expone `occupation/session/table/sessionId/partySize/loading/error`, `load()` descarta respuestas y errores de peticiones superadas (A/B), cambiar de restaurante descarta la ocupación anterior, la ocupación se oculta si cambia el usuario y no existe operación de liberación. Se añade `core/models/api-error.ts` (+spec) para tratar ambos formatos de error (`{error,message}` y `{error}` heredado) y los códigos de sesión/mesa explícitamente. Incertidumbre documentada: el contrato marca como "a confirmar" el formato exacto del 400 por sesión ausente; el parser admite ambos formatos y reconoce los mensajes literales conocidos.
- [x] **T37 (10 min)** ~~Crear paso de número de personas y listado elegible~~
  - Archivos: `packages/web-clientes/src/app/features/tables/table-selection.page.{ts,html,css,spec.ts}` (nuevos). Es una pantalla asociada a ruta: se nombra `TableSelectionPage` / `*.page.*` según la convención de pages (corrige el sufijo `.component` del plan original).
  - Dependencias: T35, T36.
  - Comprobación: grupo entero positivo obligatorio, mesas suficientes, lista vacía/carga/error; cambiar grupo invalida selección anterior y descarta respuestas tardías de otra cantidad.
  - Evidencia: rojo: el spec de la page no compilaba (page inexistente). Verde: 46 tests; grupo `''`, `0`, `-1`, `2.5`, `abc`, `1e2` rechazado sin llamar a la API; listado, carga, vacío y error con reintento; seleccionar no llama a ocupar; cambiar grupo borra lista/selección y descarta respuestas tardías (también si no se vuelve a buscar). Si ya hay ocupación propia se muestra su mesa con acceso a la carta en lugar del formulario. La ruta se registra en T39.
- [x] **T38 (10 min)** ~~Confirmar ocupación y tratar conflictos sin navegar~~
  - Archivos: selección de T37 y sus tests.
  - Dependencias: T37.
  - Comprobación: seleccionar no muta estado; continuar sin selección bloqueado; una petición mientras guarda; 201/200 guarda sesión y navega a carta, 409 muestra aviso y refresca/reconcilia sin elegir otra mesa automáticamente.
  - Evidencia: rojo: `confirm`/`saving` inexistentes (errores TS2339 en el spec). Verde: 53 tests; continuar bloqueado sin selección, 201/200 guardan sesión y navegan a `/restaurants/:id`, doble clic = una sola petición, 409 (formato nuevo y heredado) avisa sin navegar, reconcilia con `GET current` y refresca la lista sin elegir mesa; `ActiveTableSessionExistsError` muestra la sesión existente; fallo de red conserva la selección para reintentar.
- [x] **T39 (10 min)** ~~Conectar listado, rutas y acceso directo a carta~~
  - Archivos: `packages/web-clientes/src/app/app.routes.ts`, `features/restaurants/restaurant-list.component.ts`, `core/guards/table-session.guard.ts` (nuevo), specs de rutas/guard.
  - Dependencias: T38.
  - Comprobación: restaurante lleva a `restaurants/:id/tables`; conservar carta en `restaurants/:id`; guard consulta sesión propia y redirige al paso de mesas si no existe, sin bucles. Con sesión existente volver al restaurante permite continuar a su carta sin ocupar de nuevo.
  - Evidencia: rojo: specs de guard/rutas/listado no compilaban (guard inexistente). Verde: 61 tests; `tableSessionGuard` consulta siempre al servidor (true con sesión, `UrlTree` a `/restaurants/:id/tables` con `null` o error), `restaurants/:id/tables` carga `TableSelectionPage` sin guard (sin bucles), `restaurants/:id` conserva la carta con guard, el listado enlaza a `/restaurants/:id/tables`. Con sesión existente, la page de mesas ofrece continuar a la carta sin ocupar de nuevo (T38).
- [x] **T40 (10 min)** ~~Vincular carrito y carta a la ocupación activa~~
  - Archivos: `packages/web-clientes/src/app/core/store/cart.store.ts`, `cart.store.spec.ts` (nuevo), `features/menu/restaurant-menu.component.ts`, `features/cart/cart.component.ts`.
  - Dependencias: T36, T39.
  - Comprobación: mostrar número y grupo; carrito vinculado a restaurante y sessionId; al cambiar de visita no reutiliza productos de la anterior, aunque sea el mismo restaurante. Vaciar carrito tras pedido no borra la sesión.
  - Evidencia: rojo: `cart.store.spec.ts` no compilaba (`bindSession`/`reset`/`sessionId` inexistentes). Verde: 73 tests; `CartStore.bindSession` vincula restaurante+sesión y vacía productos si cambia la sesión (misma mesa/restaurante incluida) o el restaurante; `clear()` conserva la vinculación; `reset()` la descarta; la carta muestra `Mesa N · X personas` y vincula el carrito al abrirse. La presentación de mesa/grupo en `cart.component.ts` se añade en T41 junto a sus tests.
- [x] **T41 (10 min)** ~~Enviar pedido con mesa/sesión y manejar sesión cerrada~~
  - Archivos: `packages/web-clientes/src/app/core/services/order.service.ts`, `core/models/order.model.ts`, `features/cart/cart.component.ts`, specs nuevos.
  - Dependencias: T02, T40.
  - Comprobación: payload lleva ids correctos y sin clientId; éxito conserva navegación a pedido; error de sesión comunica el motivo y devuelve al flujo de selección sin enviar automáticamente el carrito a otra mesa; fallo de red conserva productos para reintento.
  - Evidencia: rojo: specs de `OrderService`/carrito no compilaban (firma `createOrder` antigua). Verde: 88 tests; payload `{restaurantId, tableId, tableSessionId, items}` sin `clientId`; éxito conserva `/orders/:id`; doble clic = un envío; `TableSessionRequired/Forbidden/NotFound/ClosedError` (formato nuevo y mensaje heredado) comunican el motivo, limpian la ocupación local, `reset()` del carrito y navegan a `/restaurants/:id/tables` (aviso por `history.state`, mostrado por la page) sin reenviar; fallo de red/otros errores conservan productos y permiten reintentar; el modelo `Order` tolera ausencia/null de `tableSessionId`, `tableNumber`, `tableSessionEndedAt`. Incertidumbre real documentada: el contrato de pedidos marca "a confirmar" el formato del 400 y los 403/404/409 de sesión siguen PENDIENTES de implementar en la API; un 403/404 sin código de sesión reconocible (p. ej. `{error:'Forbidden: ...'}` del middleware) se trata como error genérico y conserva el carrito.
- [x] **T42 (10 min)** ~~Revalidar ocupación al volver y mantener pedidos históricos~~
  - Archivos: store/guard de sesión, carta/carrito y sus tests; `features/orders/my-orders.component.ts`, `order-detail.component.ts` solo si requieren presentación de mesa.
  - Dependencias: T41.
  - Comprobación: volver/recargar con sesión abierta recupera la misma; liberada o borrada no permite añadir/enviar usando contexto obsoleto; logout/otro usuario no hereda contexto local. Mis pedidos y detalle siguen mostrando pedidos previos.
  - Evidencia: rojo: specs no compilaban (`TableSessionStore.revalidate` inexistente). Verde: 108 tests. `revalidate()` devuelve `valid`/`closed`/`unknown` (null u otra sesión = closed; error de red = unknown, el servidor valida al enviar). Carrito (al abrirse y al volver a la pestaña) y carta (al volver a la pestaña) reconsultan al servidor; con `closed` hacen `clear`+`reset` y vuelven a selección con aviso; `addToCart` sin ocupación vigente no añade. `CartStore` se vacía al hacer logout o cambiar de usuario (effect sobre `AuthStore.user().id`, sin reset en la primera ejecución). Mis pedidos y detalle muestran `Mesa N` y `Ocupación anterior` (si `tableSessionEndedAt`), y siguen mostrando pedidos históricos sin esos campos o con null. No verificado en navegador: el comportamiento real de `visibilitychange` solo está cubierto con eventos simulados en jsdom.
- [x] **T43 (10 min)** ~~Cubrir recorrido de selección, doble clic y visita nueva~~
  - Archivos: specs de selección, guard, sesión y carrito.
  - Dependencias: T42.
  - Comprobación: escenarios de capacidad exacta/sobrante, 0/decimal, ausencia de mesas, dos clientes compitiendo, doble clic y segunda visita sin carrito de la primera.
  - Evidencia: tarea de cobertura: no hay rojo porque T36–T42 ya implementaban el comportamiento; se añadieron tests que pasan desde el inicio (112 tests en total). Nuevo `features/tables/table-visit-flow.spec.ts`: capacidad exacta, capacidad sobrante, ausencia de mesas (sin continuar) y segunda visita sin carrito de la primera. Ya cubiertos en specs previos: grupo `''`/`0`/`-1`/`2.5`/`abc`/`1e2` (page), dos clientes compitiendo = 409 mesa no disponible o sesión activa (T38), doble clic = una llamada.
- [x] **T44 (5 min)** ~~Validar clientes con el backend integrado~~
  - Archivos: este plan.
  - Dependencias: T17, T43.
  - Comprobación: `npm run test -w @resttek/web-clientes` (disponible tras T34), `npm run build -w @resttek/web-clientes`; navegador con recarga y retorno desde otro restaurante confirma recuperación sin liberación automática.
  - Evidencia: `npm run test -w @resttek/web-clientes` 113/113 en 15 ficheros y `npm run build -w @resttek/web-clientes` correcto. Desajuste hallado y corregido con TDD (rojo: caso `TableSessionMismatchError` no navegaba): el 400 `TableSessionMismatchError` de `POST /orders` (sesión incoherente con restaurante/mesa) se trataba como error genérico; ahora se trata como sesión no válida (aviso, `clear` + `reset`, vuelta a selección). Servicio, store, guard y paths/cuerpos coinciden con `tables.openapi.yaml` y `orders.openapi.yaml` de `21/gestion-mesas` (disponibilidad `GET .../tables/available?partySize=`, `POST .../table-sessions` `{tableId, partySize}`, `GET .../table-sessions/current` con literal `null`).
  - Validación con API real SIN NAVEGADOR: API de `21/gestion-mesas` (commit 9cc7205) en un worktree desacoplado temporal, BD propia con `npm run seed`, puerto 3013 (worktree y proceso retirados al acabar). Se reprodujo con un script Python (urllib) la secuencia de peticiones que hace el cliente, con JWT reales de cliente1/cliente2/camarero1: current inicial 200 `null`; disponibilidad grupo 2 (200, sin ocupar al repetir; `0`, `2.5`, `abc` -> 400 `InvalidPartySizeError`); ocupar 201; reintento mismo cliente/mesa/grupo 200 con la misma sesión; otro cliente misma mesa 409 `TableNotAvailableError`; mismo cliente otra mesa 409 `ActiveTableSessionExistsError`; "recarga" (current devuelve la sesión); la mesa deja de listarse; current en otro restaurante `null` y al volver a R1 la misma sesión sin liberar; cliente2 no ve la sesión ajena (`null`); pedido con sesión 201; sin sesión 400 `TableSessionRequiredError`; sesión ajena 403 `TableSessionForbiddenError`; inexistente 404 `TableSessionNotFoundError`; restaurante o mesa incoherentes 400 `TableSessionMismatchError`; camarero libera -> pedido 409 `TableSessionClosedError`, current `null`, el pedido previo sigue en `/orders/mine` con `tableNumber` y `tableSessionEndedAt`; nueva visita en la misma mesa 201 con sesión distinta. Todos con cuerpo `{error, message}` coincidente con el parseo del cliente.
  - NO verificado: navegador real (recarga, retorno desde otro restaurante, `visibilitychange` real); solo cubierto por specs jsdom y por las peticiones HTTP reproducidas. Nota de diseño: ante errores de sesión el carrito se vacía (`reset`) para no reenviarlo a otra mesa (T41/CA15); el 400 heredado `Restaurant ID is required` y los fallos de red/500 conservan los productos.

### E. Integración y documentación — agente coordinador

Propiedad: documentación general y seguimiento final. No utilizar esta fase para ocultar tareas de implementación incompletas.

> **Integración (2026-10-30).** Fusionadas en `21/gestion-mesas`: `master` (control de acceso por rol de web-empleados, OpenAPI de platos/empleados/ingredientes y corrección de `seed.ts`), `21/gestion-mesas-admin`, `21/gestion-mesas-clientes` y `21/gestion-mesas-empleados`, con un merge por rama.
> - `seed.ts`: master y la API corrigieron por separado el orden restaurantes→empleados y quedaron los restaurantes insertados dos veces; se elimina el duplicado (`fix(api)`). Seed ejecutado dos veces en una BD temporal (eliminada después): 2 restaurantes, 8 mesas y 1 sesión abierta, sin duplicados.
> - Control de acceso de web-empleados: se elimina `core/auth/salon-access.ts` (`salonGuard`/`canAccessSalon`) del bloque C y salón usa el `employeeRoleGuard`/`canAccessView` de master, cuya matriz ya excluye a cocinero. Rutas, `app.routes.spec.ts` y `shell.component.spec.ts` toman la versión de master. Del bloque C se conserva `canEnter` en el shell (admin sin restaurante entra para elegirlo en salón), cubierto con un caso nuevo en `shell.component.spec.ts`. Cambio de comportamiento respecto al bloque C: admin ve cocina, barra y salón según la matriz de master (sin restaurante, cocina y barra no cargan pedidos), no solo salón; y la raíz redirige según `getInitialRoute`. Lo anotado en T32 y en la evidencia de CA09 sobre `salonGuard` y «admin solo salón» queda sustituido por esto.
> - Plan: se unifican las cuatro copias; la base es la de la API y se toman los bloques B, C y D y las evidencias de CA de cada rama.
> - Validación tras integrar: `npm test` 25 archivos / 307 tests; `tsc --noEmit` exit 0; web-admin 87 tests y build OK; web-empleados 135 tests (60 de mesas + los de control de acceso de master) y build OK; web-clientes 113 tests y build OK. Sin navegador.

- [ ] **T45 (10 min)** Actualizar modelo de datos, glosario y arquitectura de API
  - Archivos: `docs/dominio/modelo-datos.md`, `docs/dominio/glosario.md`, `docs/arquitectura/arquitectura-api.md`.
  - Dependencias: T17.
  - Comprobación: ER incluye mesas/sesiones y relación con pedidos, borrado lógico, transiciones y migración sin borrar BD; enlazar OpenAPI, no duplicarlo.
- [ ] **T46 (10 min)** Documentar recorrido y organización frontend por aplicación
  - Archivos: `README.md`, `docs/arquitectura/arquitectura-frontend.md`.
  - Dependencias: T25, T33, T44.
  - Comprobación: guía admin CRUD, cliente grupo→mesa→carta, salón/visitas, pruebas por workspace; explicar reserva manual, recuperación y pedidos pendientes al liberar.
- [ ] **T47 (10 min)** Ejecutar aceptación cruzada y cerrar evidencias del plan
  - Archivos: este plan; sin cambios de código previstos.
  - Dependencias: T45, T46.
  - Comprobación: recorrer CA01–CA18 con API y tres apps en navegador, registrar resultados y capturas si útiles; verificar tareas/commits y avisar por Slack solo si todo está comprobado.

### Orden de entrega y coordinación

1. API publica T01–T02 como contrato. Admin puede empezar T18, empleados T26 y clientes T35 cuando ese contrato esté estable; T34 es independiente.
2. Cada agente trabaja solo su bloque y usa mocks del contrato mientras falta backend. Integración real de las apps depende de T17.
3. El agente de API es dueño de OpenAPI; cualquier cambio de contrato debe registrarse y comunicarse antes de modificar consumidores.
4. Evitar cambios concurrentes del mismo archivo: el coordinador integra actualizaciones de este plan y documentación general; clientes es dueño del único cambio previsto a `package-lock.json`.
5. Si se ejecutan agentes en paralelo, el coordinador gestiona worktrees derivados e integración en la rama de tarea; no permitir escrituras/commits simultáneos sobre el mismo checkout. Antes de empezar, seguir las reglas de `implement-plan` sobre el worktree de tarea.
6. No hace falta modificar `web-shared` para este alcance: los servicios/DTOs locales siguen los patrones existentes; una futura extracción compartida requeriría justificarla, no importar desde otra app.

### Errores de sesión de `POST /orders` (contrato para los frontends)

Registrados en `packages/api/docs/orders.openapi.yaml` y cubiertos por `order.routes.test.ts` (T14). Cuerpo `{error: <Clase>, message}`, sin pedido creado, solo para rol `cliente`:

| Situación | HTTP | `error` | `message` |
| --- | --- | --- | --- |
| Sin `tableSessionId` | 400 | `TableSessionRequiredError` | A table session is required to place an order |
| `tableSessionId` inexistente | 404 | `TableSessionNotFoundError` | Table session not found |
| Sesión de otro cliente | 403 | `TableSessionForbiddenError` | The table session does not belong to the client |
| `restaurantId` o `tableId` no coinciden con la sesión | 400 | `TableSessionMismatchError` | The order does not match the restaurant or table of the session |
| Sesión cerrada (liberada, mesa borrada o carrera) | 409 | `TableSessionClosedError` | The table session is closed |

Otros: `restaurantId` ausente sigue siendo el error heredado 400 `{error: 'Restaurant ID is required'}` (sin `message`); sin JWT 401 `{error: 'Unauthorized: ...'}`; fallo inesperado 500. Recomendación a clientes: 400 `TableSessionMismatchError`, 403, 404 y 409 implican contexto de sesión inválido (volver a `GET /restaurants/:id/table-sessions/current` y, si es `null`, al paso de selección de mesa); 400 `TableSessionRequiredError` indica fallo de cliente. Los errores de ocupación (`POST /table-sessions`) y mesas están en `tables.openapi.yaml`: 400 validación, 403 rol/restaurante, 404 mesa/restaurante, 409 `TableNotAvailableError`, `TableCapacityExceededError`, `ActiveTableSessionExistsError`, `TableNumberConflictError`, `TableCapacityConflictError`.

### Revisión del bloque A (segundo agente)

- Verificado: `npm test` 25 archivos / 307 tests y `tsc --noEmit` exit 0 (antes de la revisión 24 / 301).
- Superficie HTTP contrastada con `table.routes.ts`, `table-session.routes.ts`, `app.ts` y `errorHandler.ts`: paths, `/available` antes de `/:tableId`, `mergeParams`, permisos y mapeo 400/401/403/404/409/500 coinciden con el contrato. No se hallaron huecos de implementación.
- Hueco de evidencia corregido: faltaban pruebas HTTP directas de CA02/CA03/CA04/CA12/CA14/CA17; añadidas en `src/routes/acceptance.routes.test.ts` (6 tests, verdes al primer intento por probar código previo, sin rojo inicial).
- No se pudo repetir `swagger-cli`/`redocly` (descarga con `npx` denegada en este entorno); `orders.openapi.yaml` se comprobó solo con parseo YAML tras añadir la tabla de errores.

## Criterios de aceptación

Cada casilla se marca solo después de comprobarla. Las pruebas nuevas aquí mencionadas aún no existen.

- [ ] **CA01 — CRUD por restaurante.** Admin crea, lista, edita y borra mesas con sus cinco campos; el id permanece estable al editar.
  - Verificación: tests HTTP y admin; navegador en dos restaurantes, editar descripción/capacidad/estado y comprobar persistencia tras recarga.
  - Evidencia parcial (solo admin, API real por curl + tests de componente; no marcado porque falta la verificación en navegador y de las demás apps): alta/edición/borrado correctos y id estable al editar (ver T25).
- [ ] **CA02 — Validación y unicidad.** Número/capacidad/grupo son enteros positivos; los estados válidos son exactamente tres; número duplicado solo se prohíbe entre mesas activas del mismo restaurante.
  - Verificación: matriz 0, -1, 1.5, strings/null/ausente y estado desconocido; mismo número en otro restaurante permitido; duplicado activo 409; capacidad exacta al grupo admitida.
  - Evidencia: Evidencia parcial (solo API): `npx vitest run src/routes/acceptance` (`CA02`) 14 cuerpos inválidos (0, -1, 1.5, string, null, ausente en número/capacidad; estado desconocido/mayúsculas) → 400 `{error,message}`; los tres estados válidos aceptados; mismo número en otro restaurante 201; duplicado activo 409 `TableNumberConflictError`; número reutilizable tras borrar; capacidad igual al grupo admitida. Complementa `src/models` (57 tests) y `database.test.ts`. Al ser solo API, el CA no depende de navegador: **completo en API**.
- [ ] **CA03 — Filtro exacto de disponibilidad.** Para 4 personas se ofrecen libres de capacidad 4 y 6, no capacidad 2, ocupadas, reservadas, borradas ni de otro restaurante.
  - Verificación: prueba de repositorio/API con esas fixtures y selección de cliente en navegador; grupo sin coincidencias muestra vacío explícito.
  - Evidencia: Evidencia parcial (API): test `CA03` en `acceptance.routes.test.ts`: capacidades 2/4/6, ocupada, reservada, borrada y otro restaurante; para 4 personas devuelve exactamente las de capacidad 4 y 6; grupo 7 → `[]`. Falta la selección de cliente en navegador (bloque D).
- [ ] **CA04 — Momento de ocupación.** Indicar grupo/listar/seleccionar no ocupa; continuar con éxito abre una sesión, marca ocupada y lleva a carta.
  - Verificación: consultar mesa antes y después; test HTTP y componente con spy del POST; continuar inválido no llama API.
  - Evidencia: Evidencia parcial (API): test `CA04`: consultar disponibilidad dos veces y `current` no ocupan (mesa `libre`, `activeSessionId` null); `partySize: 0` → 400 sin cambios; confirmar → 201, mesa `ocupada` con `activeSessionId` de la sesión y desaparece de disponibilidad. Falta el spy del POST en componente y la navegación a carta (bloque D).
  - Evidencia parcial (solo parte clientes, NO marcado): listar/seleccionar no ocupa (API real: disponibilidad repetida no cambia estado; specs: seleccionar no llama a ocupar); continuar abre sesión 201 y navega a la carta (spec). Sin navegador.
- [ ] **CA05 — Conflicto concurrente y reintento.** Dos clientes no consiguen ocupar la misma mesa; reintentar el ganador no duplica sesión y un fallo no deja estado parcial.
  - Verificación: dos peticiones concurrentes, una creación y un conflicto; contar una sesión abierta, repetir confirmación y comprobar mismo id; inyectar fallo y comprobar rollback.
  - Evidencia: Evidencia (API): `table-session.repository.test.ts` (T07): dos clientes por una mesa → 1 ganador + 1 `TableNotAvailableError`; 10 simultáneos → 1 sesión abierta; reintento del ganador → `created:false` con el mismo id; fallos inyectados (INSERT duplicado, `disk I/O error` tras el UPDATE) → rollback con mesa libre y sin sesión huérfana; HTTP: 201 y 200 del reintento en `table-session.routes.test.ts`. Comprobado en `npm test` 307/307. **Completo (API)**.
- [ ] **CA06 — Recuperación sin liberación automática.** Recargar, salir o cambiar restaurante conserva sesión en servidor y al volver se recupera la mesa.
  - Verificación: navegador con recarga completa y vuelta desde otro restaurante; GET current devuelve misma sesión; ninguna petición de liberación desde cliente.
  - Evidencia parcial (solo parte clientes, NO marcado): API real: current devuelve la misma sesión tras "recarga" y tras consultar otro restaurante y volver, sin liberación; el guard/store reconsultan al servidor (specs). Sin navegador.
- [ ] **CA07 — Acceso directo y contexto obsoleto.** No se puede pedir sin sesión propia abierta ni usar sesión cerrada, borrada, ajena o de otro restaurante.
  - Verificación: URL directa a carta sin sesión redirige; POST manipulado devuelve error; liberar desde empleados y volver a cliente impide pedido; cubrir carrera entre cierre y creación.
  - Evidencia: Evidencia parcial (API): `order.routes.test.ts`: sin sesión 400, inexistente 404, ajena 403, restaurante/mesa distintos 400, cerrada 409 sin crear pedido; sesión de mesa borrada 409; carrera liberar vs pedir (cada pedido 201 o 409, ninguno posterior al cierre); `order.repository.test.ts` T12 con SQLite real. Falta la redirección de URL directa a carta y el recorrido liberar→volver en navegador (bloques C/D).
  - Evidencia parcial (solo parte clientes, NO marcado): API real: pedido sin sesión 400, ajena 403, inexistente 404, incoherente 400, cerrada 409 y el cliente vuelve a selección sin reenviar (specs). Sin navegador; faltan sesión borrada y de otro restaurante en caso de borrado de mesa (admin).
- [ ] **CA08 — Envío a cocina y barra.** Nuevo pedido guarda mesa/sesión correctas; comida aparece en cocina y bebida en barra, conservando estados por unidad.
  - Verificación: pedido con 2 comidas y 1 bebida produce tres ítems `pendiente`; preparar/listo/entregar desde las apps sin pérdidas.
  - Evidencia: pendiente.
- [ ] **CA09 — Estados visibles y editables por personal autorizado.** Salón muestra todas las mesas, incluso ocupadas sin pedidos, y permite los tres estados.
  - Verificación: navegador como camarero, manager y admin; cambio persistente tras recarga; cocinero continúa en cocina sin acceso a salón.
  - Evidencia (parte empleados, sin marcar el CA): specs de salón (todas las mesas con estado, capacidad y número en texto; ocupada sin pedidos visible; tres botones), de shell y de rutas (cocinero sin salón, admin solo salón). Con API real (curl con las mismas rutas del servicio, JWT de camarero1): `GET /restaurants/rest-1/tables` 200 con 5 mesas; `PATCH .../status` ocupada/ocupada/reservada/libre 200 con `activeSessionId` coherente; cocinero1 recibe 403 en GET y PATCH de mesas; camarero de rest-1 sobre rest-2 403; estado inválido 400. NO se probó en navegador ni la persistencia tras recarga en UI, ni manager/admin en UI (admin: `GET /restaurants` y `GET /restaurants/rest-2/tables` 200).
- [ ] **CA10 — Visita actual aislada.** Mesa ocupada muestra sus pedidos/estados, incluidos entregados, pero no los de sesiones anteriores.
  - Verificación: sesiones A y B sucesivas de una mesa con pedidos en ambas; detalle B solo contiene ids de B; ocupada manual sin pedidos muestra vacío.
  - Evidencia: Evidencia parcial (API): T16 (sesiones A y B sucesivas: detalle de B sin pedidos de A, entregados incluidos en `order.repository.test.ts`) y test `CA17` de `acceptance.routes.test.ts` (ocupada manual sin pedidos → `[]`). Falta verlo en el salón (bloque C).
  - Evidencia (parte empleados, sin marcar el CA): spec de `TableStore`/`TableOrdersComponent`/salón: detalle solo de la sesión activa, borrado y descarte de respuestas tardías al cambiar de mesa/sesión. API real: tras una visita de cliente con pedido mixto, `GET .../tables/:id/orders` devolvió ese pedido con `tableNumber` y `tableSessionEndedAt: null`, y `[]` tras liberar la mesa. NO se probó la secuencia de dos visitas A y B con pedidos en ambas ni el navegador.
- [ ] **CA11 — Liberación con pendientes.** Se permite liberar con pedidos pendientes sin cancelarlos, entregarlos ni mostrarlos en la siguiente visita.
  - Verificación: liberar A pendiente, ocupar B y comprobar que A sigue en cocina/barra/panel de entregas identificado como anterior; nueva petición de A se rechaza.
  - Evidencia: Evidencia parcial (API): T16 `order.routes.test.ts`: liberar A con pendientes, ocupar B; A sigue en `/orders/active` con `tableSessionEndedAt`/`tableNumber`, procesable por cocina (204), y su nueva petición se rechaza 409; la mesa de B no lista pedidos de A. Falta comprobar cocina/barra/panel de entregas en empleados (bloque C).
  - Evidencia (parte empleados, sin marcar el CA): spec de salón: confirmación al cerrar ocupación con aviso de pendientes y sin cancelar ni entregar; API real: `PATCH ocupada->libre` con un ítem `listo` sin entregar devolvió 200, `GET /orders/active` siguió devolviendo el pedido con `tableSessionEndedAt` no nulo (la UI lo etiqueta «Visita cerrada» en cocina/barra/entregas, comprobado por specs) y el ítem pudo entregarse después (204). NO se probó ocupar B después ni el rechazo de nuevas peticiones de A, ni navegador.
- [ ] **CA12 — Historial tras borrado.** Borrar oculta la mesa, cierra su ocupación y conserva sesiones, pedidos e ítems históricos.
  - Verificación: consulta de pedido anterior sigue funcionando; disponibilidad/listados no incluyen mesa; recrear mismo número obtiene id nuevo y no hereda pedidos.
  - Evidencia: Evidencia (API): T16 (borrado 204, mesa 404, sesión cerrada conservada, pedido e ítems conservados) y test `CA12` de `acceptance.routes.test.ts`: tras borrar, listado y disponibilidad vacíos; recrear el número da id nuevo, su detalle de pedidos es `[]` y el pedido antiguo conserva `tableId`/`tableSessionId` originales. **Completo (API)**.
- [ ] **CA13 — Autorización y pertenencia.** Solo admin dispone de CRUD; manager/camarero solo cambian mesas de su restaurante; cliente solo opera su ocupación.
  - Verificación: matriz HTTP por rol/restaurante, sin JWT y con ids cruzados; 401/403/404 según contrato; manager bloqueado en URL de CRUD admin; disponibilidad sin datos personales.
  - Evidencia: Evidencia (API): `table.routes.test.ts` y `table-session.routes.test.ts` (T15, 40 pruebas HTTP): solo admin CRUD (manager/camarero/cocinero/cliente 403), manager/camarero de otro restaurante 403, ids cruzados 404 incluso para admin, sin JWT/token inválido 401, personal sin acceso a disponibilidad/ocupación, disponibilidad sin identidad ni estado. Mutación temporal documentada en T15. Falta el bloqueo por URL directa del manager en admin (bloque B), por lo que el CA queda **completo en API, parcial global**.
  - Evidencia parcial (solo admin; no marcado): rutas `restaurants/:restaurantId/tables` con `adminGuard` (comprobado en `tables.routes.spec.ts`; manager bloqueado en URL por el guard, sin prueba en navegador) y API real devuelve 403 al manager en POST. Falta camarero/cliente y las demás apps.
- [ ] **CA14 — Compatibilidad de datos existentes.** Inicializar una BD anterior añade esquema sin borrar datos y pedidos sin sesión siguen consultables/preparables/entregables.
  - Verificación: fixture del esquema previo, evolución y segunda inicialización; comparar ids/ítems antes/después; pruebas de listados antiguos y panel de entregas.
  - Evidencia: Evidencia parcial (API): `database.test.ts` (T05): fixture del esquema previo, columna añadida una vez con `PRAGMA table_info`, ids/ítems intactos y reapertura sin repetir; test `CA14` de `acceptance.routes.test.ts`: pedido sin sesión (`mesa-7`) aparece en `/orders/active` con campos de sesión `null`, avanza `preparando→listo→entregado` (204), `mine` y `GET /:id` lo devuelven y sale de activos al entregarse. Falta el panel de entregas en empleados (bloque C).
- [ ] **CA15 — Carrito y usuario aislados.** Carrito de otra visita/restaurante no se envía en la nueva; enviar un pedido no pierde la ocupación; otro usuario no hereda sesión local.
  - Verificación: tests de store y recorrido cambiar restaurante/visita, confirmar y pedir de nuevo; logout/login con usuario distinto.
  - Evidencia parcial (solo parte clientes, NO marcado): specs: carrito ligado a restaurante+sesión, nueva visita sin productos previos, enviar pedido conserva la ocupación, logout/otro usuario vacía contexto. Sin navegador.
- [ ] **CA16 — Errores y refresco fiables.** Carga/error/vacío tienen presentación explícita; fallos no simulan éxito; las respuestas tardías no cruzan restaurante, grupo ni visita.
  - Verificación: tests con respuestas HTTP invertidas, 409 y fallo de red en cada app; timers de empleados se detienen al salir y no se duplican al volver.
  - Evidencia parcial (solo admin; no marcado): carga/error/vacío del listado y del formulario, error de borrado sin simular éxito y descarte de respuestas tardías entre restaurantes cubiertos por tests (T20, T24). Falta empleados/clientes.
  - Evidencia (parte empleados, sin marcar el CA): specs de `TableStore` (respuestas tardías de restaurante/mesa/sesión, error sin vaciar lista ni simular éxito, doble envío, un solo intervalo y parada al destruir), `OrderStore` y salón (cargando/error/vacío explícitos). Fallos de red/409 reales no se provocaron contra la API (solo 400/403). Parte de otras apps pendiente.
  - Evidencia parcial (solo parte clientes, NO marcado): specs: carga/vacío/error con reintento y descarte de respuestas tardías por grupo y restaurante; errores no simulan éxito. Sin navegador.
- [ ] **CA17 — Capacidad y cambios administrativos coherentes.** No se reduce capacidad por debajo del grupo activo; PUT, PATCH y borrado mantienen el ciclo de sesiones.
  - Verificación: grupo 4, intentar capacidad 2 devuelve 409; capacidad 4 válida; cambiar ocupada a reservada cierra sesión; repetir ocupada no abre otra.
  - Evidencia: Evidencia (API): test `CA17` de `acceptance.routes.test.ts`: grupo 4 en mesa de 6, PUT capacidad 2 → 409 `TableCapacityConflictError`, capacidad 4 → 200; repetir `ocupada` mantiene una sola sesión; `ocupada→reservada` cierra la sesión (`activeSessionId` null, `current` null); `reservada→ocupada` manual abre otra sin pedidos. Borrado: T08/T16. **Completo (API)**; los avisos en admin/empleados corresponden a B/C.
  - Evidencia parcial (solo admin; no marcado): API real devuelve 409 `TableCapacityConflictError` al bajar la capacidad bajo el grupo activo (5 personas), conserva la mesa; borrado de mesa ocupada por cliente → 204 y luego 404; el formulario muestra mensaje específico (T22). Probado por curl, no en navegador.
- [ ] **CA18 — Validación técnica y documentación.** Tests, tipos y builds afectados pasan; documentación describe el flujo real.
  - Verificación: `npm test`; `npm exec -w @resttek/api -- tsc --noEmit -p tsconfig.json`; `npm run test -w @resttek/web-admin`; `npm run test -w @resttek/web-empleados`; `npm run test -w @resttek/web-clientes` tras T34; build de cada una de las tres apps; revisión de enlaces y recorrido documentado.
  - Evidencia parcial (integración 2026-10-30, sin marcar): todas las suites, `tsc` y los tres builds pasan en `21/gestion-mesas` (ver nota de integración en el bloque E). Falta la documentación de T45–T46.

## Reglas de seguimiento y finalización

- Leer este plan completo y el estado actual del proyecto antes de modificar código. Resolver con el usuario las dudas bloqueantes antes de ejecutar pasos afectados.
- Usar la skill `implement-plan`. Antes de implementar, crear o recuperar `.vscode/worktrees/21/gestion-mesas` con rama `21/gestion-mesas`, partiendo de `development`. Si no existe `development`, crearla desde `main` o, en su defecto, `master`. Implementar y seguir el plan dentro del worktree, conservando el checkout original y su trabajo ajeno.
- Aplicar TDD estricto y un commit por tarea conforme a `implement-plan`, usando la skill `commit`. No marcar una tarea verde si solo se escribió su prueba o contrato.
- Mantener este mismo archivo como fuente de progreso. Todas las tareas empiezan `- [ ]`; solo después de completar y comprobar una, usar `- [x]` y tachar su título, por ejemplo `- [x] **T03 (10 min)** ~~Definir tipos y validaciones de mesa y ocupación~~`.
- Actualizar el plan al terminar cada tarea, no solo al final. No marcar completado lo parcial, pendiente o sin comprobar. Desglosar trabajo nuevo en pasos de 5–10 minutos y registrar decisiones/dudas.
- Marcar cada criterio solo después de verificarlo y sustituir «pendiente» por evidencia concreta: comando y resultado, o escenario manual con datos y resultado. Si no puede comprobarse, conservarlo pendiente y explicar el bloqueo.
- Usar los tests focalizados durante desarrollo; ejecutar `npm test` de API y los comandos finales de cada paquete antes de cerrar su entrega. No dar por probados los frontends mediante tests de API.
- Instalar dependencias desde raíz únicamente tras cambios de manifiesto o fallos de validación por herramientas ausentes. No ejecutar seed contra datos compartidos sin confirmar su destino.
- La implementación termina solo con todas las tareas y criterios comprobados, sin dudas bloqueantes y con sus commits. Si falla una comprobación, no declarar éxito ni publicar aviso de implementación completada.
- Tras completar y verificar implementación y commits, publicar aviso en Slack, canal `C0CBPC9LUS3`, según `implement-plan`. Comprobar envío e informar explícitamente si falla. El aviso de planificación no es un aviso de implementación terminada.

## Dudas y preguntas pendientes

- **Ninguna bloqueante de producto tras las respuestas del usuario.** Las cuatro decisiones confirmadas se recogen arriba.
- **Confirmación técnica durante T07/T12:** escoger el mecanismo transaccional compatible con la conexión SQLite compartida y demostrar las carreras indicadas. Bloquea dar por completados esos pasos si no se garantiza atomicidad; no justifica omitir las pruebas.
- **Configuración de tests de clientes:** se verificó su ausencia. T34 debe comprobar la configuración concreta con Angular 21.2 del paquete; el resto de clientes depende de ese paso.
- Si una decisión propia descrita abajo se cambia durante revisión, ajustar contrato y pasos dependientes antes de implementarlos.

## Decisiones tomadas durante la planificación

- **Un plan con cuatro bloques y coordinación final**, en lugar de cuatro planes independientes: lo solicitó el usuario por aplicación; se elige una única fuente para evitar contratos y evidencias divergentes.
- **Dominio de mesas por capas**, como restaurant/order; no convertir employee ni introducir una arquitectura nueva.
- **Sesiones con titular cliente y ocupaciones manuales sin titular**, para recuperar ocupación autenticada y permitir que empleados marquen ocupada sin inventar un cliente.
- **Borrado lógico**, para satisfacer la conservación del historial confirmada. Cierra ocupación pero nunca elimina pedidos; requiere confirmación visible al administrador.
- **Número entero positivo único por restaurante entre mesas no borradas**, y descripción admite vacío: reglas no detalladas por el usuario, elegidas para identificación operativa simple y sin exigir texto innecesario.
- **Sesión independiente del carrito y fuente de verdad en servidor**: enviar/vaciar un pedido no libera mesa; no hace falta guardar credenciales ni sesión de mesa como autoridad local.
- **Una sesión de cliente por restaurante, no global**, para cumplir que cambiar de restaurante no libere la anterior y poder recuperarla al volver.
- **Solo cliente titular puede pedir en su sesión**; no se añade invitación de comensales ni ocupación compartida entre cuentas.
- **Admin conserva edición de estado dentro del CRUD; manager/camarero usan PATCH**, compartiendo reglas para no producir sesiones inconsistentes. Manager no recibe CRUD por inferencia.
- **Selector de restaurante en salón para admin**, necesario porque su usuario no tiene restaurante asignado. No se amplía acceso a cocinero.
- **Sin estado agregado nuevo de pedido**: mostrar estados por ítem y conservar categorías/preparación existentes. Pedidos antiguos pendientes continúan en paneles operativos aunque su mesa ya esté libre o tenga otra visita.
- **Añadir únicamente tooling de tests que falta en clientes**, reutilizando el patrón Angular/Vitest existente; necesario para comprobar frontend con TDD.
- **No modificar `web-shared` de antemano**, porque las apps ya tienen modelos/servicios propios y no hay comportamiento compartido nuevo que justifique extraer una abstracción.
- **Sin ejecución de suites durante planificación**: solo se ha leído contexto y validado el nombre de rama; todas las comprobaciones funcionales/técnicas se dejan explícitamente pendientes.
