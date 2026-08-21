const Promotion = require('../models/Promotion');
const Product = require('../models/Product');
const { buildPromocionesPrompt, llamarIA } = require('../utils/aiClient');

const generatePromotionNumber = async () => {
  const last = await Promotion.findOne().sort({ numero: -1 });
  const num = last ? parseInt(last.numero.split('-')[1]) + 1 : 1;
  return `PR-${String(num).padStart(4, '0')}`;
};

// Calcula los totales de una promoción a partir de sus ítems y descuento.
// Si la ganancia queda <= 0, ajusta el descuento para dejar un margen positivo.
const computePromotion = (items, descuento) => {
  if (!items || items.length === 0) return null;

  const subtotalVenta = items.reduce((sum, i) => sum + (i.cantidad * i.precioVenta), 0);
  const subtotalCosto = items.reduce((sum, i) => sum + (i.cantidad * i.precioCompra), 0);

  if (subtotalVenta <= 0) return null;

  let desc = Math.min(Math.max(descuento || 0, 0), 100);
  let precioFinal = subtotalVenta * (1 - desc / 100);
  let ganancia = precioFinal - subtotalCosto;

  if (ganancia <= 0) {
    const maxDesc = subtotalCosto > 0 ? Math.floor((1 - subtotalCosto / subtotalVenta) * 100) : 99;
    desc = Math.max(0, maxDesc - 1);
    precioFinal = subtotalVenta * (1 - desc / 100);
    ganancia = precioFinal - subtotalCosto;
  }

  if (ganancia <= 0 || precioFinal <= 0) return null;

  const margen = (ganancia / precioFinal) * 100;

  return {
    items: items.map((i) => ({ ...i, subtotal: i.cantidad * i.precioVenta })),
    subtotalCosto,
    subtotalVenta,
    descuento: desc,
    precioFinal,
    ganancia,
    margen,
  };
};

// Carga los ítems y los completa con los precios actuales desde la base de datos.
const buildItemsWithPrices = async (items) => {
  if (!items || items.length === 0) throw new Error('La promoción debe tener al menos un producto');

  const result = [];
  for (const item of items) {
    const product = await Product.findById(item.producto);
    if (!product || !product.activo) {
      throw new Error(`Producto no encontrado: ${item.producto}`);
    }
    const cantidad = Number(item.cantidad);
    if (!cantidad || cantidad < 1) {
      throw new Error(`Cantidad inválida para el producto ${product.nombre}`);
    }
    result.push({
      producto: product._id,
      cantidad,
      precioVenta: product.precioVenta,
      precioCompra: product.precioCompra,
    });
  }
  return result;
};

// @desc    Obtener todas las promociones
// @route   GET /api/promotions
// @access  Private
const getPromotions = async (req, res) => {
  try {
    const { estado } = req.query;
    const filter = { activo: true };
    if (estado) filter.estado = estado;

    const promotions = await Promotion.find(filter)
      .populate('productoPrincipal', 'nombre sku precioVenta precioCompra')
      .populate('items.producto', 'nombre sku precioVenta precioCompra')
      .populate('empleado', 'nombre')
      .sort({ createdAt: -1 });

    res.json(promotions);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener promociones' });
  }
};

// @desc    Obtener promoción por ID
// @route   GET /api/promotions/:id
// @access  Private
const getPromotion = async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id)
      .populate('productoPrincipal', 'nombre sku precioVenta precioCompra imagen')
      .populate('items.producto', 'nombre sku precioVenta precioCompra imagen categoria')
      .populate('empleado', 'nombre');

    if (!promotion) return res.status(404).json({ message: 'Promoción no encontrada' });
    res.json(promotion);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener promoción' });
  }
};

