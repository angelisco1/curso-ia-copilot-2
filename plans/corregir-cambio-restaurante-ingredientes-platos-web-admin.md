# Plan: corregir la carga de ingredientes y platos al cambiar de restaurante en web-admin

## Objetivo

Al navegar desde Ingredientes del restaurante 1 a Ingredientes del restaurante 2, mostrar los ingredientes del restaurante 2 sin recargar la página. Aplicar el mismo comportamiento a Platos y mantener las acciones del listado vinculadas al restaurante de la URL actual.

## Alcance

### Incluido

- Reaccionar al cambio de `restaurantId` mientras Angular reutiliza el componente del listado.
- Actualizar el identificador empleado por las acciones del listado.
- Impedir que respuestas anteriores sobrescriban los datos, el error o el estado de carga de la petición vigente.
- Conservar los estados actuales de carga, error y lista vacía, así como los enlaces de alta y edición.
- Verificar la navegación en ambos sentidos, los cambios rápidos y las acciones existentes.
- Documentar el contrato de navegación y el procedimiento de regresión.
- Añadir pruebas unitarias persistentes en web-admin para los cambios de parámetro y sus acciones.

### Fuera de alcance

- Cambios en API, contratos HTTP, permisos o reglas del dominio.
- Corregir otros contextos, dashboards o la reutilización entre formularios.
- Cambiar la estrategia global de reutilización de rutas o forzar recargas completas.
- Refactorizaciones generales, caché por restaurante o cambios en la estrategia global de pruebas del monorepo.
- Implementar el arreglo durante esta planificación.

## Contexto comprobado

- El usuario informa de que los datos del restaurante anterior permanecen al cambiar de restaurante en la misma sección. No se ha reproducido todavía en navegador.
- [Las rutas principales](../packages/web-admin/src/app/app.routes.ts) sitúan ambas secciones bajo `restaurants/:restaurantId`. [Las rutas de ingredientes](../packages/web-admin/src/app/features/ingredients/ingredients.routes.ts) y [las de platos](../packages/web-admin/src/app/features/dishes/dishes.routes.ts) cargan sus listados en el hijo de ruta vacía.
- [El menú lateral](../packages/web-admin/src/app/core/layout/shell.component.html) navega mediante `routerLink` a cada sección del restaurante elegido.
- [IngredientListComponent](../packages/web-admin/src/app/features/ingredients/pages/ingredient-list/ingredient-list.component.ts) y [DishListComponent](../packages/web-admin/src/app/features/dishes/pages/dish-list/dish-list.component.ts) leen `route.parent?.snapshot.params['restaurantId']` y cargan únicamente en `ngOnInit`. No se suscriben a cambios posteriores del parámetro.
- La explicación probable es la reutilización del componente al cambiar solamente el parámetro. Debe confirmarse en T01 junto con el nivel efectivo de `ActivatedRoute` que expone el identificador; no basta con sustituir `snapshot` sin comprobarlo.
- [IngredientStore](../packages/web-admin/src/app/features/ingredients/store/ingredient.store.ts) y [DishStore](../packages/web-admin/src/app/features/dishes/store/dish.store.ts) son servicios raíz con signals y `firstValueFrom`. Cada respuesta modifica el estado sin comprobar si pertenece a la carga vigente. El primero guarda `_currentRestaurantId`, pero no lo utiliza como protección.
- Los servicios ya reciben el restaurante explícitamente y construyen `/restaurants/${restaurantId}/ingredients` o `/restaurants/${restaurantId}/dishes`: [IngredientService](../packages/web-admin/src/app/features/ingredients/services/ingredient.service.ts) y [DishService](../packages/web-admin/src/app/features/dishes/services/dish.service.ts).
- Las plantillas muestran primero carga, después error, después estado vacío o tabla: [ingredientes](../packages/web-admin/src/app/features/ingredients/pages/ingredient-list/ingredient-list.component.html) y [platos](../packages/web-admin/src/app/features/dishes/pages/dish-list/dish-list.component.html). No debe aparecer la tabla anterior durante una carga del nuevo restaurante.
- [DishFormComponent](../packages/web-admin/src/app/features/dishes/pages/dish-form/dish-form.component.ts) también consume `IngredientStore`; [IngredientFormComponent](../packages/web-admin/src/app/features/ingredients/pages/ingredient-form/ingredient-form.component.ts) y el formulario de platos actualizan sus stores tras guardar. Debe conservarse ese uso.
- [La arquitectura frontend](../docs/arquitectura/arquitectura-frontend.md) prescribe componentes que consumen stores con signals. No se ha encontrado un patrón reactivo de parámetros existente en el código de web-admin consultado.
- [El paquete web-admin](../packages/web-admin/package.json) permite `build`, `start` y `watch`, pero no tiene script `test`. [Su configuración Angular](../packages/web-admin/angular.json) tampoco define un target de pruebas, y no se han encontrado archivos de pruebas en el paquete. `npm test` en la raíz valida únicamente la API.
- Comandos disponibles comprobados en los manifiestos: `npm run dev:api`, `npm run dev:admin` y `npm run build -w @resttek/web-admin`. No se han ejecutado durante la planificación.
- [El README raíz](../README.md) documenta los datos de ejemplo `rest-1` y `rest-2` y el acceso de administrador. La disponibilidad actual de esos datos y de los servicios queda pendiente de comprobar.

