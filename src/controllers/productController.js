const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const Sale = require('../models/Sale');
const Category = require('../models/Category');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Convierte un término de búsqueda parecido a un número ("12000", "$12.000", "12,5") a Number, o null.
const termNumber = (t) => {
  const raw = String(t).replace(/[^0-9.,-]/g, '');
  if (!raw) return null;
  const normalized = raw.replace(/([.,])(?=\d{3}(?:[.,]|$))/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

// Filtro de búsqueda avanzada para un término: nombre, SKU, descripción, proveedor, envase,
// categoría (por nombre) y campos numéricos (precio, stock, kilos).
const buildTermFilter = async (term) => {
  const or = ['nombre', 'sku', 'descripcion', 'proveedor', 'aspectoBolsa'].map((f) => ({
    [f]: { $regex: escapeRegex(term), $options: 'i' },
  }));

  const num = termNumber(term);
  if (num !== null) {
    ['precioVenta', 'precioCompra', 'precioKilo', 'stock', 'kilosPorBolsa'].forEach((f) => {
      or.push({ [f]: num });
    });
  }

  const cats = await Category.find({ nombre: { $regex: escapeRegex(term), $options: 'i' } }).select('_id');
  if (cats.length > 0) or.push({ categoria: { $in: cats.map((c) => c._id) } });

  return { $or: or };
};

// @desc    Obtener productos (con búsqueda avanzada y filtros)
// @route   GET /api/products
// @query   q, search, category, conPrecio, sinPrecio, minPrecio, maxPrecio,
//          esGenerico, esBolsaAlimento, esCombo, agotados, lowStock, sort
// @access  Private
const getProducts = async (req, res) => {
  try {
    const {
      category, lowStock, search, q, sort,
      conPrecio, sinPrecio, minPrecio, maxPrecio,
      esGenerico, esBolsaAlimento, esCombo, agotados,
    } = req.query;

    // "Tiene precio" = precio de compra o de venta mayor a 0.
    const hasPriceOr = [{ precioCompra: { $gt: 0 } }, { precioVenta: { $gt: 0 } }];

    const clauses = [{ activo: true }];
    if (category) clauses.push({ categoria: category });
    if (conPrecio === 'true') clauses.push({ $or: hasPriceOr });
    if (sinPrecio === 'true') clauses.push({ $nor: hasPriceOr });
    if (esGenerico === 'true') clauses.push({ esGenerico: true });
    if (esBolsaAlimento === 'true') clauses.push({ esBolsaAlimento: true });
    if (esCombo === 'true') clauses.push({ esCombo: true });
    if (agotados === 'true') clauses.push({ stock: { $lte: 0 } });

    const priceCond = {};
    if (minPrecio && Number.isFinite(Number(minPrecio))) priceCond.$gte = Number(minPrecio);
    if (maxPrecio && Number.isFinite(Number(maxPrecio))) priceCond.$lte = Number(maxPrecio);
    if (Object.keys(priceCond).length > 0) clauses.push({ precioVenta: priceCond });

    if (q) {
      const terms = String(q).trim().split(/\s+/).filter(Boolean);
      for (const t of terms) {
        clauses.push(await buildTermFilter(t));
      }
    } else if (search) {
      clauses.push(await buildTermFilter(search));
    }

    const query = clauses.length === 1 ? clauses[0] : { $and: clauses };

    let products = await Product.find(query)
      .populate('categoria', 'nombre color')
      .sort({ nombre: 1 });

    if (sort === 'masVendidos') {
      const salesCount = await Sale.aggregate([
        { $match: { estado: 'completada' } },
        { $unwind: '$items' },
        { $match: { 'items.producto': { $ne: null } } },
        { $group: { _id: '$items.producto', total: { $sum: '$items.cantidad' } } }
      ]);
      const salesMap = new Map(salesCount.map(s => [String(s._id), s.total]));
      products.sort((a, b) => {
        const sa = salesMap.get(String(a._id)) || 0;
        const sb = salesMap.get(String(b._id)) || 0;
        return sb - sa || a.nombre.localeCompare(b.nombre, 'es');
      });
    }

    if (lowStock === 'true') {
      products = products.filter(p => p.stock <= p.stockMinimo);
    }

    products.forEach(p => {
      if (p.esBolsaAlimento && p.gramosBolsaAbierta == null) p.gramosBolsaAbierta = 0;
    });

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener productos' });
  }
};

// @desc    Obtener producto por ID
// @route   GET /api/products/:id
// @access  Private
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('categoria', 'nombre color');

    if (product && product.activo) {
      if (product.esBolsaAlimento && product.gramosBolsaAbierta == null) product.gramosBolsaAbierta = 0;
      res.json(product);
    } else {
      res.status(404).json({ message: 'Producto no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener producto' });
  }
};

// @desc    Abrir manualmente una bolsa de alimento para venta suelta
// @route   POST /api/products/:id/abrir-bolsa
// @access  Private
const abrirBolsa = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    if (!product.esBolsaAlimento || !product.kilosPorBolsa || product.kilosPorBolsa <= 0) {
      return res.status(400).json({ message: 'El producto no es una bolsa de alimento fraccionable' });
    }
    if ((Number(product.gramosBolsaAbierta) || 0) > 0) {
      return res.status(400).json({ message: 'Ya hay una bolsa abierta para este producto' });
    }
    if (product.stock < 1) {
      return res.status(400).json({ message: 'No hay bolsas selladas para abrir' });
    }

    const stockAnterior = product.stock;
    product.stock -= 1;
    product.gramosBolsaAbierta = product.kilosPorBolsa * 1000;
    await product.save();

    await StockMovement.create({
      producto: product._id,
      tipo: 'salida',
      cantidad: 1,
      stockAnterior,
      stockNuevo: product.stock,
      motivo: 'Apertura manual de bolsa suelta',
      usuario: req.user._id
    });

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Error al abrir la bolsa' });
  }
};