// @desc    Generar propuestas de promociones con IA
// @route   POST /api/promotions/generar
// @access  Private/Admin
const generateWithAI = async (req, res) => {
  try {
    const { productoPrincipalId } = req.body;

    if (!productoPrincipalId) {
      return res.status(400).json({ message: 'Debe seleccionar un producto principal' });
    }

    const productoPrincipal = await Product.findById(productoPrincipalId).populate('categoria', 'nombre');
    if (!productoPrincipal || !productoPrincipal.activo) {
      return res.status(404).json({ message: 'Producto principal no encontrado' });
    }

    // Catálogo: productos activos, con stock, no genéricos (no tienen precio fijo de venta)
    const catalogo = await Product.find({ activo: true, stock: { $gt: 0 }, esGenerico: false })
      .populate('categoria', 'nombre')
      .select('nombre sku categoria precioVenta precioCompra stock stockMinimo unidadMedida esBolsaAlimento kilosPorBolsa descripcion');

    if (catalogo.length === 0) {
      return res.status(400).json({ message: 'No hay productos con stock para armar promociones' });
    }

    const prompt = buildPromocionesPrompt({ productoPrincipal, catalogo });
    const rawPromociones = await llamarIA(prompt);

    const propuestas = [];
    const productosMap = new Map(catalogo.map((p) => [String(p._id), p]));

    for (const raw of rawPromociones) {
      if (!raw || !Array.isArray(raw.items) || raw.items.length === 0) continue;

      const items = [];
      for (const item of raw.items) {
        const product = productosMap.get(String(item.id));
        if (!product) continue;
        const cantidad = Number(item.cantidad);
        if (!cantidad || cantidad < 1) continue;
        items.push({
          producto: product._id,
          cantidad,
          precioVenta: product.precioVenta,
          precioCompra: product.precioCompra,
          nombre: product.nombre,
          sku: product.sku,
        });
      }

      if (items.length === 0) continue;

      const computed = computePromotion(items, raw.descuento);
      if (!computed) continue;

      propuestas.push({
        nombre: raw.nombre || `Combo ${productoPrincipal.nombre}`,
        descripcion: raw.descripcion || '',
        ...computed,
      });
    }

    if (propuestas.length === 0) {
      return res.status(400).json({ message: 'La IA no generó promociones válidas. Intente de nuevo' });
    }

    res.json({ promociones: propuestas });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Crear promoción
// @route   POST /api/promotions
// @access  Private/Admin
const createPromotion = async (req, res) => {
  try {
    const { nombre, descripcion, productoPrincipal, items, descuento, notas } = req.body;

    if (!productoPrincipal) return res.status(400).json({ message: 'Debe indicar el producto principal' });
    if (!nombre || !nombre.trim()) return res.status(400).json({ message: 'Debe indicar un nombre para la promoción' });

    const principal = await Product.findById(productoPrincipal);
    if (!principal) return res.status(404).json({ message: 'Producto principal no encontrado' });

    const itemsConPrecio = await buildItemsWithPrices(items);
    const computed = computePromotion(itemsConPrecio, descuento);
    if (!computed) return res.status(400).json({ message: 'La promoción no genera ganancia. Verifique el descuento' });

    const numero = await generatePromotionNumber();

    const promotion = await Promotion.create({
      numero,
      nombre: nombre.trim(),
      descripcion,
      productoPrincipal: principal._id,
      items: computed.items,
      subtotalCosto: computed.subtotalCosto,
      subtotalVenta: computed.subtotalVenta,
      descuento: computed.descuento,
      precioFinal: computed.precioFinal,
      ganancia: computed.ganancia,
      margen: computed.margen,
      empleado: req.user._id,
      notas,
    });

    const populated = await Promotion.findById(promotion._id)
      .populate('productoPrincipal', 'nombre sku')
      .populate('items.producto', 'nombre sku')
      .populate('empleado', 'nombre');

    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Actualizar promoción
// @route   PUT /api/promotions/:id
// @access  Private/Admin
const updatePromotion = async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) return res.status(404).json({ message: 'Promoción no encontrada' });

    const { nombre, descripcion, productoPrincipal, items, descuento, notas, estado } = req.body;

    if (productoPrincipal) promotion.productoPrincipal = productoPrincipal;
    if (nombre !== undefined) promotion.nombre = nombre.trim();
    if (descripcion !== undefined) promotion.descripcion = descripcion;
    if (notas !== undefined) promotion.notas = notas;
    if (estado && ['activa', 'pausada'].includes(estado)) promotion.estado = estado;

    if (items) {
      const itemsConPrecio = await buildItemsWithPrices(items);
      const computed = computePromotion(itemsConPrecio, descuento);
      if (!computed) return res.status(400).json({ message: 'La promoción no genera ganancia. Verifique el descuento' });

      promotion.items = computed.items;
      promotion.subtotalCosto = computed.subtotalCosto;
      promotion.subtotalVenta = computed.subtotalVenta;
      promotion.descuento = computed.descuento;
      promotion.precioFinal = computed.precioFinal;
      promotion.ganancia = computed.ganancia;
      promotion.margen = computed.margen;
    } else if (descuento !== undefined) {
      const computed = computePromotion(promotion.items, descuento);
      if (!computed) return res.status(400).json({ message: 'La promoción no genera ganancia. Verifique el descuento' });
      promotion.descuento = computed.descuento;
      promotion.precioFinal = computed.precioFinal;
      promotion.ganancia = computed.ganancia;
      promotion.margen = computed.margen;
    }

    await promotion.save();

    const populated = await Promotion.findById(promotion._id)
      .populate('productoPrincipal', 'nombre sku')
      .populate('items.producto', 'nombre sku')
      .populate('empleado', 'nombre');

    res.json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Cambiar estado (pausar/activar)
// @route   PATCH /api/promotions/:id/estado
// @access  Private/Admin
const toggleEstado = async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) return res.status(404).json({ message: 'Promoción no encontrada' });

    promotion.estado = promotion.estado === 'activa' ? 'pausada' : 'activa';
    await promotion.save();

    res.json(promotion);
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar estado de la promoción' });
  }
};

// @desc    Eliminar promoción (soft delete)
// @route   DELETE /api/promotions/:id
// @access  Private/Admin
const deletePromotion = async (req, res) => {
  try {
    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) return res.status(404).json({ message: 'Promoción no encontrada' });

    promotion.activo = false;
    await promotion.save();

    res.json({ message: 'Promoción eliminada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar promoción' });
  }
};

module.exports = {
  getPromotions,
  getPromotion,
  generateWithAI,
  createPromotion,
  updatePromotion,
  toggleEstado,
  deletePromotion,
};