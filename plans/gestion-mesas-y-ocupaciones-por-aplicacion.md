# Plan: gestión de mesas y ocupaciones por aplicación

- ID de tarea: **21**.
- Rama de implementación: `21/gestion-mesas`.
- Worktree de implementación: `.vscode/worktrees/21/gestion-mesas`.
- Rama base: `development` (si no existe, crear desde `main` o, en su defecto, `master`).
- Validación del nombre: `git check-ref-format --branch 21/gestion-mesas`, correcta durante la planificación.
- Estado: plan preparado; implementación y comprobaciones funcionales pendientes.
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
- [ ] **T06 (10 min)** Persistir CRUD, disponibilidad y borrado lógico de mesas
  - Archivos: `packages/api/src/repositories/table.repository.ts`, `table.repository.test.ts` (nuevos).
  - Dependencias: T04.
  - Comprobación: filtros por restaurante/estado/capacidad, duplicados por restaurante, número reutilizable tras borrado e IDs distintos; excluir borradas.
- [ ] **T07 (10 min)** Persistir ocupación y recuperación atómicas e idempotentes
  - Archivos: `packages/api/src/repositories/table-session.repository.ts`, `table-session.repository.test.ts` (nuevos); soporte transaccional acotado en `config/database.ts` si hace falta.
  - Dependencias: T04, T06.
  - Comprobación: dos clientes compiten por una mesa: una sesión ganadora y un conflicto; reintento del ganador no duplica. Fallo intermedio deja mesa libre y ninguna sesión huérfana. Evitar transacciones intercaladas en la conexión SQLite compartida.
- [ ] **T08 (10 min)** Implementar cambios de estado y borrado con cierre de sesión
  - Archivos: repositorios de T06–T07 y sus tests.
  - Dependencias: T07.
  - Comprobación: ocupar manualmente, reservar, liberar con pedidos pendientes y borrar ocupada son consistentes; cerrar sesión y cambiar estado/borrar es atómico. Competir liberación/borrado con ocupación no deja sesiones abiertas en mesas libres o borradas.
- [ ] **T09 (10 min)** Implementar reglas de CRUD y transiciones en el servicio
  - Archivos: `packages/api/src/services/table.service.ts`, `table.service.test.ts`, mocks de repositorios (nuevos).
  - Dependencias: T03, T06, T08.
  - Comprobación: restaurante existente, pertenencia, campos inmutables, capacidad frente al grupo activo y conflictos; PUT y PATCH usan las mismas reglas de estado.
- [ ] **T10 (10 min)** Implementar confirmación y recuperación de la sesión propia
  - Archivos: `packages/api/src/services/table-session.service.ts`, `table-session.service.test.ts` (nuevos).
  - Dependencias: T07, T09.
  - Comprobación: solo libres suficientes; rechazar mesa ajena, borrada, reservada u ocupada por otro; recuperar solo la del actor y permitir sesiones en restaurantes distintos.
- [ ] **T11 (10 min)** Ampliar persistencia y consulta de pedidos por sesión
  - Archivos: `packages/api/src/models/order.model.ts`, `repositories/order.repository.ts`, `repositories/order.repository.test.ts` (nuevo), `repositories/mocks/MockOrderRepository.ts`.
  - Dependencias: T05, T07.
  - Comprobación: guardar/leer `tableSessionId` y número, proyectar cierre de sesión en pedidos activos, consultar todos los ítems de una sesión incluidos entregados, excluir visitas anteriores y mantener consultas antiguas sin sesión.
- [ ] **T12 (10 min)** Validar sesión del actor al crear nuevos pedidos de cliente
  - Archivos: `packages/api/src/services/order.service.ts`, `services/order.service.test.ts`, repositorios implicados y mocks.
  - Dependencias: T10, T11.
  - Comprobación: rechazar sesión cerrada/ajena, discordancia restaurante/mesa y ausencia de sesión de cliente; pedido correcto mantiene un ítem por unidad. Validación y escritura no permiten pedidos después de cerrar la sesión en una carrera concurrente.