## Tareas

- [x] **T01 (10 min)** ~~Reproducir ambos fallos y confirmar la fuente reactiva del identificador~~
  - Archivos o componentes: rutas principales, rutas de ambas features, menú lateral y ambos listados.
  - Acción: con API y admin disponibles, navegar de `rest-1` a `rest-2` y de vuelta dentro de cada sección. Registrar URL, peticiones GET y datos visibles; confirmar qué ruta ancestral contiene `restaurantId` y si se reutiliza el listado.
  - Dependencias: ninguna.
  - Comprobación: disponer de evidencia del fallo anterior al cambio y del parámetro que debe observarse. Si el diagnóstico no coincide, ajustar este plan antes de modificar código.
  - Evidencia: con API (`GET /health` → 200), web-admin en `localhost:4200` y sesión de administrador, recargar `/restaurants/rest-1/ingredients` produjo `GET /api/v1/restaurants/rest-1/ingredients`. Cambiar por el menú a `rest-2` y volver a `rest-1` produjo 0 GETs; las cinco filas de `rest-1` permanecieron bajo ambas URL. En Platos se comprobó lo mismo en ambos sentidos: la entrada directa produjo el GET de `rest-1` y los cambios de restaurante no produjeron GETs; las cinco filas de `rest-1` permanecieron. No se modificaron datos. La primera carga confirma que el `restaurantId` del `snapshot` leído desde `route.parent` llega al servicio; la jerarquía efectiva es `restaurants/:restaurantId` → `dishes`/`ingredients` (carga diferida) → ruta vacía del listado. Los enlaces se actualizan con la URL, pero el listado conserva los datos y la instancia visual, consistente con la reutilización del componente. Como el cambio no solicitó la respuesta de `rest-2`, sus datos correctos no se conocieron hasta la verificación posterior de T02. T01 es diagnóstico: rojo/verde no aplica.

