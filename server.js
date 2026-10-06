require('dotenv').config();
const dns = require('dns');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./src/config/db');
const { notFound, errorHandler } = require('./src/middlewares/errorHandler');

// Forzar resolvers DNS públicos para evitar que routers locales rechacen
// las consultas SRV de MongoDB Atlas (error "querySrv ECONNREFUSED")
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Rutas
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const categoryRoutes = require('./src/routes/categoryRoutes');
const productRoutes = require('./src/routes/productRoutes');
const saleRoutes = require('./src/routes/saleRoutes');
const stockRoutes = require('./src/routes/stockRoutes');
const reportRoutes = require('./src/routes/reportRoutes');
const supplierRoutes = require('./src/routes/supplierRoutes');
const purchaseOrderRoutes = require('./src/routes/purchaseOrderRoutes');
const expenseRoutes = require('./src/routes/expenseRoutes');
const fixedExpenseRoutes = require('./src/routes/fixedExpenseRoutes');
const customerRoutes = require('./src/routes/customerRoutes');
const budgetRoutes = require('./src/routes/budgetRoutes');
const promotionRoutes = require('./src/routes/promotionRoutes');
const recommendationRoutes = require('./src/routes/recommendationRoutes');
const calendarRoutes = require('./src/routes/calendarRoutes');
const loyaltyRoutes = require('./src/routes/loyaltyRoutes');
const aiHistoryRoutes = require('./src/routes/aiHistoryRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const aiFeaturesRoutes = require('./src/routes/aiFeaturesRoutes');
const aiFeatureHistoryRoutes = require('./src/routes/aiFeatureHistoryRoutes');
const investmentRoutes = require('./src/routes/investmentRoutes');
const systemConfigRoutes = require('./src/routes/systemConfigRoutes');

// Conectar a Base de Datos
connectDB();

const app = express();

// Middlewares
const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'];

const isPrivateHost = (hostname) =>
  /^10\./.test(hostname) ||
  /^192\.168\./.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
  /\.local$/.test(hostname);

const isAllowedOrigin = (origin) => {
  // requests sin origin (curl, apps moviles, server-to-server)
  if (!origin) return true;
  if (allowedOrigins.includes('*')) return true;
  if (allowedOrigins.includes(origin)) return true;

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const { hostname } = parsed;

  // localhost / 127.0.0.1 / [::1] en cualquier puerto (dev)
  if (LOCAL_HOSTS.includes(hostname)) return true;

  // Misma maquina que los origenes configurados, aunque cambie el puerto
  if (allowedOrigins.some(o => {
    try { return new URL(o).hostname === hostname; } catch { return false; }
  })) return true;

  // IPs de la red local (para probar desde el celu) solo en desarrollo
  if (process.env.NODE_ENV !== 'production' && isPrivateHost(hostname)) return true;

  return false;
};

app.use(cors({
  // false = responde sin header Access-Control-Allow-Origin (el browser bloquea),
  // en lugar de tirar una excepcion que rompia la respuesta con 500
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' })); // Para aceptar imágenes base64 si es necesario
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Rutas Base
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/stock-movements', stockRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/fixed-expenses', fixedExpenseRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/ai-history', aiHistoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/ai-features', aiFeaturesRoutes);
app.use('/api/ai-features-history', aiFeatureHistoryRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/system-config', systemConfigRoutes);

app.get('/', (req, res) => {
  res.send('API del Kiosco funcionando...');
});

// Middlewares de Error
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