- [ ] **T13 (10 min)** Exponer controladores, rutas de mesas y mapeo de errores
  - Archivos: `packages/api/src/controllers/table.controller.ts`, `table-session.controller.ts`, `routes/table.routes.ts`, `table-session.routes.ts` (nuevos), `app.ts`, `contexts/shared/infrastructure/http/errorHandler.ts`.
  - Dependencias: T09, T10.
  - Comprobación: endpoints conforme a T01, `available` no se interpreta como id, códigos 400/404/409 correctos; errores inesperados no se silencian. Usar tipos/guards del actor sin nuevos `any`.
- [ ] **T14 (10 min)** Conectar creación de pedidos y consulta de visita actual
  - Archivos: `packages/api/src/controllers/order.controller.ts`, `routes/order.routes.ts`, rutas/controladores de T13.
  - Dependencias: T11, T12, T13.
  - Comprobación: POST deriva identidad del JWT, mantiene respuesta de pedido y devuelve error explícito de sesión inválida; GET de mesa libre sin sesión devuelve lista vacía.
- [ ] **T15 (10 min)** Cubrir permisos y aislamiento con pruebas HTTP
  - Archivos: `packages/api/src/routes/table.routes.test.ts`, `table-session.routes.test.ts` (nuevos).
  - Dependencias: T13, T14.
  - Comprobación: Supertest contra BD en memoria con cliente, camarero, manager, cocinero y admin; incluir otro restaurante, ids cruzados, sin JWT y evitar exposición de identidad en disponibilidad.
- [ ] **T16 (10 min)** Cubrir recorrido completo e historial tras liberar o borrar
  - Archivos: `packages/api/src/routes/order.routes.test.ts` (nuevo), tests de repositorios de T07–T12.
  - Dependencias: T14, T15.
  - Comprobación: ocupar A, pedir, liberar con pendientes, ocupar B en la misma mesa: detalle B sin pedidos A; A sigue preparándose/entregándose y no puede pedir de nuevo. Borrado conserva pedido y sesión histórica.
- [ ] **T17 (10 min)** Sembrar mesas y verificar entrega del backend
  - Archivos: `packages/api/src/scripts/seed.ts`; este plan para evidencias.
  - Dependencias: T16.
  - Comprobación: datos deterministas para mesas libres de capacidades 2/4/6, reservada y ocupada manual; nueva semilla no duplica mesas al repetirla. Ejecutar seed solo en una BD de prueba controlada. Ejecutar `npm test` y `npm exec -w @resttek/api -- tsc --noEmit -p tsconfig.json`; registrar resultados.

### B. Admin — agente Frontend Angular, alcance web-admin

Propiedad: `packages/web-admin/**`. No modificar API, otros frontends ni documentación general.

- [ ] **T18 (10 min)** Añadir modelos y servicio HTTP de mesas
  - Archivos: `packages/web-admin/src/app/features/tables/models/table.model.ts`, `services/table.service.ts`, `services/table.service.spec.ts` (nuevos).
  - Dependencias: T01.
  - Comprobación: HttpTestingController verifica paths con restaurante, métodos CRUD, DTOs y propagación de conflictos; sin importar tipos de otras apps.
- [ ] **T19 (10 min)** Añadir store de mesas aislado por restaurante
  - Archivos: `packages/web-admin/src/app/features/tables/store/table.store.ts`, `table.store.spec.ts` (nuevos).
  - Dependencias: T18.
  - Comprobación: signals de datos/carga/error, mutaciones tras éxito; cambiar A→B limpia A y una respuesta tardía de A no sustituye B ni su error/carga.
