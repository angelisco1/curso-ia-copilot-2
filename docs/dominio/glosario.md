# Glosario

Terminología del dominio y conceptos técnicos utilizados en el proyecto Resttek.

---

## Términos del Dominio

### Entidades de Negocio

| Término | Definición |
| --- | --- |
| **Restaurant** | Establecimiento de hostelería gestionado por el sistema. Tiene nombre, dirección, email, teléfono, propietario y logo. |
| **Employee** | Persona que trabaja en el sistema. Tiene un rol y puede estar asignada a un restaurante. |
| **Dish** | Plato de la carta de un restaurante. Tiene nombre, descripción, precio, categoría y puede estar disponible o no. |
| **Ingredient** | Ingrediente utilizado en los platos. Tiene nombre, unidad de medida y stock actual. Pertenece a un restaurante. |
| **DishIngredient** | Relación entre un plato y un ingrediente, con la cantidad necesaria. |
| **Order** | Pedido realizado por un cliente. Contiene ítems (platos) y está asociado a un restaurante. |
| **OrderItem** | Línea de un pedido: un plato con cantidad, notas opcionales y estado. |
| **RestaurantTable** (mesa) | Mesa de un restaurante, con número único entre sus mesas activas, descripción, capacidad y estado. Se borra lógicamente para conservar su historial. |
| **TableSession** (ocupación, visita) | Periodo durante el que una mesa está ocupada. La abre un cliente al confirmar mesa, o el personal al marcarla ocupada a mano. Se cierra al liberar, reservar o borrar la mesa. Agrupa los pedidos de esa visita. |

Dos particularidades del modelo que conviene tener presentes:

- **Los clientes son `Employee`.** No hay entidad ni tabla de clientes: un cliente es una fila de `employees` con `role = 'cliente'` y `restaurant_id = null`. Por eso el login es el mismo endpoint para todos y la respuesta se llama `employee` incluso al registrarse como cliente.
- **Cada unidad pedida es un `OrderItem`.** Al crear un pedido con 3 unidades de un plato se generan 3 filas con `quantity: 1`, para que cocina pueda marcar el estado de cada una por separado.
- **Un cliente solo pide dentro de su ocupación.** Antes de ver la carta indica cuántas personas son y confirma una mesa libre con capacidad suficiente. El servidor rechaza pedidos de cliente sin una ocupación propia abierta. Salir, recargar o cambiar de restaurante no libera la mesa: solo la libera el personal.

### Roles

| Rol | Descripción | Acceso |
| --- | --- | --- |
| **admin** | Administrador del sistema. Gestiona restaurantes, empleados y configuración. | web-admin, web-empleados (todas las vistas) |
| **manager** | Gerente de restaurante. Gestiona los platos de su restaurante. | web-admin, web-empleados (todas las vistas) |
| **cocinero** | Cocinero del restaurante. Prepara los pedidos. | web-empleados (cocina) |
| **camarero** | Camarero del restaurante. Atiende barra y salón. | web-empleados (barra, salón) |
| **cliente** | Cliente final. Hace pedidos. | web-clientes |

El valor almacenado es `manager`; "gerente" es solo su traducción en la interfaz. En `web-empleados`, camarero accede a barra y salón, cocinero a cocina, y manager y admin a las tres vistas. El acceso directo a una ruta y la navegación entre vistas se comprueban por rol; camarero inicia en `/barra`, cocinero en `/cocina`, y manager/admin en `/salon`. Sin sesión o con rol cliente, ausente o desconocido, la app redirige a `/login`. Esta restricción frontend guía la navegación y no sustituye la autorización de los endpoints de la API mediante `authorize()`.

Mesas: solo admin las crea, edita y borra (web-admin). Admin, manager y camarero las consultan y cambian de estado desde salón; manager y camarero solo en su restaurante, y admin, que no tiene restaurante asignado, lo elige en salón. Cocinero no accede a las mesas.

### Estados de Pedido

| Estado | Descripción | Quién lo cambia |
| --- | --- | --- |
| **pendiente** | Ítem recién pedido, sin procesar. | — (estado inicial) |
| **preparando** | Ítem siendo preparado en cocina. | cocinero |
| **listo** | Ítem preparado, listo para servir. | cocinero |
| **entregado** | Ítem entregado al cliente. Desaparece de las vistas activas. | camarero |

### Estados de Mesa

| Estado | Descripción | Quién lo cambia |
| --- | --- | --- |
| **libre** | Disponible. Es el único estado que se ofrece a los clientes, y solo si la capacidad alcanza para el grupo. | camarero, manager o admin (desde salón); admin (desde web-admin) |
| **ocupada** | Tiene una ocupación abierta. La ocupa un cliente al confirmar mesa o el personal a mano. | cliente al confirmar; camarero, manager o admin |
| **reservada** | Bloqueada a mano para que nadie la ocupe. Es solo un estado: no hay fecha, hora ni datos de reserva. | camarero, manager o admin |

