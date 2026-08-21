const Product = require('../models/Product');
const { generarRecomendaciones, compararProductos, buscarEnInternet } = require('../utils/aiClient');

const normalize = (s = '') =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Fallback sin IA: puntúa cada producto según coincidencia de palabras
// en nombre, descripción, categoría y SKU.
const fallbackRecomendaciones = (consulta, catalogo) => {
  const tokens = normalize(consulta).split(/\s+/).filter((t) => t.length > 1);

  if (tokens.length === 0) return [];

  const scored = catalogo
    .map((p) => {
      const text = normalize(`${p.nombre} ${p.descripcion || ''} ${p.categoria?.nombre || ''} ${p.sku}`);
      let score = 0;
      const matched = [];
      for (const t of tokens) {
        if (text.includes(t)) {
          score++;
          matched.push(t);
        }
      }
      return { p, score, matched };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored.map(({ p, matched }) => ({
    producto: p,
    motivo: `Coincide con: ${matched.join(', ')}`,
  }));
};

// @desc    Recomendar productos según la consulta del cliente
// @route   POST /api/recommendations
// @access  Private
const recommendProducts = async (req, res) => {
  try {
    const { consulta } = req.body;

    if (!consulta || !consulta.trim()) {
      return res.status(400).json({ message: 'Escriba qué busca el cliente' });
    }

    const catalogo = await Product.find({ activo: true, stock: { $gt: 0 }, esGenerico: false })
      .populate('categoria', 'nombre')
      .select('nombre descripcion sku categoria precioVenta precioCompra stock stockMinimo unidadMedida esBolsaAlimento kilosPorBolsa imagen');

    if (catalogo.length === 0) {
      return res.status(400).json({ message: 'No hay productos en stock para recomendar' });
    }

    let recomendaciones = [];
    let fuente = 'ia';

    // 1) Intentar con IA
    try {
      const raw = await generarRecomendaciones({ consulta, catalogo });
      const map = new Map(catalogo.map((p) => [String(p._id), p]));
      const seen = new Set();

      for (const r of raw) {
        const product = map.get(String(r.id));
        if (!product || seen.has(String(product._id))) continue;
        seen.add(String(product._id));
        recomendaciones.push({ producto: product, motivo: r.motivo || '' });
        if (recomendaciones.length >= 5) break;
      }
    } catch (aiError) {
      // 2) Fallback local si la IA falla o no está configurada
      recomendaciones = fallbackRecomendaciones(consulta, catalogo);
      fuente = 'local';
    }

    if (recomendaciones.length === 0) {
      recomendaciones = fallbackRecomendaciones(consulta, catalogo);
      fuente = 'local';
    }

    if (recomendaciones.length === 0) {
      return res.status(404).json({ message: 'No se encontraron productos que coincidan con la consulta' });
    }

    res.json({ consulta, recomendaciones, fuente });
  } catch (error) {
    res.status(500).json({ message: 'Error al recomendar productos' });
  }
};

// Fallback sin IA para comparación de dos productos
const fmtPrecio = (n) => n == null ? '—' : `$${n.toLocaleString('es-AR')}`;
const precioPorKg = (p) => p.precioKilo || (p.esBolsaAlimento && p.kilosPorBolsa ? p.precioVenta / p.kilosPorBolsa : null);
const presentacion = (p) => p.esBolsaAlimento && p.kilosPorBolsa ? `Bolsa de ${p.kilosPorBolsa} kg` : `Por ${p.unidadMedida}`;

const fallbackComparacion = (productos) => {
  const tabla = [];

  const addRow = (atributo, getValor) => {
    tabla.push({ atributo, valores: productos.map(getValor) });
  };

  addRow('Categoría', (p) => p.categoria?.nombre || '—');
  addRow('Presentación', (p) => presentacion(p));
  addRow('Precio de venta', (p) => fmtPrecio(p.precioVenta));
  if (productos.every((p) => precioPorKg(p))) {
    addRow('Precio por kg', (p) => fmtPrecio(precioPorKg(p)));
  }
  addRow('Stock disponible', (p) => `${p.stock} (mín ${p.stockMinimo})`);
  addRow('Proveedor', (p) => p.proveedor || '—');
  addRow('Descripción', (p) => p.descripcion || '—');

  const winner = productos.every((p) => precioPorKg(p))
    ? productos.reduce((min, p) => (precioPorKg(p) < precioPorKg(min) ? p : min))
    : productos.reduce((min, p) => (p.precioVenta < min.precioVenta ? p : min));

  return {
    resumen: 'Comparación generada sin IA (OPENAI_API_KEY no configurada o error de la IA). Se muestran los datos básicos de los productos seleccionados.',
    tabla_comparativa: tabla,
    puntos_fuertes: productos.map((p) => ({ producto: p.nombre, detalles: [] })),
    puntos_debiles: productos.map((p) => ({ producto: p.nombre, detalles: [] })),
    relacion_precio_calidad: {
      ganador: winner.nombre,
      detalle: `${winner.nombre} tiene el mejor precio${productos.every((p) => precioPorKg(p)) ? ' por kg' : ''}.`,
    },
    para_quien: [],
    veredicto: {
      ganador: winner.nombre,
      motivo: 'Mejor precio en la comparación.',
    },
    recomendacion_vendedor: 'Sin IA: revisá las descripciones y elegí según lo que pida el cliente.',
  };
};

const MAX_COMPARE_PRODUCTS = 4;

// @desc    Comparar N productos del catálogo con IA (detalle completo)
// @route   POST /api/recommendations/compare
// @access  Private
const compareProducts = async (req, res) => {
  try {
    const { productoIds } = req.body;

    if (!Array.isArray(productoIds) || productoIds.length < 2) {
      return res.status(400).json({ message: 'Seleccione al menos dos productos para comparar' });
    }
    if (productoIds.length > MAX_COMPARE_PRODUCTS) {
      return res.status(400).json({ message: `Máximo ${MAX_COMPARE_PRODUCTS} productos por comparación` });
    }

    const unique = [...new Set(productoIds.map((id) => String(id)))];
    if (unique.length !== productoIds.length) {
      return res.status(400).json({ message: 'No se puede comparar el mismo producto más de una vez' });
    }

    const encontrados = await Product.find({ _id: { $in: unique }, activo: true })
      .populate('categoria', 'nombre')
      .select('nombre descripcion sku categoria precioCompra precioVenta stock stockMinimo unidadMedida esBolsaAlimento kilosPorBolsa margenSuelto proveedor');

    if (encontrados.length !== unique.length) {
      return res.status(404).json({ message: 'No se encontraron todos los productos seleccionados' });
    }

    // Reordenar según el orden en que los envió el usuario
    const productos = unique.map((id) => encontrados.find((p) => String(p._id) === id));

    let data;
    let fuente = 'ia';

    // 1) Intentar con IA
    try {
      data = await compararProductos({ productos });
    } catch (aiError) {
      // 2) Fallback local si la IA falla o no está configurada
      data = fallbackComparacion(productos);
      fuente = 'local';
    }

    res.json({ productos, ...data, fuente });
  } catch (error) {
    res.status(500).json({ message: 'Error al comparar productos' });
  }
};

// @desc    Buscar en internet y comparar/recomendar según producto + referencia
// @route   POST /api/recommendations/web
// @access  Private
const recommendWeb = async (req, res) => {
  try {
    const { producto, referencia } = req.body;

    if (!producto || !producto.trim()) {
      return res.status(400).json({ message: 'Indique el producto que quiere comparar' });
    }

    const data = await buscarEnInternet({
      producto: producto.trim(),
      referencia: (referencia || '').trim(),
    });

    res.json({ producto: producto.trim(), referencia: (referencia || '').trim(), ...data });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = { recommendProducts, compareProducts, recommendWeb };