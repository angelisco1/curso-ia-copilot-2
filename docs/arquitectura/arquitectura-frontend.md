# Arquitectura del frontend

Los frontends de Resttek usan **Angular 21** con las funcionalidades más modernas: standalone components, signals, zoneless change detection y functional guards/interceptors.

---

## Stack Frontend

| Tecnología | Uso |
| --- | --- |
| Angular 21 | Framework principal |
| Standalone Components | Sin NgModules |
| Signals | Estado reactivo (reemplaza a RxJS en estado) |
| Zoneless | Sin `zone.js` en ningún paquete |
| Lucide Angular | Iconos |
| RxJS | Solo para HTTP. En `web-admin` y `web-empleados`, casi siempre envuelto en `firstValueFrom` dentro de un store; en `web-clientes`, los componentes consumen los `Observable` directamente con `.subscribe()` (ver "Gestión de Estado") |

---

## Estructura de un Frontend

Las tres aplicaciones son feature-based, pero **no comparten la misma estructura**.

### `web-admin` y `web-empleados`

Cada feature es autocontenida y se subdivide por tipo de fichero:

```
src/app/
├── app.component.ts       → Componente raíz (<router-outlet>)
├── app.config.ts          → Providers (DI, router, HTTP, interceptors)
├── app.routes.ts          → Rutas principales con lazy loading
├── core/
│   └── layout/            → Shell y not-found
└── features/
    └── <feature>/
        ├── <feature>.routes.ts
        ├── models/        → Interfaces y DTOs
        ├── pages/         → Componentes de página
        ├── services/      → Llamadas HTTP
        └── store/         → Estado con signals
```

### `web-clientes`

Es más pequeña y centraliza modelos y servicios en `core/` en vez de repartirlos por feature. Sus features son componentes sueltos, sin subcarpetas:

```
src/app/
├── app.ts                 → Componente raíz, se llama App (no AppComponent)
├── app.config.ts
├── app.routes.ts
├── core/
│   ├── guards/            → table-session.guard.ts
│   ├── layout/            → shell.component.ts
│   ├── models/            → api-error, dish, order, restaurant, table
│   ├── services/          → dish, order, restaurant, table
│   └── store/             → cart.store.ts, table-session.store.ts
└── features/
    ├── cart/cart.component.ts
    ├── menu/restaurant-menu.component.ts
    ├── orders/my-orders.component.ts
    ├── orders/order-detail.component.ts
    ├── restaurants/restaurant-list.component.ts
    └── tables/table-selection.page.ts
```

### Mesas en cada aplicación

Cada app tiene sus propios modelos y servicio HTTP de mesas, sin importarlos de otra app ni de `web-shared`. El contrato común es el de la API ([tables.openapi.yaml](../../packages/api/docs/tables.openapi.yaml)).

| App | Dónde | Qué hace |
| --- | --- | --- |
| `web-admin` | `features/tables/` (models, services, store, pages `table-list` y `table-form`) | CRUD de mesas bajo `restaurants/:restaurantId/tables`. Las rutas llevan `adminGuard` (`core/auth/admin.guard.ts`), así que un manager no entra ni con la URL directa. `TableStore` descarta respuestas tardías de otro restaurante. Antes de borrar avisa de que se cierra la ocupación y se conservan los pedidos |
| `web-empleados` | `features/tables/` (models, services `table` y `restaurant`, store, componente `table-orders`) y la página de salón | Salón muestra todas las mesas con su estado, permite cambiarlo con confirmación al cerrar una ocupación, y abre el detalle de pedidos de la visita actual. Mantiene el panel de ítems `listo` para entregar. Admin, sin restaurante asignado, elige uno en salón |
| `web-clientes` | `core/` (model, service, `TableSessionStore`, `tableSessionGuard`) y `features/tables/table-selection.page.ts` | Paso previo a la carta: número de personas, mesas disponibles y confirmación. El guard protege la carta. El carrito se vincula a la ocupación y el pedido se envía con `tableSessionId` |

Ninguna de las tres aplicaciones tiene carpeta `shared/` propia: lo compartido vive en `@resttek/web-shared`.

---

## Gestión de Estado: el patrón Store

Es el patrón estándar en **`web-admin` y `web-empleados`**: cada feature con datos remotos tiene su store, un servicio `providedIn: 'root'` con signals privadas expuestas como solo lectura:

