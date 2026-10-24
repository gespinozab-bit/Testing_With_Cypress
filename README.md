# Café Central · Sprint 4

Aplicación local de pedidos: React + Vite + TypeScript, Express + TypeScript y SQLite con better-sqlite3. Requiere Node.js 22.17 o superior compatible y pnpm 10.11.0. Incluye Cypress con TypeScript, la prueba smoke, los tres recorridos E2E de pedidos e integración continua con GitHub Actions. No incluye autenticación ni pagos.

## Ejecutar desde la raíz

```sh
pnpm install
pnpm dev
```

También existe `pnpm setup` para instalar. En PowerShell con scripts bloqueados, usa `pnpm.cmd` en lugar de `pnpm`, sin cambiar la política de ejecución.

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Vite redirige `/api` al backend; no se requiere CORS.
- Vite no carga los archivos de entorno del backend (`envDir: false`); la configuración del servidor no se expone al navegador.
- `pnpm dev:web` y `pnpm dev:api` ejecutan cada proceso por separado.

```sh
pnpm build
pnpm start
pnpm dev:web
```

`build` comprueba TypeScript y genera `dist/` y `dist-server/`. `start` inicia la API compilada en producción; el frontend se sirve por separado. Para desarrollo usa `pnpm dev`. La base se crea e inicializa automáticamente solo si no hay productos. Reiniciar preserva órdenes y existencias.

## Testing local y CI

```sh
pnpm dev:test
pnpm verify:api
```

`dev:test` usa `.env.test` y una base separada. No debe ejecutarse a la vez que `dev`, porque comparten puertos. `verify:api` es una verificación básica de API, sin navegador ni E2E: inicia su propio backend en el puerto 3107, usa una base temporal dentro de `data/` y la elimina al finalizar. Comprueba validaciones, cálculo de total, stock, rollback, persistencia tras reiniciar y disponibilidad restringida del reset.

`.env.ci.example` documenta los valores para CI. El workflow reutiliza `pnpm dev:test`, que carga `.env.test`, y establece `DATABASE_PATH=data/cafe-ci.sqlite` para separar la base de CI. Las variables ya presentes en el entorno prevalecen sobre los archivos usados por Node.

| Archivo | Entorno | Base | Reset |
| --- | --- | --- | --- |
| `.env.development` | development | data/cafe.sqlite | No |
| `.env.test` | testing | data/cafe-test.sqlite | Sí |
| `.env.production` | production | data/cafe.sqlite | No |
| `.env.ci.example` | testing | data/cafe-ci.sqlite | Sí |

La ruta de reset se registra **solo** si `NODE_ENV=testing` y `ENABLE_TEST_RESET=true`. En producción responde 404 incluso si el flag es `true`. El backend escucha únicamente en localhost. No publiques un proceso configurado para testing.

## Cypress · Sprint 3

Primero detén cualquier instancia de `pnpm dev` y arranca frontend y API para pruebas:

```sh
pnpm dev:test
```

Este comando usa `.env.test` mediante Node/tsx, funciona en Windows y Linux e inicia la API con `NODE_ENV=testing`. El reset queda disponible en `POST http://localhost:3000/api/test/reset`. El `beforeEach` global en `cypress/support/e2e.ts` lo ejecuta antes de cada prueba, incluida la smoke.

Con la aplicación en ejecución, abre otra terminal en la raíz:

```sh
pnpm cy:open
```

Para ejecutar headless:

```sh
pnpm cy:run
```

La suite conserva `cypress/e2e/smoke.cy.ts` y agrega tres escenarios independientes en `cypress/e2e/orders.cy.ts`:

- Pedido exitoso: 2 americanos y 1 croissant, cantidades y total Q48.00 visibles, POST real observado con `cy.intercept()`, confirmación e identificador; consulta por API que verifica total y detalles persistidos.
- Carrito vacío: mensaje visible, confirmación deshabilitada y cero solicitudes POST de creación observadas durante el escenario.
- Fallo controlado: `cy.intercept()` devuelve HTTP 500 solo al primer POST (`times: 1`); se comprueba el error y la conservación del carrito. El reintento usa la API real, sin recargar la página, y confirma una orden persistida.

Antes de cada recorrido se comprueban además los precios y existencias iniciales y la ausencia de la orden 1. Las pruebas no usan esperas numéricas: sincronizan mediante aserciones reintentables y `cy.wait()` con alias de solicitudes. No consultan SQLite directamente ni dependen de órdenes creadas por otras pruebas.

