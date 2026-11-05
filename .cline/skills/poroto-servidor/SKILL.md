---
name: poroto-servidor
description: Understand and modify the Poroto petchop backend (Node/Express/MongoDB): architecture, models, routes, POS/sales logic, stock, loyalty, e-commerce sync. Use when working in poroto-petchop-servidor or when the user asks to change server-side logic, APIs, schemas, seeds, or backend bugs.
---

# Poroto Servidor Skill

## When to use
- Any task in `poroto-petchop-servidor/` (API, controllers, models, routes, utils).
- Adding/modifying endpoints, schemas, business rules, stock handling, sales, loyalty, reports, AI features, calendar, config.

## First steps
1. Read `docs/AI_CONTEXT.md` for full architecture, models, routes, flows, pitfalls.
2. Check `.env` exists; do not commit secrets.
3. Run `npm run dev` (port 5000) and test via client or curl.

## Key facts
- Stack: Node.js, Express 5, Mongoose 9, MongoDB Atlas, JWT, bcryptjs, morgan.
- Entry `server.js` mounts all `/api/*` routers; CORS from CLIENT_URL.
- Auth: `protect` (JWT) and `admin` middlewares in `src/middlewares/auth.js`.
- Models in `src/models/*.js`; controllers in `src/controllers/*Controller.js`; routes in `src/routes/*Routes.js`.
- Sales create deducts stock and writes `StockMovement`; bulk food uses `src/utils/bolsaStock.js`.
- Loyalty points via `src/utils/loyalty.js` using `pesosPorPunto` from `SystemConfig`.
- Payment deductions via `src/config/paymentFees.js` (absorbed by merchant).
- E-commerce sync via `src/utils/sincronizacionEcommerce.js`.
- Timezone: Argentina (UTC-3); date filters convert YYYY-MM-DD to day boundaries.

## Conventions
- CommonJS. Keep controllers try/catch returning JSON errors.
- Admin-only routes use `protect, admin`.
- Populate refs in GET responses.
- Any stock change writes a `StockMovement`.
- Do not change enum values without updating client + DB.
- When editing Sale logic, handle bags, combos, loyalty points, payment deductions consistently (see updateSale).

## Where to look
- Routes: `src/routes/*Routes.js`
- Logic: `src/controllers/*Controller.js`
- Schemas: `src/models/*.js`
- Helpers: `src/utils/*.js`, `src/config/*.js`
- Seeds: `src/seeds/`