- [ ] **T20 (10 min)** Crear listado de mesas con estados y borrado confirmado
  - Archivos: `packages/web-admin/src/app/features/tables/pages/table-list/table-list.component.{ts,html,css,spec.ts}` (nuevos).
  - Dependencias: T19.
  - Comprobación: columnas de los cinco campos, acciones de alta/edición/borrado, estados vacío/cargando/error y aviso de cierre de ocupación/conservación de pedidos antes de borrar.
- [ ] **T21 (10 min)** Crear formulario de alta con validación de campos
  - Archivos: `packages/web-admin/src/app/features/tables/pages/table-form/table-form.component.{ts,html,css,spec.ts}` (nuevos).
  - Dependencias: T19.
  - Comprobación: entero positivo para número/capacidad, descripción y selector de tres estados; envío bloqueado mientras inválido o guardando; mostrar conflicto de número.
- [ ] **T22 (10 min)** Completar edición y errores de cambios de estado/capacidad
  - Archivos: formulario de T21 y sus tests.
  - Dependencias: T21.
  - Comprobación: precarga, guardar conserva id/restaurante, error de capacidad o recurso borrado visible; liberar mesa ocupada advierte que puede haber pedidos pendientes y no los elimina.
- [ ] **T23 (10 min)** Conectar rutas, dashboard y menú lateral solo para admin
  - Archivos: `packages/web-admin/src/app/features/tables/tables.routes.ts` (nuevo), `app.routes.ts`, `core/layout/shell.component.html`, dashboard del restaurante; tests de rutas/navegación nuevos.
  - Dependencias: T20, T22.
  - Comprobación: acceso desde restaurante al listado/nuevo/editar; guard específico de admin en rutas de mesas, no solo ocultar enlaces; manager no obtiene CRUD entrando URL directa. No cambiar permisos de features ajenas.
- [ ] **T24 (10 min)** Probar navegación entre restaurantes y errores de CRUD
  - Archivos: tests del store, listado, formulario y rutas de mesas.
  - Dependencias: T23.
  - Comprobación: navegar A→B con componente reutilizado actualiza listado y rutas de acciones; fallo HTTP no borra fila ni notifica éxito; cancelar confirmación no llama al servidor.
- [ ] **T25 (5 min)** Validar el paquete admin y registrar evidencia
  - Archivos: este plan.
  - Dependencias: T17, T24.
  - Comprobación: `npm run test -w @resttek/web-admin` y `npm run build -w @resttek/web-admin`; prueba manual CRUD con API real, incluidos número duplicado y capacidad insuficiente durante ocupación.

### C. Empleados — agente Frontend Angular, alcance web-empleados

Propiedad: `packages/web-empleados/**`. Mantener intacta la matriz de acceso existente a cocina/barra/salón.

- [ ] **T26 (10 min)** Añadir modelos y servicio de mesas, estado y pedidos de visita
  - Archivos: `packages/web-empleados/src/app/features/tables/models/table.model.ts`, `services/table.service.ts`, `services/table.service.spec.ts` (nuevos); `features/orders/models/order.model.ts`.
  - Dependencias: T01, T02.
  - Comprobación: tests de HTTP verifican consulta, PATCH y pedidos de sesión actual; campos opcionales históricos compatibles.
- [ ] **T27 (10 min)** Añadir store de mesas con refresco y cancelación de ciclo
  - Archivos: `packages/web-empleados/src/app/features/tables/store/table.store.ts`, `table.store.spec.ts` (nuevos).
  - Dependencias: T26.
  - Comprobación: carga inicial y polling de 30 s, un único intervalo, limpieza al destruir/cambiar restaurante; respuestas tardías descartadas, errores visibles sin falsos éxitos.
- [ ] **T28 (10 min)** Mostrar en salón todas las mesas con sus estados
  - Archivos: `packages/web-empleados/src/app/features/orders/pages/salon/salon.component.{ts,html,css}`, `salon.component.spec.ts` (nuevo); componente presentacional de mesa dentro de `features/tables/` si se reutiliza.
  - Dependencias: T27.
  - Comprobación: libre/ocupada/reservada distinguibles con texto, número y capacidad; mesa ocupada sin pedidos muestra ese caso, no desaparece.