- [x] **T02 (20 min)** ~~Hacer reactiva la carga del listado de ingredientes y habilitar pruebas frontend~~
  - Archivos o componentes: `package.json`, `package-lock.json`, `packages/web-admin/angular.json`, `packages/web-admin/package.json`, `packages/web-admin/tsconfig.spec.json`, `packages/web-admin/src/app/features/ingredients/pages/ingredient-list/ingredient-list.component.spec.ts` y `packages/web-admin/src/app/features/ingredients/pages/ingredient-list/ingredient-list.component.ts`.
  - Acción: habilitar pruebas unitarias de web-admin con `@angular/build:unit-test`, Vitest 4 y jsdom. Vitest 4 debe estar disponible desde la raíz para la resolución del builder de Angular; conservar la versión 3 del runner declarada por API y no añadir un script global. Escribir primero una prueba de regresión para la secuencia de parámetros, carga única y acciones, y ejecutarla contra el componente actual. Después observar el `paramMap` del nivel confirmado en T01, omitir emisiones repetidas del mismo identificador y sincronizar `restaurantId` antes de solicitar la carga. Liberar la suscripción al destruir el componente con `takeUntilDestroyed` y un contexto de inyección válido. Conservar la acción de borrado y no introducir una segunda carga inicial.
  - Dependencias: T01.
  - Comprobación: `npm run test -w @resttek/web-admin` pasa; la prueba verifica que `rest-1 → rest-2 → rest-1` produce una carga inicial y una carga por cambio efectivo, que las emisiones repetidas se omiten, que borrado usa el restaurante vigente y que destruir el componente termina la suscripción.
  - Evidencia: Rojo: `npm run test -w @resttek/web-admin` compiló con Vitest 4.1.12 y falló por la causa esperada en 2 de 3 tests: los cambios de parámetro no provocaban cargas y el borrado seguía usando `rest-1`. Verde: el mismo comando pasó los 3 tests tras observar `parent.paramMap`, filtrar IDs repetidos y finalizar la suscripción al destruirse el componente. `npm test` pasó los 66 tests de API en 10 archivos con Vitest 3.2.7. `npm run build -w @resttek/web-admin` terminó correctamente. Verificación en navegador: desde `rest-1`, el menú emitió GETs para `/api/v1/restaurants/rest-2/ingredients` y al volver para `/api/v1/restaurants/rest-1/ingredients`, sin recarga completa; se vieron respectivamente `Harina`, `Levadura` y `Tomate triturado` (3 filas), y las cinco filas de `rest-1`. No se modificaron datos.

- [ ] **T03 (10 min)** Hacer reactiva la carga del listado de platos
  - Archivos o componentes: `packages/web-admin/src/app/features/dishes/pages/dish-list/dish-list.component.ts`.
  - Acción: aplicar el mismo patrón de observación y limpieza, actualizando el identificador empleado por borrado y disponibilidad. Mantener formato de precio, categorías y enlaces relativos.
  - Dependencias: T01, T02, para mantener el mismo patrón local en ambas pantallas.
  - Comprobación: entrada directa y navegación en ambos sentidos muestran los platos correctos; no hay duplicación de la carga inicial y las acciones apuntan al restaurante actual.

- [ ] **T04 (10 min)** Aislar el resultado de la carga vigente en IngredientStore
  - Archivos o componentes: `packages/web-admin/src/app/features/ingredients/store/ingredient.store.ts`.
  - Acción: identificar cada invocación de carga con una secuencia o token local y permitir que solo la vigente publique datos, error y finalización. No usar únicamente el restaurante como identidad, porque `A → B → A` puede dejar dos peticiones de A pendientes. Evitar exponer ingredientes anteriores al cambiar de restaurante y mantener los mensajes existentes.
  - Dependencias: T01, T02, para reutilizar la infraestructura de pruebas frontend.
  - Comprobación: con respuestas controladas fuera de orden, una carga anterior no altera datos, error ni `loading` de la última. Comprobar también la carga desde el formulario de platos.

- [ ] **T05 (10 min)** Aislar el resultado de la carga vigente en DishStore
  - Archivos o componentes: `packages/web-admin/src/app/features/dishes/store/dish.store.ts`.
  - Acción: aplicar la misma protección local de vigencia que en ingredientes, sin cambiar firmas públicas ni el comportamiento de las operaciones CRUD.
  - Dependencias: T04, para conservar el mismo mecanismo en ambos stores.
  - Comprobación: peticiones de platos resueltas fuera de orden, tanto con éxito como con error, no sustituyen el estado de la carga más reciente.

