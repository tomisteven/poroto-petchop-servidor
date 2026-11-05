# Poroto Petchop Servidor — AI Context

## 1. Overview
Backend REST API for a kiosk/pet-shop POS system ("Poroto"). Manages products, stock, sales (tickets), customers/loyalty, suppliers, purchase orders, expenses, fixed expenses, budgets, promotions, calendar, reports, and AI features. Built with Node.js + Express 5 + Mongoose/MongoDB Atlas. Syncs product catalog to an external e-commerce via HTTP.

- Repo: poroto-petchop-servidor/
- Entry: server.js (CommonJS)
- Port: process.env.PORT || 5000
- DB: MongoDB Atlas (MONGODB_URI)
- Auth: JWT Bearer (JWT_SECRET, JWT_EXPIRES_IN=1d)
- CORS: CLIENT_URL (comma list); dev allows localhost/private IPs

## 2. How to run
npm install
npm run dev      # nodemon server.js
npm start        # node server.js
npm run seed     # node src/seeds/seed.js
Requires .env. Dev proxy from client targets http://localhost:5000.

## 3. Folder structure
server.js
src/config/db.js, paymentFees.js
src/controllers/   (24 files)
src/middlewares/auth.js, errorHandler.js
src/models/        (23 schemas)
src/routes/        (23 routers)
src/seeds/
src/utils/         (aiClient, bolsaStock, generateTicketNumber, generateToken, loyalty, sincronizacionEcommerce, systemConfig)

## 4. Architecture & conventions
- CommonJS. Each resource: model + controller + route.
- Routes mounted in server.js under /api/<resource>.
- Controllers: async/await, try/catch, JSON responses; errors via res.status().json({message}).
- Auth: protect loads req.user (User, -password), requires activo; admin requires rol==='admin'.
- Timestamps on most models.
- Dates adjusted to Argentina (UTC-3): setUTCHours(3,...)/26.
- Stock mutations create StockMovement.
- E-commerce sync on product changes.

## 5. Authentication
- POST /api/auth/login {email,password} -> {_id,nombre,email,rol,token}
- GET /api/auth/me (protect)
- Roles: admin | empleado. Token in localStorage 'userInfo'.
- Passwords hashed bcryptjs (pre-save).

## 6. Environment variables
PORT, NODE_ENV, MONGODB_URI, JWT_SECRET, JWT_EXPIRES_IN, CLIENT_URL, OPENAI_API_KEY, OPENAI_MODEL, ECOMMERCE_API_URL, ECOMMERCE_API_KEY.

## 7. Data models (key fields)
- User: nombre, email(unique), password, rol(enum admin/empleado), activo
- Product: nombre, descripcion, sku(unique sparse), categoria(ref Category), precioCompra, precioVenta, stock, stockMinimo, unidadMedida, proveedor, imagen, activo, mostrarEnCatalogo, esBolsaAlimento, aspectoBolsa, kilosPorBolsa, gramosBolsaAbierta, precioKilo, margenSuelto, esGenerico, notasIA, esCombo, comboItems[{producto,cantidad,hayStock}]. Virtuals: margenGanancia, comboVendible.
- Category: nombre, color
- Sale: numeroTicket(unique), fecha, empleado(ref User), cliente(ref Customer), puntosGanados, items[{producto,promocion,nombre,cantidad,precioVentaHisto,precioCompraHisto,subtotal,esVentaSuelta,kilosVendidos}], subtotal, descuento(%), totalFinal, metodoPago(enum efectivo/tarjeta/tarjeta_debito/transferencia), retencionIIBB, comisionMP, impuestosPago, totalNeto, montoPagado, vuelto, estado(completada/anulada), notas.
- Customer: nombre, telefono, email, direccion, esAfiliado, puntos, fechaAfiliacion, activo.
- StockMovement: producto, tipo, cantidad, stockAnterior, stockNuevo, motivo, usuario.
- Supplier, PurchaseOrder, Expense, FixedExpense, Budget, Promotion, CalendarEvent, LoyaltyConfig, LoyaltyReward, Redemption, Investment, SystemConfig, AIFeatureHistory, AIHistory, Order.
- SystemConfig (singleton 'config'): metaFacturacionDiaria, metaGananciaDiaria, metaFacturacionMensual, margenSueltoDefecto, pesosPorPunto.

## 8. API route prefixes
/api/auth, /api/users, /api/categories, /api/products, /api/sales, /api/stock-movements, /api/reports, /api/suppliers, /api/purchase-orders, /api/expenses, /api/fixed-expenses, /api/customers, /api/budgets, /api/promotions, /api/recommendations, /api/calendar, /api/loyalty, /api/ai-history, /api/orders, /api/ai-features, /api/ai-features-history, /api/investments, /api/system-config.
All protected except where noted (e.g. getPublicCatalog). Check route files for exact middleware.

## 9. Key flows
POS sale creation (POST /api/sales): validates items; supports retroactive fecha (not future); resolves customer/loyalty; deducts stock (normal, bulk bags via bolsaStock, combos components); creates StockMovement; calculates payment deductions (paymentFees); generates numeroTicket; awards loyalty points via calcularPuntos using pesosPorPunto.
Cancel sale: marks anulada, restores stock and points.
Product bulk actions: add stock, apply margins, etc; create StockMovement.
E-commerce sync: sincronizarProducto POSTs mapped product to ECOMMERCE_API_URL/products/single; sincronizarCatalogoCompleto batches of 50 to /products/batch; triggered from product controller.

## 10. Conventions for modifications
- Add resource: model + controller + route; register in server.js; update this doc.
- Populate refs in GET responses.
- Use protect/admin middleware; admin-only uses both.
- Stock changes must write StockMovement.
- Money: numbers, 2 decimals where applicable.
- Timezone Argentina (UTC-3).
- Do not change enum values without updating client and DB.
- When modifying Sale, handle bag stock (bolsaStock), loyalty points, payment deductions (see updateSale).

## 11. Pitfalls
- Mongoose 9 / Express 5: async errors may not auto-propagate; controllers catch manually.
- DNS set to 8.8.8.8/1.1.1.1 for Mongo SRV.
- CORS: production needs CLIENT_URL; localhost always allowed.
- Product sku unique sparse: multiple null allowed.
- Combo availability (hayStock) must be refreshed via actualizarDisponibilidadCombo before selling.
- Bulk food: gramosBolsaAbierta tracks open bag; stock counts full bags.
- Payment deductions absorbed by merchant, not charged to customer.
- Date filters: client sends YYYY-MM-DD; server converts to Arg day boundaries.

## 12. Where to look
- Route definitions: src/routes/*Routes.js
- Business logic: src/controllers/*Controller.js
- Schemas: src/models/*.js
- Shared helpers: src/utils/*.js, src/config/*.js
- Seeds: src/seeds/