- [ ] **T29 (10 min)** Incorporar cambio de estado con confirmación y errores
  - Archivos: salón y store de mesas con tests.
  - Dependencias: T28.
  - Comprobación: tres estados, confirmación al cerrar ocupación, bloquear doble envío; liberar con pedidos pendientes permitido y advertido; mostrar errores del servidor y no actualizar antes del éxito.
- [ ] **T30 (10 min)** Añadir detalle de pedidos exclusivamente de la visita actual
  - Archivos: salón; `features/tables/components/table-orders/` (nuevo) y sus tests.
  - Dependencias: T28.
  - Comprobación: mostrar estados de todos los ítems incluidos entregados, distinguir pedidos múltiples y refrescar detalle; cambio de sesión/mesa descarta respuesta tardía y borra detalle anterior.
- [ ] **T31 (10 min)** Mantener entregas y visibilidad de pedidos de visitas cerradas
  - Archivos: salón, `features/orders/models/order.model.ts`, modelos/templates de barra y cocina para etiquetas de mesa cuando proceda; tests de filtros.
  - Dependencias: T02, T29, T30.
  - Comprobación: sigue existiendo panel de ítems `listo` y acción entregar; pendientes antiguos siguen en cocina/barra, sin mezclarse con nueva visita; usar número visible en lugar de UUID cuando esté disponible, fallback para pedidos antiguos.
- [ ] **T32 (10 min)** Resolver restaurante de admin sin ampliar acceso a cocina
  - Archivos: salón, servicio de restaurantes local nuevo en `features/tables/services/`, tests; reutilizar guards existentes sin ampliar su matriz.
  - Dependencias: T28.
  - Comprobación: camarero/manager usan restaurante del JWT y no pueden seleccionar otro; admin sin asignación elige restaurante; cambio reinicia polling/detalle de mesas y pedidos; cocinero sigue sin salón.
- [ ] **T33 (10 min)** Verificar empleados y transiciones con API real
  - Archivos: specs de mesas/salón y este plan.
  - Dependencias: T17, T31, T32.
  - Comprobación: `npm run test -w @resttek/web-empleados` y `npm run build -w @resttek/web-empleados`; pruebas manuales de estados y pedido mixto comida/bebida conservando cocina/barra/entrega.

### D. Clientes — agente Frontend Angular, alcance web-clientes

Propiedad: `packages/web-clientes/**`; solo este agente modifica dependencias/configuración de tests de ese paquete. No importar código de admin/empleados.

- [ ] **T34 (10 min)** Habilitar pruebas unitarias usando el patrón Angular del monorepo
  - Archivos: `packages/web-clientes/package.json`, `angular.json`, `tsconfig.spec.json` (nuevo); `package-lock.json` en raíz.
  - Dependencias: ninguna.
  - Comprobación: script `test` y target `@angular/build:unit-test` con Vitest; añadir únicamente dependencias de pruebas necesarias, compatibles con el paquete. Tras editar manifiesto ejecutar `npm install` desde raíz; smoke test rojo/verde ejecutable. El comando de tests de clientes pasa a existir en este paso.
- [ ] **T35 (10 min)** Añadir tipos y servicio HTTP de disponibilidad/ocupación
  - Archivos: `packages/web-clientes/src/app/core/models/table.model.ts`, `services/table.service.ts`, `services/table.service.spec.ts` (nuevos).
  - Dependencias: T01, T34.
  - Comprobación: GET con grupo, POST solo al continuar, GET current con sesión o null, errores 409 propagados; nunca enviar clientId.