- [ ] **T06 (10 min)** Ejecutar la matriz de regresión de navegación y concurrencia
  - Archivos o componentes: ambos listados, ambos stores y consumidores de formularios; criterios CA01–CA06.
  - Acción: usar datos distinguibles por restaurante. Probar navegación lateral y atrás/adelante, respuesta vacía, fallo de carga y recuperación. Con interceptación de red en navegador, retrasar respuestas para reproducir `A → B` y `A → B → A`, incluyendo errores antiguos y una petición vigente todavía pendiente. Verificar borrado y disponibilidad con respuestas simuladas o datos de prueba autorizados.
  - Dependencias: T02, T03, T04, T05.
  - Comprobación: registrar escenarios, orden de respuestas y resultados visibles en la evidencia de los criterios. Sin runner frontend configurado, no presentar pruebas de API como cobertura de esta regresión.

- [ ] **T07 (10 min)** Documentar la regresión y validar la compilación Angular
  - Archivos o componentes: `packages/web-admin/README.md`, este plan y el paquete `@resttek/web-admin`.
  - Acción: añadir un procedimiento breve de regresión del cambio de restaurante y su resultado esperado al README del paquete. Ejecutar `npm run build -w @resttek/web-admin`; revisar el diff para confirmar que no cambia API ni configuración global de rutas.
  - Dependencias: T06.
  - Comprobación: compilación correcta, procedimiento reproducible y evidencia de todos los criterios registrada. Cualquier fallo o limitación queda explícito y pendiente; no se oculta con un resultado de otra suite.

Estimación total: 70 minutos, sin incluir esperas por servicios o preparación externa de datos.

## Criterios de aceptación

- [x] **CA01** Ingredientes cambia al restaurante de la URL sin recarga completa.
  - Verificación: desde `restaurants/rest-1/ingredients`, abrir Ingredientes de `rest-2` en el menú lateral y volver a `rest-1`. Comprobar un GET por cambio efectivo y que nombres/identificadores visibles corresponden exclusivamente a la respuesta del restaurante elegido.
  - Evidencia: navegador local confirmó un GET por transición a cada restaurante; `rest-2` mostró Harina, Levadura y Tomate triturado, y `rest-1` mostró Tomate, Queso mozzarella, Aceite de oliva, Ajo y Albahaca. La URL cambió sin recarga completa.
- [ ] **CA02** Platos cambia al restaurante de la URL sin recarga completa.
  - Verificación: repetir CA01 con `restaurants/rest-1/dishes` y `restaurants/rest-2/dishes`, comparando filas con cada respuesta.
  - Evidencia: pendiente.
- [ ] **CA03** Los estados vacío, carga y error no muestran registros del restaurante anterior.
  - Verificación: para cada listado, pasar de un restaurante con datos a otro cuya respuesta se retrase, devuelva `[]` o falle con HTTP 500. Observar respectivamente indicador de carga, mensaje vacío o mensaje de error existente, nunca la tabla anterior. Volver a uno con respuesta correcta y comprobar la recuperación.
  - Evidencia: pendiente.
- [ ] **CA04** Solo la carga más reciente puede modificar datos, error y estado de carga.
  - Verificación: en ambas secciones, interceptar peticiones para resolver `A → B` y `A → B → A` fuera de orden. Entregar éxitos y errores antiguos antes y después de la respuesta vigente. Mientras esta siga pendiente, `loading` permanece activo; al terminar, solo su resultado determina la pantalla.
  - Evidencia: pendiente.
- [ ] **CA05** Las acciones y enlaces conservan el restaurante actual.
  - Verificación: tras cambiar a B, comprobar enlaces de alta/edición bajo `/restaurants/B/...`, DELETE de ingredientes y platos bajo B y PUT de disponibilidad bajo B con el nuevo valor esperado. Usar interceptación o datos de prueba autorizados, sin modificar datos reales. Comprobar que guardar y volver desde los formularios sigue mostrando la lista del restaurante correcto y que el formulario de platos carga sus ingredientes.
  - Evidencia: pendiente.
- [ ] **CA06** La entrada directa y el historial siguen funcionando sin cargas duplicadas por suscripciones acumuladas.
  - Verificación: abrir directamente cada listado, navegar varias veces mediante atrás/adelante y salir/volver a la sección. Comprobar una carga inicial por instancia y una por cambio efectivo de restaurante, sin incremento progresivo de peticiones.
  - Evidencia: pendiente.
