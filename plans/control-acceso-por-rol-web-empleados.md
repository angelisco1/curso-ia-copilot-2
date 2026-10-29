# Plan: controlar el acceso por rol en web-empleados

**ID de tarea:** `1` (issue #1)

## Objetivo

Impedir que una sesión acceda a vistas de trabajo no permitidas en `http://localhost:4201`, tanto escribiendo la URL como navegando dentro de la aplicación. Mantener el menú y la entrada inicial coherentes con los permisos.

Matriz de acceso acordada:

| Rol almacenado | `/barra` | `/salon` | `/cocina` | Entrada inicial |
| --- | --- | --- | --- | --- |
| `camarero` | Sí | Sí | No | `/barra` |
| `cocinero` | No | No | Sí | `/cocina` |
| `manager` (gerente) | Sí | Sí | Sí | `/salon` |
| `admin` | Sí | Sí | Sí | `/salon` |
| `cliente`, ausente o desconocido | No | No | No | `/login` |
| Sin sesión | No | No | No | `/login` |

El usuario ha confirmado que un camarero o cocinero que solicite una vista no permitida debe ser redirigido a su vista inicial. El gerente y el admin no tienen vistas de trabajo restringidas.

## Alcance

### Incluido

- Protección por rol de las tres rutas de trabajo de web-empleados, incluyendo navegación entre rutas hijas con el shell ya activo.
- Sustitución de la redirección fija de `/` a cocina por una entrada dependiente del rol, compatible con el login actual.
- Una política local de permisos reutilizada por rutas, guard y menú, evitando discrepancias.
- Incorporación del admin a los enlaces de navegación de las tres vistas.
- Conservación del login, logout, carga diferida y mensaje de falta de restaurante.
- Configuración mínima de pruebas Angular en el paquete afectado, pruebas de regresión y documentación directamente relacionada.

### Fuera de alcance

- Cambios en API, JWT, persistencia de sesiones, asignación de restaurantes o permisos de endpoints.
- Cambios de comportamiento en web-admin, web-clientes o los componentes compartidos de autenticación.
- Una nueva página de acceso denegado, notificaciones nuevas o rediseños visuales.
- Resolver problemas previos no relacionados o modificar los cambios locales existentes del usuario.

## Contexto comprobado

- [Instrucciones del repositorio](../AGENTS.md): npm workspaces; el código común se consume desde web-shared; `npm test` en la raíz solo ejecuta las pruebas de la API.
- [Rutas actuales](../packages/web-empleados/src/app/app.routes.ts): únicamente el shell tiene `canActivate: [authGuard]`; las tres rutas hijas no comprueban roles; `/` redirige siempre a `cocina`.
- [Guard compartido](../packages/web-shared/src/lib/auth/auth.guard.ts): solo comprueba `AuthStore.isAuthenticated()` y devuelve una redirección a `/login` sin sesión.
- [AuthStore](../packages/web-shared/src/lib/auth/auth.store.ts): expone `userRole()`, `user()` y `isAuthenticated()`. El criterio actual de sesión es disponer de token; no valida su contenido en el frontend.
- [Shell](../packages/web-empleados/src/app/core/layout/shell.component.ts): ya calcula permisos de menú para camarero, cocinero y manager; no incluye admin. Su `defaultRoute` no se utiliza en la [plantilla](../packages/web-empleados/src/app/core/layout/shell.component.html), por lo que no corrige la entrada inicial.
- La plantilla del shell muestra «Sin restaurante asignado» y no renderiza el outlet cuando falta `restaurantId`; se debe conservar ese comportamiento.
- [Login compartido](../packages/web-shared/src/lib/components/login/login.component.ts): tras iniciar sesión navega a `/`; arreglar esa ruta evita cambiar el login utilizado por otras aplicaciones.
- [Glosario](../docs/dominio/glosario.md): confirma que gerente se almacena como `manager` y documenta expresamente el defecto actual de acceso directo por URL. [Modelo de datos](../docs/dominio/modelo-datos.md) y [arquitectura frontend](../docs/arquitectura/arquitectura-frontend.md) consultados.
- [Manifest del paquete](../packages/web-empleados/package.json) y [configuración Angular](../packages/web-empleados/angular.json): hay script `build`, pero no script ni target `test`. El [tsconfig de pruebas](../packages/web-empleados/tsconfig.spec.json) todavía referencia Jasmine.
- Patrón disponible en el repositorio: [manifest de web-admin](../packages/web-admin/package.json), [target de pruebas](../packages/web-admin/angular.json) y sus specs usan Vitest, jsdom y Angular TestBed. Reutilizar la configuración equivalente, sin importar código de esa aplicación.
- El esquema instalado de `@angular/build:unit-test` admite Vitest, `tsConfig`, `include` y `watch`; el runner sin navegador usa jsdom. No se han ejecutado pruebas ni builds durante esta planificación.
- Existen cambios locales ajenos en skills, configuración y scripts; durante esta planificación solo se crea este archivo.

## Tareas

- [x] **T01 (10 min)** ~~Habilitar el runner Angular de pruebas de web-empleados~~
  - Acción: añadir script `test` con `ng test --watch=false` y target `@angular/build:unit-test` con Vitest; actualizar los tipos del tsconfig de pruebas. Declarar las dependencias de desarrollo necesarias siguiendo las versiones compatibles ya utilizadas por web-admin y actualizar el lockfile desde la raíz con `npm install` tras cambiar el manifest. Añadir una prueba mínima de arranque de TestBed.
  - Archivos o componentes: `packages/web-empleados/package.json`, `packages/web-empleados/angular.json`, `packages/web-empleados/tsconfig.spec.json`, `package-lock.json` y nuevo `packages/web-empleados/src/app/core/auth/employee-access.spec.ts`.
  - Dependencias: ninguna.
  - Comprobación: `npm run test -w @resttek/web-empleados -- --include=src/app/core/auth/employee-access.spec.ts` ejecuta la prueba mínima y termina correctamente; no se cambia el script de tests de la raíz.
  - Evidencia TDD: rojo — el comando focalizado terminó con código 1 por `Missing script: "test"` en el paquete; verde — tras añadir Vitest/jsdom, el target Angular y los tipos, `npm run test -w @resttek/web-empleados -- --include=src/app/core/auth/employee-access.spec.ts` terminó con código 0 (1 archivo, 1 prueba pasada). `npm install` desde la raíz del worktree terminó correctamente y actualizó el lockfile.

- [x] **T02 (5 min)** ~~Escribir la matriz de permisos y destinos como pruebas fallidas~~
  - Acción: ampliar las pruebas parametrizadas para los cuatro roles autorizados, cliente, rol nulo y valor desconocido. Comprobar cada vista y el destino inicial; probar que una vista desconocida no obtiene permiso.
  - Archivos o componentes: `packages/web-empleados/src/app/core/auth/employee-access.spec.ts`; contrato del nuevo `employee-access.ts` en la misma carpeta.
  - Dependencias: T01.
  - Comprobación: el comando focalizado de T01 falla por la política todavía no implementada, no por una avería del runner. Registrar el resultado rojo y las combinaciones cubiertas.
  - Evidencia TDD: se añadió el contrato tipado y un esqueleto temporal de denegación predeterminada para que el rojo mida aserciones y no un error de importación. `npm run test -w @resttek/web-empleados -- --include=src/app/core/auth/employee-access.spec.ts` terminó con código 1 por 13 aserciones de permisos/destinos autorizados; las 17 restantes pasaron, incluidas las denegaciones para cliente/rol ausente/desconocido y vista desconocida.

- [x] **T03 (5 min)** ~~Implementar una política local y tipada de acceso~~
  - Acción: definir el tipo de vista, la matriz de roles y el destino inicial mediante funciones pequeñas en un único módulo local. Denegar valores desconocidos sin recurrir a `any` ni modificar AuthStore; normalizar mediante comprobaciones en el punto de consumo. Usar los valores reales `manager` y `admin`.
  - Archivos o componentes: nuevo `packages/web-empleados/src/app/core/auth/employee-access.ts`.
  - Dependencias: T02.
  - Comprobación: todas las pruebas de T02 pasan; las nueve combinaciones de camarero/cocinero/manager y las tres de admin coinciden con la matriz del objetivo.
  - Evidencia TDD: verde — `npm run test -w @resttek/web-empleados -- --include=src/app/core/auth/employee-access.spec.ts` terminó con código 0 (30 pruebas pasadas). Se verificaron los doce permisos de camarero/cocinero/manager/admin, los destinos iniciales, roles cliente/nulo/desconocido y la denegación de una vista desconocida.

- [x] **T04 (10 min)** ~~Reproducir el bypass con pruebas de navegación del router~~
  - Acción: añadir specs con TestBed y RouterTestingHarness, o utilidades equivalentes del router instalado, ejercitando la configuración real de rutas y sustituyendo únicamente servicios externos. Cubrir las doce combinaciones de los cuatro roles y tres rutas, navegación entre hermanas con el shell activo, `/`, ausencia de sesión y roles no admitidos. Espiar la activación del componente restringido y las llamadas a su store para demostrar que no llega a inicializarse.
  - Archivos o componentes: nuevo `packages/web-empleados/src/app/app.routes.spec.ts`; `app.routes.ts` como configuración bajo prueba, AuthStore y dobles de servicios/store de pedidos.
  - Dependencias: T03.
  - Comprobación: `npm run test -w @resttek/web-empleados -- --include=src/app/app.routes.spec.ts` reproduce en rojo el acceso de camarero a cocina, el de cocinero a barra/salón y la entrada inicial incorrecta del camarero; los accesos ya permitidos siguen funcionando.
  - Evidencia TDD: rojo — el comando focalizado terminó con código 1 por 17 aserciones fallidas y 24 pruebas pasadas (sin fallos de compilación o infraestructura). Reproduce las tres rutas restringidas, redirecciones iniciales incorrectas para camarero/manager/admin, los nueve accesos de roles no admitidos y dos navegaciones entre rutas hermanas; las rutas permitidas y sesiones sin token pasan.

- [x] **T05 (10 min)** ~~Proteger todas las rutas hijas y corregir la entrada inicial~~
  - Acción: añadir un guard funcional local de rutas hijas que consulte la política, compruebe sesión y devuelva `UrlTree` al denegar, sin navegación imperativa. Conectarlo con `canActivateChild` para cubrir también cambios entre vistas con el shell activo. Sustituir el redirect fijo del hijo vacío por una redirección dependiente de la misma política, utilizando las capacidades del router instalado. Conservar `authGuard` del padre, las rutas de login y not-found y el lazy loading.
  - Archivos o componentes: nuevo `packages/web-empleados/src/app/core/auth/employee-role.guard.ts`, `packages/web-empleados/src/app/app.routes.ts` y specs de T04.
  - Dependencias: T04.
  - Comprobación: las pruebas de T04 pasan; las denegaciones terminan en la ruta acordada, no activan la página prohibida y no crean bucles. Cliente/rol ausente/desconocido terminan en `/login` sin borrar sesión; sin token termina en `/login` incluso con rol aparentemente válido.
  - Evidencia TDD: rojo — las pruebas de navegación agregadas en T04 fallaron en 17 aserciones de rutas y destinos (registrado en el commit `fd852c9`). Verde/refactor — `npm run test -w @resttek/web-empleados -- --include=src/app/app.routes.spec.ts` pasó (41 pruebas), con aserciones de que la navegación denegada no llama a `clearSession`; `npm run test -w @resttek/web-empleados` pasó (71 pruebas) y `npm run build -w @resttek/web-empleados` terminó correctamente. El guard devuelve `UrlTree` a `/login` sin sesión o con rol no admitido y a la vista inicial para camarero/cocinero; las rutas permitidas siguen lazy-loaded y no activan componentes prohibidos.
  - Nota de seguimiento: el commit `fd852c9` incluyó conjuntamente las pruebas de T04 y la primera implementación de rutas de T05. Se conserva el historial sin reescritura; este cierre registra la verificación completa y el ajuste final del guard.

- [x] **T06 (10 min)** ~~Unificar el menú con la política y conservar el aviso de restaurante~~
  - Acción: escribir primero pruebas del shell para enlaces visibles por rol y falta de restaurante; después sustituir sus comparaciones duplicadas por la política local. Incluir admin en las tres vistas y eliminar o conectar el cálculo de ruta inicial sin dejar una segunda política divergente. No modificar páginas de pedidos ni el logout.
  - Archivos o componentes: `packages/web-empleados/src/app/core/layout/shell.component.ts`, su plantilla solo si es necesario y nuevo `packages/web-empleados/src/app/core/layout/shell.component.spec.ts`.
  - Dependencias: T03.
  - Comprobación: `npm run test -w @resttek/web-empleados -- --include=src/app/core/layout/shell.component.spec.ts` pasa después de observar el fallo inicial para admin. Camarero ve barra y salón; cocinero solo cocina; manager y admin las tres. Sin restaurante se mantiene el aviso y no se renderiza una página de trabajo. Logout conserva su llamada al servicio.
  - Evidencia TDD: se escribieron primero 9 pruebas de menú, estado sin restaurante y logout. El comando focalizado pasó ya antes del refactor: los enlaces de admin se habían incorporado en el commit `fd852c9` junto con T04/T05; no se forzó un rojo artificial. Tras sustituir las comparaciones de rol por `canAccessView` y eliminar `defaultRoute` sin uso, el mismo comando pasó de nuevo (9 pruebas); confirmó camarero con barra/salón, cocinero con cocina, manager/admin con las tres, roles no admitidos sin enlaces, el mensaje y outlet ausente sin restaurante y el logout.

- [x] **T07 (5 min)** ~~Documentar la nueva restricción y cómo validarla~~
  - Acción: sustituir la nota del glosario que describe el bypass por la nueva matriz, aclarar que admin también tiene acceso a web-empleados y documentar las redirecciones. En arquitectura frontend, describir la autorización local y el comando de pruebas del paquete, distinguiéndola del `authGuard` compartido y de la autorización efectiva de la API.
  - Archivos o componentes: `docs/dominio/glosario.md`, `docs/arquitectura/arquitectura-frontend.md`.
  - Dependencias: T05, T06.
  - Comprobación: revisión del diff frente a la matriz y al código; no quedan afirmaciones de que las tres vistas se pueden abrir con cualquier sesión y no se presenta el guard frontend como sustituto de la API.
  - Evidencia: revisión de ambos documentos contra `employee-access.ts`, rutas y guards. La búsqueda de las afirmaciones obsoletas (`cualquier usuario con sesión`, bypass por URL y filtrado descrito como única protección) no encontró coincidencias; se documentaron matriz, destinos, `employeeRoleGuard`, diferencia con `authGuard`, límites frente a la API y comando de pruebas del workspace. No aplica rojo/verde por ser una tarea exclusivamente documental.

- [ ] **T08 (10 min)** Validar la integración y registrar las evidencias finales
  - Acción: ejecutar todas las pruebas del paquete y su build de producción; comprobar en navegador acceso directo, recarga y navegación interna con los roles acordados y servicios locales disponibles. Revisar el diff final y actualizar las casillas de este plan solo con evidencias obtenidas.
  - Archivos o componentes: web-empleados y este plan.
  - Dependencias: T05, T06, T07.
  - Comprobación: `npm run test -w @resttek/web-empleados` y `npm run build -w @resttek/web-empleados` terminan correctamente. Para la comprobación manual, usar `npm run dev:api` y `npm run dev:empleados` solo si no hay servicios disponibles, verificar respuesta en 3000/4201 y detener los procesos propios al terminar. No ejecutar `seed` sobre datos existentes sin autorización. Si faltan cuentas o servicios, dejar la comprobación pendiente y registrar el bloqueo.

Estimación total: **65 minutos**, sin contar bloqueos externos.

## Criterios de aceptación

- [ ] **CA01** Un camarero puede entrar a `/barra` y `/salon`, pero no a `/cocina`.
  - Verificación: pruebas parametrizadas de política y router; `/cocina` termina en `/barra` sin activar CocinaComponent ni iniciar su carga de pedidos. Comprobación manual por URL y recarga.
  - Evidencia: pendiente.
- [ ] **CA02** Un cocinero puede entrar a `/cocina`, pero ni a `/barra` ni a `/salon`.
  - Verificación: pruebas de las tres rutas; las dos denegaciones terminan en `/cocina` sin activar BarraComponent o SalonComponent. Comprobación manual por URL y recarga.
  - Evidencia: pendiente.
- [ ] **CA03** Manager y admin pueden abrir las tres vistas.
  - Verificación: seis casos de router con `restaurantId` válido; URL final y componente corresponden a la ruta solicitada. El shell muestra los tres enlaces.
  - Evidencia: pendiente.
- [ ] **CA04** La autorización se vuelve a evaluar al cambiar entre rutas hijas.
  - Verificación: router ya situado en `/barra` como camarero solicita `/cocina` y vuelve a `/barra`; router ya situado en cocina como cocinero solicita barra y salón y permanece en cocina. Probar también el cambio permitido barra→salón y el recorrido completo de manager/admin.
  - Evidencia: pendiente.
- [ ] **CA05** La entrada por `/` y la navegación a `/` posterior al login respetan el rol.
  - Verificación: router con sesiones representativas termina en barra para camarero y en cocina para cocinero/manager/admin; el login compartido sigue navegando a `/` sin cambios. No hay redirecciones repetidas ni estados de navegación bloqueados.
  - Evidencia: pendiente.
- [ ] **CA06** No hay acceso con sesión ausente o rol no admitido.
  - Verificación: cliente, rol nulo y desconocido con token, así como cada rol autorizado sin token, solicitan las tres vistas y terminan en `/login`, sin activar páginas de trabajo. Los rechazos por rol no borran la sesión y permiten salir o volver a iniciar sesión mediante la pantalla existente.
  - Evidencia: pendiente.
- [ ] **CA07** Se conserva la experiencia existente salvo los cambios expresamente acordados.
  - Verificación: specs del shell confirman enlaces por rol, aviso sin restaurante y logout; las pruebas de router comprueban `/login` y not-found para una URL inexistente. No se modifican web-shared ni otras aplicaciones.
  - Evidencia: pendiente.
- [x] **CA08** La corrección tiene validación automatizada ejecutable y compilación correcta.
  - Verificación: `npm run test -w @resttek/web-empleados` y `npm run build -w @resttek/web-empleados`, ambos con salida exitosa. Registrar resultados y advertencias; no usar `npm test` de la raíz como sustituto.
  - Evidencia: suite del paquete exitosa (2 archivos, 71 pruebas) y build de producción exitoso, ambos en el worktree de la tarea.
- [x] **CA09** La documentación representa el acceso real de las rutas.
  - Verificación: revisión de glosario y arquitectura contra la matriz y tests; se documenta la excepción admin confirmada por el usuario y se conserva la distinción entre guard frontend y autorización de la API.
  - Evidencia: glosario y arquitectura actualizados y contrastados con las pruebas del router y la política local; admin consta con acceso a las tres vistas y se aclara que la API conserva la autorización de endpoints.

## Reglas de seguimiento y finalización

- Leer el plan completo y el estado actual del proyecto antes de modificar código. Resolver con el usuario las dudas bloqueantes antes de ejecutar los pasos afectados.
- Mantener este mismo archivo como fuente del progreso. Todas las tareas empiezan con `- [ ]`; solo después de completar y comprobar una tarea, marcarla con `- [x]` y tachar su título con `~~...~~`. Ejemplo: `- [x] **T01 (10 min)** ~~Habilitar el runner Angular de pruebas de web-empleados~~`.
- Actualizar el plan a medida que se terminen las tareas, no únicamente al final. No marcar pasos pendientes, parciales o sin comprobar. Desglosar trabajo adicional necesario en tareas de 5–10 minutos y registrar las nuevas decisiones o dudas.
- Respetar las dependencias indicadas. Observar el fallo de regresión antes de implementar cada cambio de comportamiento y volver a ejecutar las pruebas después.
- Marcar cada criterio de aceptación únicamente tras verificarlo y anotar evidencia concreta: comando y resultado o comprobación manual realizada. Si una comprobación no se puede ejecutar, dejarla pendiente y explicar el bloqueo.
- Considerar terminada la implementación solo cuando todas las tareas estén completadas, todos los criterios estén verificados y no queden dudas bloqueantes. No declarar éxito con verificaciones pendientes o fallidas.
- No sobrescribir ni revertir cambios locales ajenos; si entran en conflicto con el trabajo, solicitar indicaciones.

## Dudas y preguntas pendientes

- **Ninguna duda funcional bloqueante en este momento.** El usuario confirmó redirección a vista permitida para camarero/cocinero y acceso total para admin.
- **Disponibilidad de servicios y cuentas para la validación manual:** pendiente de comprobar durante T08; no bloquea la implementación ni las pruebas automatizadas, pero sí su verificación manual y, si falta evidencia, el cierre completo. No se han verificado usuarios de prueba ni ejecutado el seed.

## Decisiones tomadas durante la planificación

- **Requisitos explícitos originales:** camarero accede solo a barra/salón; cocinero solo a cocina; gerente a todo; el fallo se corrige en web-empleados.
- **Decisiones confirmadas posteriormente por el usuario:** redirigir las denegaciones de camarero/cocinero a su vista inicial; permitir al admin las tres vistas y denegar al resto.
- **Decisión propia:** para cliente, rol ausente o desconocido, usar `/login` sin borrar sesión. Motivo: reutilizar el destino existente sin añadir pantalla ni alterar autenticación compartida. Consecuencia: el usuario deberá autenticarse con una cuenta autorizada; no se le otorgará una vista por defecto.
- **Decisión propia:** conservar `/barra` como inicio del camarero y `/cocina` para cocinero/manager; extender este último destino al admin. Motivo: aprovechar la intención del cálculo ya existente en el shell y evitar que el login envíe al camarero a una vista prohibida.
- **Decisión propia:** mantener la política y el guard de autorización en `core/auth` de web-empleados y reutilizar el AuthStore y authGuard existentes. Motivo: las reglas solo afectan a esta aplicación; no hay necesidad de cambiar contratos o comportamiento compartido.
- **Decisión propia:** usar `canActivateChild` y redirecciones declarativas. Motivo: el guard del padre puede no reevaluarse entre hermanas; no basta con ocultar enlaces o bloquear únicamente la entrada al shell.
- **Decisión propia:** habilitar únicamente el runner Angular ya disponible, siguiendo el patrón Vitest/jsdom de web-admin, sin crear infraestructura end-to-end adicional. Motivo: el paquete no tiene tests ejecutables y la regresión requiere probar navegación real, no solo una tabla de roles.
- **Límite técnico explícito:** esta corrección controla la navegación y activación de vistas en el frontend; no garantiza autorización frente a manipulación del almacenamiento local ni sustituye los controles de la API. Cambiar ese límite requeriría otro alcance.