- [ ] **T36 (10 min)** Mantener y recuperar contexto de ocupación desde servidor
  - Archivos: `packages/web-clientes/src/app/core/store/table-session.store.ts`, `table-session.store.spec.ts` (nuevos).
  - Dependencias: T35.
  - Comprobación: signals de sesión/mesa/carga/error, recuperación por restaurante, no mezclar respuestas A/B; recarga reconstruye desde API sin confiar en datos locales. Salir/cambiar restaurante no llama a liberar.
- [ ] **T37 (10 min)** Crear paso de número de personas y listado elegible
  - Archivos: `packages/web-clientes/src/app/features/tables/table-selection.component.{ts,html,css,spec.ts}` (nuevos).
  - Dependencias: T35, T36.
  - Comprobación: grupo entero positivo obligatorio, mesas suficientes, lista vacía/carga/error; cambiar grupo invalida selección anterior y descarta respuestas tardías de otra cantidad.
- [ ] **T38 (10 min)** Confirmar ocupación y tratar conflictos sin navegar
  - Archivos: selección de T37 y sus tests.
  - Dependencias: T37.
  - Comprobación: seleccionar no muta estado; continuar sin selección bloqueado; una petición mientras guarda; 201/200 guarda sesión y navega a carta, 409 muestra aviso y refresca/reconcilia sin elegir otra mesa automáticamente.
- [ ] **T39 (10 min)** Conectar listado, rutas y acceso directo a carta
  - Archivos: `packages/web-clientes/src/app/app.routes.ts`, `features/restaurants/restaurant-list.component.ts`, `core/guards/table-session.guard.ts` (nuevo), specs de rutas/guard.
  - Dependencias: T38.
  - Comprobación: restaurante lleva a `restaurants/:id/tables`; conservar carta en `restaurants/:id`; guard consulta sesión propia y redirige al paso de mesas si no existe, sin bucles. Con sesión existente volver al restaurante permite continuar a su carta sin ocupar de nuevo.
- [ ] **T40 (10 min)** Vincular carrito y carta a la ocupación activa
  - Archivos: `packages/web-clientes/src/app/core/store/cart.store.ts`, `cart.store.spec.ts` (nuevo), `features/menu/restaurant-menu.component.ts`, `features/cart/cart.component.ts`.
  - Dependencias: T36, T39.
  - Comprobación: mostrar número y grupo; carrito vinculado a restaurante y sessionId; al cambiar de visita no reutiliza productos de la anterior, aunque sea el mismo restaurante. Vaciar carrito tras pedido no borra la sesión.
- [ ] **T41 (10 min)** Enviar pedido con mesa/sesión y manejar sesión cerrada
  - Archivos: `packages/web-clientes/src/app/core/services/order.service.ts`, `core/models/order.model.ts`, `features/cart/cart.component.ts`, specs nuevos.
  - Dependencias: T02, T40.
  - Comprobación: payload lleva ids correctos y sin clientId; éxito conserva navegación a pedido; error de sesión comunica el motivo y devuelve al flujo de selección sin enviar automáticamente el carrito a otra mesa; fallo de red conserva productos para reintento.
- [ ] **T42 (10 min)** Revalidar ocupación al volver y mantener pedidos históricos
  - Archivos: store/guard de sesión, carta/carrito y sus tests; `features/orders/my-orders.component.ts`, `order-detail.component.ts` solo si requieren presentación de mesa.
  - Dependencias: T41.
  - Comprobación: volver/recargar con sesión abierta recupera la misma; liberada o borrada no permite añadir/enviar usando contexto obsoleto; logout/otro usuario no hereda contexto local. Mis pedidos y detalle siguen mostrando pedidos previos.
- [ ] **T43 (10 min)** Cubrir recorrido de selección, doble clic y visita nueva
  - Archivos: specs de selección, guard, sesión y carrito.
  - Dependencias: T42.
  - Comprobación: escenarios de capacidad exacta/sobrante, 0/decimal, ausencia de mesas, dos clientes compitiendo, doble clic y segunda visita sin carrito de la primera.
