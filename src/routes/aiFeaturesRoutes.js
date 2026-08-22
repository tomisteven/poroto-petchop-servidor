const express = require('express');
const router = express.Router();
const {
  analizarRestock,
  analizarPrecios,
  analizarClientesInactivos,
  analizarTendencias,
  generarPromocionesIA,
  chatbotCatalogo,
  crearComboProducto,
} = require('../controllers/aiFeaturesController');
const { protect } = require('../middlewares/auth');

router.get('/restock', protect, analizarRestock);
router.get('/precios', protect, analizarPrecios);
router.get('/clientes-inactivos', protect, analizarClientesInactivos);
router.get('/tendencias', protect, analizarTendencias);
router.get('/promociones-ia', protect, generarPromocionesIA);
router.post('/crear-combo', crearComboProducto);
router.post('/chatbot', chatbotCatalogo);

module.exports = router;