// @desc    Crear producto
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  try {
    const {
      nombre, descripcion, sku, categoria, precioCompra, precioVenta,
      stock, stockMinimo, unidadMedida, proveedor, imagen,
      esBolsaAlimento, kilosPorBolsa, precioKilo, margenSuelto, esGenerico, notasIA, aspectoBolsa,
      mostrarEnCatalogo,
    } = req.body;

    let finalSku = sku;
    if (!finalSku) {
      finalSku = await Product.generarSKU(nombre, false);
    } else {
      const productExists = await Product.findOne({ sku: finalSku });
      if (productExists) {
        return res.status(400).json({ message: 'El SKU ya está en uso' });
      }
    }

    const productData = {
      nombre, descripcion, categoria, precioCompra, precioVenta,
      stock: stock || 0, stockMinimo, unidadMedida, proveedor, imagen,
      esBolsaAlimento, kilosPorBolsa, precioKilo, margenSuelto, esGenerico, notasIA, aspectoBolsa,
      mostrarEnCatalogo: mostrarEnCatalogo !== undefined ? mostrarEnCatalogo : true,
      sku: finalSku,
    };

    const product = await Product.create(productData);

    if (stock > 0) {
      await StockMovement.create({
        producto: product._id,
        tipo: 'entrada',
        cantidad: stock,
        stockAnterior: 0,
        stockNuevo: stock,
        motivo: 'Stock inicial',
        usuario: req.user._id
      });
    }

    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear producto' });
  }
};