- [ ] **T44 (5 min)** Validar clientes con el backend integrado
  - Archivos: este plan.
  - Dependencias: T17, T43.
  - Comprobación: `npm run test -w @resttek/web-clientes` (disponible tras T34), `npm run build -w @resttek/web-clientes`; navegador con recarga y retorno desde otro restaurante confirma recuperación sin liberación automática.

### E. Integración y documentación — agente coordinador

Propiedad: documentación general y seguimiento final. No utilizar esta fase para ocultar tareas de implementación incompletas.

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

## Criterios de aceptación

Cada casilla se marca solo después de comprobarla. Las pruebas nuevas aquí mencionadas aún no existen.

- [ ] **CA01 — CRUD por restaurante.** Admin crea, lista, edita y borra mesas con sus cinco campos; el id permanece estable al editar.
  - Verificación: tests HTTP y admin; navegador en dos restaurantes, editar descripción/capacidad/estado y comprobar persistencia tras recarga.
  - Evidencia: pendiente.
- [ ] **CA02 — Validación y unicidad.** Número/capacidad/grupo son enteros positivos; los estados válidos son exactamente tres; número duplicado solo se prohíbe entre mesas activas del mismo restaurante.
  - Verificación: matriz 0, -1, 1.5, strings/null/ausente y estado desconocido; mismo número en otro restaurante permitido; duplicado activo 409; capacidad exacta al grupo admitida.
  - Evidencia: pendiente.
- [ ] **CA03 — Filtro exacto de disponibilidad.** Para 4 personas se ofrecen libres de capacidad 4 y 6, no capacidad 2, ocupadas, reservadas, borradas ni de otro restaurante.
  - Verificación: prueba de repositorio/API con esas fixtures y selección de cliente en navegador; grupo sin coincidencias muestra vacío explícito.
  - Evidencia: pendiente.
- [ ] **CA04 — Momento de ocupación.** Indicar grupo/listar/seleccionar no ocupa; continuar con éxito abre una sesión, marca ocupada y lleva a carta.
  - Verificación: consultar mesa antes y después; test HTTP y componente con spy del POST; continuar inválido no llama API.
  - Evidencia: pendiente.
- [ ] **CA05 — Conflicto concurrente y reintento.** Dos clientes no consiguen ocupar la misma mesa; reintentar el ganador no duplica sesión y un fallo no deja estado parcial.
  - Verificación: dos peticiones concurrentes, una creación y un conflicto; contar una sesión abierta, repetir confirmación y comprobar mismo id; inyectar fallo y comprobar rollback.
  - Evidencia: pendiente.
- [ ] **CA06 — Recuperación sin liberación automática.** Recargar, salir o cambiar restaurante conserva sesión en servidor y al volver se recupera la mesa.
  - Verificación: navegador con recarga completa y vuelta desde otro restaurante; GET current devuelve misma sesión; ninguna petición de liberación desde cliente.
  - Evidencia: pendiente.
- [ ] **CA07 — Acceso directo y contexto obsoleto.** No se puede pedir sin sesión propia abierta ni usar sesión cerrada, borrada, ajena o de otro restaurante.
  - Verificación: URL directa a carta sin sesión redirige; POST manipulado devuelve error; liberar desde empleados y volver a cliente impide pedido; cubrir carrera entre cierre y creación.
  - Evidencia: pendiente.
- [ ] **CA08 — Envío a cocina y barra.** Nuevo pedido guarda mesa/sesión correctas; comida aparece en cocina y bebida en barra, conservando estados por unidad.
  - Verificación: pedido con 2 comidas y 1 bebida produce tres ítems `pendiente`; preparar/listo/entregar desde las apps sin pérdidas.
  - Evidencia: pendiente.