La configuración es exclusivamente E2E, con `baseUrl: 'http://localhost:5173'`. Para comprobar sus tipos: `pnpm exec tsc -p cypress/tsconfig.json`.

El binario de Cypress se descarga en `.cache/Cypress` mediante `.npmrc`; esa caché, las capturas y los videos quedan fuera de Git. Los comandos de Cypress requieren que frontend y API ya estén iniciados.

## Integración continua

`.github/workflows/cypress.yml` se ejecuta en cada `push`, `pull_request` y manualmente mediante `workflow_dispatch`. Utiliza un solo job en Ubuntu 24.04, Node.js 22.17.1 y pnpm 10.11.0 leído de `packageManager` en `package.json`.

Primero instala con `pnpm install --frozen-lockfile` y ejecuta `pnpm build`; si alguno falla, no se ejecutan las pruebas. Después, `cypress-io/github-action@v7` inicia `pnpm dev:test` con la API en `NODE_ENV=testing`. Su `wait-on` comprueba `http://localhost:5173` y `http://localhost:3000/api/products` antes de ejecutar las cuatro pruebas en Chrome headless, preinstalado en el runner. No utiliza esperas artificiales ni altera el reset en `beforeEach`.

`cypress.config.ts` habilita `video: true` y mantiene las capturas automáticas de fallos. El workflow conserva durante 7 días los screenshots cuando falla el job (`cypress-screenshots`) y los videos tanto en éxito como en fallo (`cypress-videos`). Los pasos de artifacts usan `if-no-files-found: ignore`; solo suben `cypress/screenshots` y `cypress/videos`, sin bases SQLite, dependencias ni cachés.

Después de subir los cambios, abre la pestaña **Actions** del repositorio, selecciona **Cypress E2E** y revisa el resultado. Los artifacts se descargan desde la página de cada ejecución; también puedes iniciar otra con **Run workflow**. No se necesitan secretos ni Cypress Cloud.

## API

- `GET /api/products`: lista `{id, name, price, stock}`. Importes en quetzales.
- `POST /api/orders`: cuerpo `{"items":[{"productId":1,"quantity":2}]}`. Devuelve HTTP 201 con `{"id":1,"total":30}`.
- `GET /api/orders/1`: cabecera persistida con `id`, `total`, `createdAt` e `items` (producto, nombre, cantidad, precio unitario y subtotal).
- `POST /api/test/reset`: en testing, devuelve `{"ok":true}`. Elimina órdenes y detalles, reinicia IDs y restaura los cuatro productos y sus existencias en una transacción. Cypress lo invoca con `cy.request('POST', 'http://localhost:3000/api/test/reset')` antes de cada prueba.

Los errores usan `{"error":"mensaje"}` y estados 400 (datos inválidos), 404 (no encontrado), 409 (stock insuficiente) o 500. La API rechaza cantidades fraccionarias, no positivas o no numéricas y productos duplicados. Ignora precios y totales enviados por el cliente. Guarda dinero en centavos enteros y descuenta stock junto con cabecera y detalles en una transacción inmediata.

El carrito se conserva al fallar una solicitud, actualiza existencias y permite corregir cantidades o reintentar. Un error de conexión con respuesta desconocida puede requerir consultar la orden antes de reenviar; este sprint no implementa claves de idempotencia.

## Selectores E2E

`catalog`, `product-{id}`, `price-{id}`, `stock-{id}`, `add-{id}`, `cart`, `cart-count`, `cart-empty`, `cart-item-{id}`, `quantity-{id}`, `increase-{id}`, `decrease-{id}`, `remove-{id}`, `subtotal-{id}`, `cart-total`, `confirm-order`, `empty-message`, `catalog-loading`, `catalog-error`, `api-error`, `order-success`, `order-id`, `order-total` están disponibles como atributos `data-cy`.

## Archivos y datos

- `src/`: interfaz y estilos responsivos.
- `server/index.ts`: API, esquema, productos iniciales y transacciones.
- `scripts/verify-api.mjs`: verificación básica de API.
- `public/images/`: fotografías locales de productos (Unsplash).
- Configuraciones Vite/TypeScript, `package.json`, lockfile y archivos de entorno sin secretos en la raíz.

Fotografías descargadas de Unsplash e incluidas en `public/images`: `photo-1510707577719-ae7c14805e3a`, `photo-1572442388796-11668a67e53d`, `photo-1555507036-ab1f4038808a` y `photo-1544787219-7f47ccb76574` (https://images.unsplash.com/).

SQLite, archivos WAL/SHM, dependencias, cachés y builds están excluidos de Git. La aplicación no requiere servicios externos durante su ejecución.
