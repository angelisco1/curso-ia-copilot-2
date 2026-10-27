# Instrucciones para agentes

## Estructura y límites
- Este repositorio usa npm workspaces (`packages/*`). Ejecuta `npm install` desde la raíz y revisa el `package.json` del paquete que vayas a modificar.
- La API tiene dos estilos: `src/contexts/employee/` usa DDD y arquitectura hexagonal; restaurant, dish, ingredient y order usan capas transversales (`models/`, `repositories/`, `services/`, `controllers/`, `routes/`). Sigue el estilo del contexto afectado; no traslades uno al otro sin una petición explícita.
- Las aplicaciones Angular comparten capacidades a través de `web-shared`; no importes código directamente de otra aplicación. La organización interna varía entre `web-admin`, `web-empleados` y `web-clientes`; consulta la arquitectura frontend antes de mover o duplicar patrones.

## Comandos de desarrollo y validación
- `npm test` ejecuta Vitest en la API, no pruebas de extremo a extremo del monorepo.
- Para cambios en la API, ejecuta `npm test`; durante el desarrollo puedes usar `npm run test:watch` desde `packages/api`.
- Inicia la API con `npm run dev:api` (puerto 3000). Los frontends se inician con `npm run dev:admin` (4200), `npm run dev:empleados` (4201) o `npm run dev:clientes` (4202) y esperan que la API esté disponible.
- Para datos de prueba, ejecuta `npm run seed` desde la raíz. La API usa SQLite y los tests usan una base en memoria.
- No supongas que los cambios frontend quedan cubiertos por `npm test`; valida el paquete Angular afectado con sus scripts disponibles.

## Documentación del proyecto
- [README](README.md): instalación, arranque, puertos y recorrido básico.
- [Arquitectura general](docs/arquitectura/arquitectura-general.md): paquetes y límites del monorepo.
- [Arquitectura de la API](docs/arquitectura/arquitectura-api.md) y [arquitectura frontend](docs/arquitectura/arquitectura-frontend.md): patrones por capa y aplicación.
- [Modelo de datos](docs/dominio/modelo-datos.md) y [glosario](docs/dominio/glosario.md): términos y reglas del dominio.
- Consulta estos documentos antes de cambiar contratos o reglas del dominio; enlázalos en lugar de duplicar su contenido.