```tsx
@Injectable({ providedIn: 'root' })
export class DishStore {
    private readonly service = inject(DishService)

    private readonly _dishes = signal<Dish[]>([])
    private readonly _loading = signal(false)
    private readonly _error = signal<string | null>(null)

    readonly dishes = this._dishes.asReadonly()
    readonly loading = this._loading.asReadonly()
    readonly error = this._error.asReadonly()

    async loadByRestaurant(restaurantId: string): Promise<void> {
        this._loading.set(true)
        this._error.set(null)
        try {
            this._dishes.set(await firstValueFrom(this.service.getAll(restaurantId)))
        } catch {
            this._error.set('No se pudieron cargar los platos.')
        } finally {
            this._loading.set(false)
        }
    }
}
```

**Convenciones (`web-admin` / `web-empleados`):**

- El store consume el service (que devuelve `Observable`) y lo convierte con `firstValueFrom`. Los componentes solo hablan con el store.
- El trío `loading` / `error` / datos se repite en todos.
- Tras crear o actualizar, el store actualiza la lista en memoria con `.update()` en vez de recargar.

Caso particular en `web-empleados`:

- `OrderStore` añade **polling cada 30 s** con `startPolling()` / `stopPolling()`, ya que la API no tiene websockets.
- `TableStore` de mesas sigue el mismo polling de 30 s, con un único intervalo que se reinicia al cambiar de restaurante y se detiene al salir de salón. Descarta respuestas tardías de otro restaurante, mesa u ocupación, y no actualiza el estado de una mesa hasta que la API confirma el cambio.

### `web-clientes`: el patrón Store casi no se usa

En `web-clientes` el patrón Store **no es la norma**. Hay dos stores:

- `CartStore`, puramente local (sin HTTP). Vincula el carrito al restaurante y a la ocupación activa: lo vacía si añades un plato de otro restaurante o si cambia la visita, aunque sea en el mismo restaurante.
- `TableSessionStore`, que guarda la ocupación del cliente consultándola siempre a la API (`GET .../table-sessions/current`), sin usar `localStorage` como fuente de verdad. Así, al recargar o volver de otro restaurante se recupera la misma mesa. Salir o cambiar de restaurante nunca libera la mesa. La ocupación en memoria va ligada al id del usuario, así que otro usuario que inicie sesión no la hereda.

Para todo lo demás (restaurantes, carta/platos, confirmación y consulta de pedidos) los componentes de `features/` inyectan el `*Service` correspondiente directamente y llaman a sus métodos con `.subscribe({ next, error })`, sin pasar por ningún store ni por `firstValueFrom`:

- `restaurant-list.component.ts` → `RestaurantService.getAll()`
- `restaurant-menu.component.ts` → `RestaurantService.getById()` y `DishService.getByRestaurant()`
- `cart.component.ts` (`confirmOrder()`) → `OrderService.createOrder()`
- `my-orders.component.ts` → `OrderService.getMyOrders()`, con **polling cada 10 s** mediante `setInterval`/`clearInterval` en el propio componente
- `order-detail.component.ts` → `OrderService.getOrderById()`, con **polling cada 5 s**, también con `setInterval`/`clearInterval` en el propio componente

---

## Librería Compartida: `@resttek/web-shared`

Centraliza todo lo que comparten los 3 frontends:

```
web-shared/src/
├── index.ts                  → Barrel exports
└── lib/
    ├── tokens.ts             → InjectionToken API_URL
    ├── auth/
    │   ├── auth.service.ts   → Login, register, logout
    │   ├── auth.store.ts     → Signal-based state (token, user)
    │   └── auth.guard.ts     → Protección de rutas
    ├── http/
    │   ├── auth.interceptor.ts   → Añade Bearer token
    │   └── error.interceptor.ts  → Maneja 401 → redirect login
    ├── components/
    │   ├── login/            → Componente de login reutilizable
    │   └── register/         → Componente de registro
    ├── assets/images/        → Imágenes copiadas al build de cada app
    └── styles/
        └── base.css          → Design system (ver aviso más abajo)
```

El paquete se consume **directamente desde el fuente**: su `package.json` apunta `main` a `src/index.ts`, sin paso de compilación. Por eso los cambios en `web-shared` requieren reiniciar el dev server del frontend.

### Exports de la Librería

```tsx
export * from './lib/tokens'
export * from './lib/auth/auth.service'
export * from './lib/auth/auth.store'
export * from './lib/auth/auth.guard'
export * from './lib/http/auth.interceptor'
export * from './lib/http/error.interceptor'
export * from './lib/components/login/login.component'
export * from './lib/components/register/register.component'
```