- [ ] **CA07** El paquete compila y la regresión queda documentada.
  - Verificación: `npm run build -w @resttek/web-admin` termina con código 0; el README del paquete recoge los pasos de cambio entre restaurantes y el diff no incluye alteraciones ajenas al arreglo.
  - Evidencia: pendiente.

## Reglas de seguimiento y finalización

- Leer el plan completo y el estado actual del proyecto antes de modificar código. Resolver con el usuario las dudas bloqueantes antes de ejecutar los pasos afectados.
- Mantener este archivo como fuente del progreso. Todas las tareas empiezan con `- [ ]`; solo después de completar y comprobar una tarea, marcarla con `- [x]` y tachar su título con `~~...~~`. Ejemplo: `- [x] **T01 (10 min)** ~~Reproducir ambos fallos y confirmar la fuente reactiva del identificador~~`.
- Actualizar el plan a medida que se terminen las tareas, no únicamente al final. No marcar como completados pasos pendientes, parcialmente implementados o sin comprobar. Desglosar cualquier trabajo necesario adicional en pasos de 5–10 minutos y registrar las nuevas decisiones o dudas.
- Marcar cada criterio de aceptación únicamente tras verificarlo y anotar evidencia concreta: comando y resultado, o escenario manual ejecutado. Si una comprobación no puede ejecutarse, dejarla pendiente y explicar el bloqueo.
- Considerar terminada la implementación solo cuando todas las tareas estén completadas, todos los criterios verificados y no queden dudas bloqueantes. No declarar éxito con verificaciones pendientes o fallidas.

## Dudas y preguntas pendientes

- No hay ambigüedades funcionales que requieran una decisión del usuario para iniciar el arreglo.
- Pendiente técnico: confirmar en T01 la reutilización y el nivel real del parámetro en la ruta activada. Bloquea T02 y T03 hasta comprobarlo; no bloquea la planificación.
- Verificación operativa: API, admin y datos diferenciados de `rest-1` y `rest-2` disponibles en el entorno local; se usaron solo GETs, sin ejecutar el seed ni modificar datos. Para T06 siguen pendientes las respuestas retrasadas, errores y escenarios concurrentes, que deberán probarse con interceptación local.
- Decisión pendiente resuelta: el usuario autorizó incorporar un runner frontend y ampliar el plan antes de modificar producción. T02 configura el builder de pruebas de Angular con Vitest y jsdom; `npm test` de la raíz conserva su alcance exclusivo de API.

## Decisiones tomadas durante la planificación

- Observar cambios de parámetros en los listados en lugar de desactivar globalmente la reutilización: aborda la causa probable y conserva la navegación Angular existente. Depende de confirmar el diagnóstico en T01.
- Incluir protección contra respuestas obsoletas: al introducir recargas por cambio de restaurante, las carreras de solicitudes quedan directamente ligadas al arreglo. La identidad será por carga, no solo por restaurante.
- Mantener la arquitectura componente → store → service y evitar abstracciones compartidas nuevas: solo existen dos listados afectados y no se necesita modificar otros paquetes.
- Usar regresión de navegador documentada y compilación con las herramientas existentes, sin añadir dependencias de pruebas por iniciativa propia. Consecuencia: las evidencias de navegador deberán ejecutarse y registrarse explícitamente; el build por sí solo no acredita el arreglo.
- Limitar la documentación al README de web-admin y al seguimiento en este plan: no cambian los contratos ni la arquitectura del dominio.
- El requisito explícito del usuario es corregir ambos listados al cambiar de restaurante. Las medidas de concurrencia, limpieza de suscripciones y matriz de regresión son decisiones técnicas para hacerlo fiable, no funcionalidades adicionales solicitadas.
- Por autorización del usuario, T02 añade soporte de pruebas unitarias local a web-admin para practicar TDD y conservar cobertura automatizada de la navegación reactiva. No se amplía ni se altera el runner de la API.
