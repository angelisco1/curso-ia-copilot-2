# RestTek - Web Admin

Panel de administración Angular para gestionar restaurantes, platos, ingredientes y empleados.

## Requisitos

- Node.js 22+
- npm 10+

## Instalación

```bash
npm install
```

## Desarrollo

Para iniciar el servidor de desarrollo:

```bash
npm start
```

La aplicación estará disponible en `http://localhost:4200`

## Funcionalidades

### Dashboard
Vista general con el listado de restaurantes.

### Restaurantes
- Listado, alta y edición de restaurantes.
- Cada restaurante tiene su propio dashboard con accesos a platos, ingredientes y empleados.

### Platos
- CRUD de platos por restaurante: nombre, descripción, precio, categoría (entrante, principal, postre, bebida), disponibilidad e ingredientes asociados.

### Ingredientes
- CRUD de ingredientes por restaurante: nombre, unidad y stock.

### Empleados
- Alta y listado de empleados por restaurante.
- Roles asignables desde el formulario: `manager`, `camarero`, `cocinero`.

## Regresión: cambio de restaurante

1. Inicia la API y web-admin desde la raíz (`npm run dev:api` y `npm run dev:admin`). Si faltan los datos de ejemplo, ejecuta `npm run seed`; accede con `admin@resttek.com` como usuario y contraseña.
2. Abre `/restaurants/rest-1/ingredients` y cambia desde el menú a Ingredientes de `rest-2`; vuelve después a `rest-1`. Repite el recorrido con Platos. En cada transición, comprueba que la URL y las filas corresponden al restaurante seleccionado, sin recargar la página. Los datos de ejemplo distinguen los restaurantes: `rest-2` incluye Harina, Levadura y Tomate triturado.
3. Abre directamente ambos listados y prueba atrás/adelante y salir/volver a cada sección. Debe haber una carga por entrada o cambio efectivo, sin filas anteriores durante la carga ni peticiones duplicadas.
4. Con las respuestas de red interceptadas, comprueba los estados vacío, HTTP 500 y recuperación, además de respuestas retrasadas fuera de orden (`rest-1 → rest-2` y `rest-1 → rest-2 → rest-1`). Solo la última carga debe determinar las filas, el error y el estado de carga.
5. Tras cambiar a `rest-2`, comprueba que los enlaces de alta/edición y las peticiones de guardado, borrado y disponibilidad usan ese restaurante; el formulario de platos debe cargar sus ingredientes. Intercepta las escrituras para no modificar datos reales.
6. Ejecuta las pruebas y la compilación del paquete:

   ```bash
   npm run test -w @resttek/web-admin
   npm run build -w @resttek/web-admin
   ```

## Estructura del Proyecto

```
src/app/
├── core/
│   └── layout/            # Shell component (sidebar + navegación) y página 404
└── features/
    ├── dashboard/          # Vista general
    ├── restaurants/        # models/services/store/pages: listado, alta, edición, dashboard por restaurante
    ├── dishes/             # models/services/store/pages: CRUD de platos
    ├── ingredients/        # models/services/store/pages: CRUD de ingredientes
    └── employees/          # models/services/store/pages: alta y listado de empleados
```

## Build

Para hacer build de producción:

```bash
npm run build
```

Los archivos generados estarán en `dist/web-admin/browser/`