---

## Sistema de Autenticación

### AuthStore (Signal-based)

Estado global de autenticación usando **Angular Signals**:

```tsx
@Injectable({ providedIn: 'root' })
export class AuthStore {
    private readonly _token = signal<string | null>(localStorage.getItem('auth_token'))
    private readonly _user = signal<any>(JSON.parse(localStorage.getItem('auth_user') || 'null'))

    readonly token = this._token.asReadonly()
    readonly user = this._user.asReadonly()
    readonly isAuthenticated = computed(() => this._token() !== null)
    readonly userRole = computed(() => this._user()?.role ?? null)

    setSession(token, user) { /* localStorage + signals */ }
    clearSession() { /* limpiar localStorage + signals */ }
}
```

### AuthService

Gestiona login y registro llamando a la API:

```tsx
@Injectable({ providedIn: 'root' })
export class AuthService {
    async login(email, password) {
        const response = await firstValueFrom(
            this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, { email, password })
        )
        this.store.setSession(response.token, response.employee)
    }
}
```

### AuthGuard

Functional guard que redirige a `/login` si no hay sesión:

```tsx
export const authGuard: CanActivateFn = () => {
    const auth = inject(AuthStore)
    const router = inject(Router)
    if (auth.isAuthenticated()) return true
    return router.createUrlTree(['/login'])
}
```

En `web-empleados`, `authGuard` protege el shell frente a sesiones ausentes. La autorización local por rol se aplica adicionalmente en sus rutas hijas; no es una responsabilidad del guard compartido.

---

## Interceptors HTTP

### Auth Interceptor

Añade automáticamente el token JWT a cada petición:

```tsx
export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const token = inject(AuthStore).token()
    if (!token) return next(req)
    return next(req.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
    }))
}
```

### Error Interceptor

Intercepta respuestas 401 y redirige al login:

```tsx
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
    return next(req).pipe(
        catchError(error => {
            if (error.status === 401) {
                auth.clearSession()
                router.navigate(['/login'])
            }
            return throwError(() => error)
        })
    )
}
```

---

## Inyección del API_URL

Se usa un `InjectionToken` para configurar la URL base de la API:

```tsx
// web-shared/tokens.ts
export const API_URL = new InjectionToken<string>('API_URL')

// app.config.ts de cada frontend
providers: [
    { provide: API_URL, useValue: environment.apiUrl },
    // ...
]
```

En los tres `environment.ts` el valor es `'/api/v1'` (ruta relativa que resuelve el proxy), tanto en desarrollo como en producción.

> **Uso desigual.** Las tres apps proveen el token, pero solo lo **inyectan** los servicios de `web-clientes` y el `AuthService` de `web-shared`. Los servicios de `web-admin` y `web-empleados` importan `environment.apiUrl` directamente:
>
> ```tsx
> // web-clientes: inyecta el token
> private readonly apiUrl = inject(API_URL)
>
> // web-admin / web-empleados: importa el environment
> private readonly baseUrl = `${environment.apiUrl}/restaurants`
> ```
>
> El resultado es el mismo, pero solo la primera forma es sustituible en tests.

---

## Routing y Lazy Loading

Las rutas usan **lazy loading** con `loadComponent` y `loadChildren`:

```tsx
export const routes: Routes = [
    {
        path: 'login',
        loadComponent: () => import('@resttek/web-shared').then(m => m.LoginComponent)
    },
    {
        path: '',
        loadComponent: () => import('./core/layout/shell.component').then(m => m.ShellComponent),
        canActivate: [authGuard],
        children: [
            {
                path: 'restaurants',
                loadChildren: () => import('./features/restaurants/restaurants.routes')
                    .then(m => m.RESTAURANT_ROUTES)
            }
        ]
    }
]
```

El lazy loading **no es universal**: `web-clientes` carga `LoginComponent` y `RegisterComponent` de forma eager con `component:`, y `web-empleados` hace lo mismo con su `ShellComponent`.

`web-clientes` tampoco define ruta comodín `**`, así que una URL desconocida no muestra un "no encontrado".

En `web-clientes`, el listado de restaurantes lleva a `restaurants/:id/tables` (selección de mesa) y la carta sigue en `restaurants/:id`, protegida por `tableSessionGuard`. El guard consulta la ocupación propia en el servidor y, si no hay, redirige a la selección de mesa. Como esa ruta no lleva el guard, no hay bucles. Si `POST /orders` responde con un error de ocupación (`TableSession*`), el carrito muestra el motivo, se vacía para no reenviarse a otra mesa y vuelve a la selección. Ante un fallo de red o un error del servidor conserva los productos para reintentar.