Pasar una mesa de `ocupada` a `libre` o `reservada` cierra su ocupación aunque tenga pedidos pendientes. Esos pedidos siguen en cocina, barra y entregas, etiquetados como de una visita cerrada, y no aparecen en la siguiente visita de la mesa.

### Categorías de Platos

| Categoría | Descripción |
| --- | --- |
| **entrante** | Primeros platos, aperitivos |
| **principal** | Platos principales |
| **postre** | Postres |
| **bebida** | Bebidas |

### Unidades de Ingredientes

| Unidad | Descripción |
| --- | --- |
| **kg** | Kilogramos |
| **g** | Gramos |
| **l** | Litros |
| **ml** | Mililitros |
| **unidad** | Unidades sueltas |

Son los únicos valores que acepta `normalizeIngredientUnit()`. La entrada se normaliza con `trim()` + `toLowerCase()`, así que `KG` es válido, pero abreviaturas como `ud` o `L.` se rechazan con `InvalidUnitError`.

---

## Conceptos Técnicos

### Arquitectura

| Concepto | Definición |
| --- | --- |
| **Monorepo** | Repositorio único que contiene múltiples paquetes/proyectos relacionados. |
| **npm Workspaces** | Funcionalidad de npm para gestionar múltiples paquetes en un monorepo. |
| **Arquitectura Hexagonal** | Patrón arquitectónico que separa el dominio de la infraestructura mediante puertos (interfaces) y adaptadores (implementaciones). |
| **DDD (Domain-Driven Design)** | Enfoque de diseño que organiza el código alrededor de los dominios de negocio. |
| **Bounded Context** | Límite conceptual dentro del cual un modelo de dominio es consistente. En Resttek solo **Employee** está implementado así (`src/contexts/employee/`); el resto de dominios usan una organización por capas. |

### Capas de la API

Las tres capas aplican al contexto `employee`:

| Capa | Responsabilidad |
| --- | --- |
| **Domain** | Entidades, value objects, interfaces de repositorio. Reglas de negocio puras. |
| **Application** | Casos de uso. Orquesta la lógica de negocio. |
| **Infrastructure** | Implementaciones concretas: BD, HTTP, servicios externos. |

En `restaurant`, `dish`, `ingredient`, `order` y `table` (mesas y ocupaciones) la separación equivalente es por carpetas: `models/`, `repositories/`, `services/`, `controllers/` y `routes/`.

### Patrones

| Patrón | Descripción | Ejemplo en Resttek |
| --- | --- | --- |
| **Entity** | Objeto con identidad única y comportamiento propio. | `Employee` (la única). `Restaurant`, `Dish`, `Ingredient` y `Order` son `interface` planas |
| **Value Object** | Objeto inmutable definido por su valor. | `Email`, `Role` |
| **Repository** | Abstracción de persistencia. | `IEmployeeRepository`, `RestaurantRepository` |
| **Use Case** | Acción de negocio específica, una clase con `execute()`. | `LoginUseCase`, `CreateEmployeeUseCase`, `RegisterClientUseCase` |
| **Service** | Equivalente al caso de uso fuera de `employee`: una clase con varios métodos. | `RestaurantService`, `DishService`, `OrderService` |
| **DTO** | Objeto para transferir datos entre capas. | `CreateRestaurantDTO`, `LoginDTO` |
| **Factory Method** | Método estático para crear instancias con validación. | `Employee.create()` |
| **Store** | Servicio Angular que guarda estado con signals. | `AuthStore`, `DishStore`, `CartStore` |

### Frontend

| Concepto | Definición |
| --- | --- |
| **Standalone Component** | Componente Angular que no necesita NgModule. |
| **Signal** | Primitiva reactiva de Angular para estado. |
| **Zoneless** | Modo de Angular sin zone.js, usando signals para change detection. |
| **Functional Guard** | Función que protege rutas (reemplaza a clases con CanActivate). |
| **Functional Interceptor** | Función que intercepta peticiones HTTP. |
| **Lazy Loading** | Carga de componentes/módulos bajo demanda al navegar. |
| **Barrel Export** | Archivo `index.ts` que re-exporta para simplificar imports. |

### Autenticación

| Concepto | Definición |
| --- | --- |
| **JWT** | JSON Web Token. Token firmado que contiene `id`, `role` y `restaurantId`. Caduca a las **8 h**. |
| **Bearer Token** | Esquema de autenticación: `Authorization: Bearer <jwt>`. |
| **bcrypt** | Algoritmo de hash para contraseñas (10 salt rounds). |
| **AuthGuard** | Guard que verifica si hay sesión activa antes de permitir acceso a una ruta. No comprueba roles. |
| **AuthInterceptor** | Interceptor que añade el token JWT a cada petición HTTP. |
| **ErrorInterceptor** | Interceptor que ante un 401 limpia la sesión y redirige a `/login`. |