// @desc    Actualizar producto
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (product) {
      product.nombre = req.body.nombre || product.nombre;
      product.descripcion = req.body.descripcion || product.descripcion;
      product.sku = req.body.sku || product.sku;
      if (req.body.categoria) product.categoria = req.body.categoria;
      if (req.body.precioCompra !== undefined) product.precioCompra = req.body.precioCompra;
      if (req.body.precioVenta !== undefined) product.precioVenta = req.body.precioVenta;
      if (req.body.stockMinimo !== undefined) product.stockMinimo = req.body.stockMinimo;
      product.unidadMedida = req.body.unidadMedida || product.unidadMedida;
      product.proveedor = req.body.proveedor || product.proveedor;
      product.imagen = req.body.imagen || product.imagen;
      if (req.body.esBolsaAlimento !== undefined) product.esBolsaAlimento = req.body.esBolsaAlimento;
      if (req.body.kilosPorBolsa !== undefined) product.kilosPorBolsa = req.body.kilosPorBolsa;
      if (req.body.precioKilo !== undefined) product.precioKilo = req.body.precioKilo;
      if (req.body.margenSuelto !== undefined) product.margenSuelto = req.body.margenSuelto;
      if (req.body.esGenerico !== undefined) product.esGenerico = req.body.esGenerico;
      if (req.body.notasIA !== undefined) product.notasIA = req.body.notasIA;
      if (req.body.aspectoBolsa !== undefined) product.aspectoBolsa = req.body.aspectoBolsa;
      if (req.body.mostrarEnCatalogo !== undefined) product.mostrarEnCatalogo = req.body.mostrarEnCatalogo;

      if (req.body.stock !== undefined && Number(req.body.stock) !== product.stock) {
        const stockAnterior = product.stock;
        product.stock = Number(req.body.stock);
        await StockMovement.create({
          producto: product._id,
          tipo: 'ajuste',
          cantidad: Math.abs(product.stock - stockAnterior),
          stockAnterior,
          stockNuevo: product.stock,
          motivo: 'Ajuste manual desde edición de producto',
          usuario: req.user._id
        });
      }

      const updatedProduct = await product.save();
      res.json(updatedProduct);
    } else {
      res.status(404).json({ message: 'Producto no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar producto' });
  }
};

// @desc    Eliminar producto (Soft delete)
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (product) {
      product.activo = false;
      await product.save();
      res.json({ message: 'Producto desactivado' });
    } else {
      res.status(404).json({ message: 'Producto no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar producto' });
  }
};

// @desc    Ajustar stock de un producto manually
// @route   PATCH /api/products/:id/stock
// @access  Private
const adjustStock = async (req, res) => {
  try {
    const { cantidad, tipo, motivo } = req.body;
    // tipo: 'entrada' | 'salida' | 'ajuste'

    if (!cantidad || cantidad <= 0 || !tipo) {
      return res.status(400).json({ message: 'Datos de ajuste inválidos' });
    }

    const product = await Product.findById(req.params.id);

    if (product) {
      const stockAnterior = product.stock;
      let stockNuevo = stockAnterior;

      if (tipo === 'entrada' || tipo === 'ajuste' && cantidad > 0) { // Si ajuste, asumimos q puede ser un overwrite, pero el modelo dice qty
        stockNuevo = stockAnterior + Number(cantidad);
      } else if (tipo === 'salida') {
        if (stockAnterior < cantidad) return res.status(400).json({ message: 'No hay suficiente stock' });
        stockNuevo = stockAnterior - Number(cantidad);
      }

      product.stock = stockNuevo;
      await product.save();

      const movement = await StockMovement.create({
        producto: product._id,
        tipo,
        cantidad: Number(cantidad),
        stockAnterior,
        stockNuevo,
        motivo: motivo || 'Ajuste manual',
        usuario: req.user._id
      });

      res.json({ product, movement });
    } else {
      res.status(404).json({ message: 'Producto no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error al ajustar stock' });
  }
};

// @desc    Obtener productos bajo stock mínimo
// @route   GET /api/products/low-stock
// @access  Private
const getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.find({ activo: true })
      .populate('categoria', 'nombre');
    
    const lowStock = products.filter(p => p.stock <= p.stockMinimo);
    res.json(lowStock);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener bajo stock' });
  }
};