### Autorización de navegación (web-empleados)

`core/auth/employee-access.ts` es la política local compartida por el `employeeRoleGuard` de las rutas hijas y por los enlaces del `ShellComponent`. El guard se ejecuta en acceso directo y navegación entre rutas hijas, y devuelve una redirección: camarero vuelve a `/barra`, cocinero a `/cocina`, y manager/admin pueden permanecer en cualquiera de las vistas. Cliente, rol ausente/desconocido o sesión ausente se envían a `/login`. La ruta raíz (`/`), incluida la usada por el login compartido tras autenticarse, se resuelve según el rol.

| Rol | `/barra` | `/salon` | `/cocina` | Inicio |
| --- | --- | --- | --- | --- |
| `camarero` | Sí | Sí | No | `/barra` |
| `cocinero` | No | No | Sí | `/cocina` |
| `manager` | Sí | Sí | Sí | `/salon` |
| `admin` | Sí | Sí | Sí | `/salon` |
| `cliente`, ausente o desconocido | No | No | No | `/login` |
| Sin sesión | No | No | No | `/login` |

El rol de gerente se almacena como `'manager'`, no como `'gerente'`. Esta política protege la navegación y activación de vistas en el frontend; no es una frontera de seguridad ni sustituye la autorización que la API aplica a sus endpoints. La suite del paquete se ejecuta con `npm run test -w @resttek/web-empleados` (no con el `npm test` de la raíz, que ejecuta las pruebas de la API).

`ShellComponent` deja entrar al admin aunque no tenga restaurante asignado, para que lo elija en salón. Para el resto de roles se mantiene el aviso «Sin restaurante asignado». En cocina y barra, un admin sin restaurante no carga pedidos.

### Pruebas por aplicación

Las tres apps tienen `npm run test -w @resttek/<app>` (`ng test --watch=false` con Vitest y jsdom): `web-admin`, `web-empleados` y `web-clientes`. Ninguna se ejecuta con el `npm test` de la raíz.

---

## Configuración de Angular

### `app.config.ts`

```tsx
export const appConfig: ApplicationConfig = {
    providers: [
        { provide: API_URL, useValue: environment.apiUrl },
        provideZonelessChangeDetection(),
        provideRouter(routes),
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        importProvidersFrom(LucideAngularModule.pick({ ... }))
    ]
}
```

`LucideAngularModule.pick()` recibe solo los iconos que usa cada app, así que la lista es distinta en cada `app.config.ts`.

> **Zoneless**: `web-admin` y `web-empleados` llaman a `provideZonelessChangeDetection()` de forma explícita; `web-clientes` **no**. Funciona igual porque ningún paquete instala `zone.js` ni lo declara en `polyfills`, y Angular 21 opera sin zonas en ese caso. Es una inconsistencia entre apps, no un cambio de comportamiento.

### Proxy de Desarrollo

Cada frontend tiene un `proxy.conf.json` idéntico, que `npm start` aplica con `ng serve --proxy-config proxy.conf.json`:

```json
{
    "/api": {
        "target": "http://localhost:3000",
        "secure": false,
        "changeOrigin": true
    }
}
```

---

## Design System

El sistema de diseño es **dark mode** e incluye:

- **Variables CSS**: colores, radios, sombras, transiciones
- **Componentes base**: `.btn`, `.card`, `.form-control`, `.badge`, `.table`, etc.
- **Tipografía**: Inter (Google Fonts)
- **Animaciones**: `fadeIn`, `spin` (spinner)

> **No se comparte: se duplica.** Aunque existe `web-shared/src/lib/styles/base.css`, **ningún proyecto lo importa** ni se exporta desde `index.ts`. Cada aplicación tiene su propia copia en `src/styles.css`, que es lo que realmente carga Angular:
>
> | Fichero | Estado respecto a `base.css` |
> | --- | --- |
> | `web-admin/src/styles.css` | copia idéntica |
> | `web-clientes/src/styles.css` | copia idéntica |
> | `web-empleados/src/styles.css` | copia con 46 líneas propias añadidas |
>
> En la práctica hay **cuatro copias del design system** y el fichero de `web-shared` es código muerto. Al tocar un estilo común hay que replicarlo en las tres apps, o se desincronizan.