- [ ] **CA09 — Estados visibles y editables por personal autorizado.** Salón muestra todas las mesas, incluso ocupadas sin pedidos, y permite los tres estados.
  - Verificación: navegador como camarero, manager y admin; cambio persistente tras recarga; cocinero continúa en cocina sin acceso a salón.
  - Evidencia: pendiente.
- [ ] **CA10 — Visita actual aislada.** Mesa ocupada muestra sus pedidos/estados, incluidos entregados, pero no los de sesiones anteriores.
  - Verificación: sesiones A y B sucesivas de una mesa con pedidos en ambas; detalle B solo contiene ids de B; ocupada manual sin pedidos muestra vacío.
  - Evidencia: pendiente.
- [ ] **CA11 — Liberación con pendientes.** Se permite liberar con pedidos pendientes sin cancelarlos, entregarlos ni mostrarlos en la siguiente visita.
  - Verificación: liberar A pendiente, ocupar B y comprobar que A sigue en cocina/barra/panel de entregas identificado como anterior; nueva petición de A se rechaza.
  - Evidencia: pendiente.
- [ ] **CA12 — Historial tras borrado.** Borrar oculta la mesa, cierra su ocupación y conserva sesiones, pedidos e ítems históricos.
  - Verificación: consulta de pedido anterior sigue funcionando; disponibilidad/listados no incluyen mesa; recrear mismo número obtiene id nuevo y no hereda pedidos.
  - Evidencia: pendiente.
- [ ] **CA13 — Autorización y pertenencia.** Solo admin dispone de CRUD; manager/camarero solo cambian mesas de su restaurante; cliente solo opera su ocupación.
  - Verificación: matriz HTTP por rol/restaurante, sin JWT y con ids cruzados; 401/403/404 según contrato; manager bloqueado en URL de CRUD admin; disponibilidad sin datos personales.
  - Evidencia: pendiente.
- [ ] **CA14 — Compatibilidad de datos existentes.** Inicializar una BD anterior añade esquema sin borrar datos y pedidos sin sesión siguen consultables/preparables/entregables.
  - Verificación: fixture del esquema previo, evolución y segunda inicialización; comparar ids/ítems antes/después; pruebas de listados antiguos y panel de entregas.
  - Evidencia: pendiente.
- [ ] **CA15 — Carrito y usuario aislados.** Carrito de otra visita/restaurante no se envía en la nueva; enviar un pedido no pierde la ocupación; otro usuario no hereda sesión local.
  - Verificación: tests de store y recorrido cambiar restaurante/visita, confirmar y pedir de nuevo; logout/login con usuario distinto.
  - Evidencia: pendiente.
- [ ] **CA16 — Errores y refresco fiables.** Carga/error/vacío tienen presentación explícita; fallos no simulan éxito; las respuestas tardías no cruzan restaurante, grupo ni visita.
  - Verificación: tests con respuestas HTTP invertidas, 409 y fallo de red en cada app; timers de empleados se detienen al salir y no se duplican al volver.
  - Evidencia: pendiente.
- [ ] **CA17 — Capacidad y cambios administrativos coherentes.** No se reduce capacidad por debajo del grupo activo; PUT, PATCH y borrado mantienen el ciclo de sesiones.
  - Verificación: grupo 4, intentar capacidad 2 devuelve 409; capacidad 4 válida; cambiar ocupada a reservada cierra sesión; repetir ocupada no abre otra.
  - Evidencia: pendiente.
- [ ] **CA18 — Validación técnica y documentación.** Tests, tipos y builds afectados pasan; documentación describe el flujo real.
  - Verificación: `npm test`; `npm exec -w @resttek/api -- tsc --noEmit -p tsconfig.json`; `npm run test -w @resttek/web-admin`; `npm run test -w @resttek/web-empleados`; `npm run test -w @resttek/web-clientes` tras T34; build de cada una de las tres apps; revisión de enlaces y recorrido documentado.
  - Evidencia: pendiente.

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