// @desc    Ejecutar acción masiva sobre múltiples productos
// @route   POST /api/products/bulk-action
// @access  Private/Admin
const bulkAction = async (req, res) => {
  try {
    const { ids, accion, valor } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Debe seleccionar al menos un producto' });
    }
    if (!accion) {
      return res.status(400).json({ message: 'Acción no especificada' });
    }

    const products = await Product.find({ _id: { $in: ids }, activo: true });
    const stockMovements = [];
    const bulkOps = [];

    for (const product of products) {
      switch (accion) {
        case 'eliminar':
          bulkOps.push({ updateOne: { filter: { _id: product._id }, update: { $set: { activo: false } } } });
          break;

        case 'limpiar_stock':
          stockMovements.push({
            producto: product._id, tipo: 'ajuste',
            cantidad: product.stock, stockAnterior: product.stock, stockNuevo: 0,
            motivo: 'Limpieza masiva de stock', usuario: req.user._id
          });
          bulkOps.push({ updateOne: { filter: { _id: product._id }, update: { $set: { stock: 0 } } } });
          break;

        case 'agregar_stock': {
          const cantidad = Number(valor) || 0;
          if (cantidad <= 0) break;
          const nuevoStock = product.stock + cantidad;
          stockMovements.push({
            producto: product._id, tipo: 'entrada',
            cantidad, stockAnterior: product.stock, stockNuevo: nuevoStock,
            motivo: `Adición masiva de stock (+${cantidad})`, usuario: req.user._id
          });
          bulkOps.push({ updateOne: { filter: { _id: product._id }, update: { $set: { stock: nuevoStock } } } });
          break;
        }

        case 'aplicar_margen_venta': {
          // Aumenta el precioVenta en X% sobre el precioVenta actual
          const pct = Number(valor) || 0;
          if (pct === 0) break;
          const nuevoPrecioVenta = parseFloat((product.precioVenta * (1 + pct / 100)).toFixed(2));
          bulkOps.push({ updateOne: { filter: { _id: product._id }, update: { $set: { precioVenta: nuevoPrecioVenta } } } });
          break;
        }

        case 'aplicar_margen_costo': {
          // Sube el precioVenta en X% sobre el precioCompra
          const pct = Number(valor) || 0;
          if (pct === 0) break;
          const nuevoPrecioVenta = parseFloat((product.precioCompra * (1 + pct / 100)).toFixed(2));
          bulkOps.push({ updateOne: { filter: { _id: product._id }, update: { $set: { precioVenta: nuevoPrecioVenta } } } });
          break;
        }

        case 'mostrar_en_catalogo':
          bulkOps.push({ updateOne: { filter: { _id: product._id }, update: { $set: { mostrarEnCatalogo: true } } } });
          break;

        case 'ocultar_del_catalogo':
          bulkOps.push({ updateOne: { filter: { _id: product._id }, update: { $set: { mostrarEnCatalogo: false } } } });
          break;

        default:
          return res.status(400).json({ message: `Acción desconocida: ${accion}` });
      }
    }

    if (bulkOps.length > 0) await Product.bulkWrite(bulkOps);
    if (stockMovements.length > 0) await StockMovement.insertMany(stockMovements);

    res.json({ message: `Acción '${accion}' aplicada a ${products.length} producto(s)`, afectados: products.length });
  } catch (error) {
    res.status(500).json({ message: 'Error al ejecutar acción masiva: ' + error.message });
  }
};

const getProductsWithoutMovement = async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 3;
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const productsWithSales = await Sale.aggregate([
      { $match: { estado: 'completada', fecha: { $gte: since } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.producto' } }
    ]);

    const soldIds = productsWithSales.map(p => p._id);
    const products = await Product.find({
      activo: true,
      _id: { $nin: soldIds }
    }).populate('categoria', 'nombre');

    res.json({ months, total: products.length, products });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener productos sin movimiento' });
  }
};

const getPublicCatalog = async (req, res) => {
  try {
    const products = await Product.find({ activo: true, mostrarEnCatalogo: { $ne: false } })
      .populate('categoria', 'nombre color')
      .sort({ nombre: 1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener catálogo' });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  getLowStockProducts,
  bulkAction,
  getProductsWithoutMovement,
  getPublicCatalog,
  abrirBolsa
};
