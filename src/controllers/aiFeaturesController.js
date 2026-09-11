const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Customer = require('../models/Customer');
const AIFeatureHistory = require('../models/AIFeatureHistory');
const { callOpenAI } = require('../utils/aiClient');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const callWeb = async (prompt) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');
  const modelo = process.env.OPENAI_WEB_MODEL || 'gpt-4o-mini';

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelo,
      tools: [{ type: 'web_search' }],
      input: [
        { role: 'system', content: 'Sos un experto en comercio de mascotas en Argentina. Respondé con JSON válido. Sin backticks, sin texto extra. Solo el JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error OpenAI (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const messageText = (data?.output || [])
    .filter((o) => o.type === 'message')
    .flatMap((m) => m.content || [])
    .filter((c) => c.text)
    .map((c) => c.text)
    .join('\n');

  if (!messageText) throw new Error('Sin respuesta de IA');

  const annotations = (data?.output || [])
    .flatMap((o) => o.content || [])
    .flatMap((c) => c.annotations || []);
  const fuentes = annotations
    .filter((a) => a.type === 'url_citation')
    .map((a) => ({ titulo: a.title || a.url, url: a.url }));

  let cleaned = messageText.trim();
  const fence = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fence) cleaned = fence[1].trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    if (s !== -1 && e > s) {
      try { parsed = JSON.parse(cleaned.slice(s, e + 1)); } catch { parsed = null; }
    }
  }

  if (!parsed) {
    parsed = { resumen: cleaned, items: [] };
  }

  return { ...parsed, fuentes };
};

// ─── 1. RE-STOCK INTELIGENTE ────────────────────────────────────
const analizarRestock = async (req, res) => {
  try {
    const products = await Product.find({ activo: true }).populate('categoria', 'nombre');

    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    const ventas = await Sale.find({ fecha: { $gte: hace30 }, estado: 'completada' }).select('items fecha');

    const salesMap = {};
    ventas.forEach((sale) => {
      sale.items.forEach((item) => {
        const pid = item.producto?.toString();
        if (!pid) return;
        if (!salesMap[pid]) salesMap[pid] = { total: 0, dias: new Set() };
        salesMap[pid].total += item.cantidad;
        salesMap[pid].dias.add(sale.fecha.toISOString().split('T')[0]);
      });
    });

    const stockData = products.map((p) => {
      const s = salesMap[p._id.toString()] || { total: 0, dias: new Set() };
      const promedioDiario = s.total / 30;
      const diasHasta = promedioDiario > 0 ? Math.round(p.stock / promedioDiario) : 999;
      return {
        id: p._id, nombre: p.nombre, sku: p.sku,
        categoria: p.categoria?.nombre || 'Sin categoría',
        stock: p.stock, stockMinimo: p.stockMinimo,
        unidadMedida: p.unidadMedida,
        precioVenta: p.precioVenta, precioCompra: p.precioCompra,
        proveedor: p.proveedor || 'Sin proveedor',
        vendidos30d: s.total, promedioDiario: Math.round(promedioDiario * 100) / 100,
        diasHasta, necesitaReponer: p.stock <= p.stockMinimo || diasHasta <= 7,
      };
    });

    const criticos = stockData.filter((p) => p.necesitaReponer)
      .sort((a, b) => a.diasHasta - b.diasHasta);

    const listado = criticos.slice(0, 15).map((p) =>
      `- ${p.nombre} (SKU ${p.sku}): stock ${p.stock} ${p.unidadMedida}, mínimo ${p.stockMinimo}, vende ${p.promedioDiario}/día, se agota en ${p.diasHasta} días, proveedor: ${p.proveedor}`
    ).join('\n');

    const prompt = listado
      ? `Analizá estos productos de una tienda de mascotas en Argentina que necesitan re-stock urgente:\n\n${listado}\n\nPara cada uno sugerí cantidad a reponer y prioridad. Respondé con JSON: { "analisis": "resumen breve", "productos": [ { "nombre": "...", "cantidadSugerida": N, "prioridad": "alta/media/baja", "motivo": "..." } ] }`
      : 'No hay productos criticos de stock. Respondé: { "analisis": "No hay productos que necesiten re-stock urgente", "productos": [] }';

    const ia = await callWeb(prompt);

    res.json({ stockData: criticos, totalProductos: products.length, totalCriticos: criticos.length, ia });

    AIFeatureHistory.create({
      tipo: 'restock', titulo: `Re-stock: ${criticos.length} productos críticos`,
      resultado: { stockData: criticos, totalProductos: products.length, totalCriticos: criticos.length, ia },
      empleado: req.user?._id,
    }).catch(() => {});
  } catch (error) {
    console.error('Error re-stock:', error);
    res.status(500).json({ message: 'Error al analizar re-stock' });
  }
};

// ─── 2. OPTIMIZADOR DE PRECIOS ──────────────────────────────────
const analizarPrecios = async (req, res) => {
  try {
    const products = await Product.find({ activo: true }).populate('categoria', 'nombre').limit(20);

    const lista = products.map((p) => {
      const margen = p.precioVenta > 0 ? Math.round(((p.precioVenta - p.precioCompra) / p.precioVenta) * 100) : 0;
      return { id: p._id, nombre: p.nombre, precioVenta: p.precioVenta, precioCompra: p.precioCompra, margen, categoria: p.categoria?.nombre || '' };
    });

    const listado = lista.map((p) => `- ${p.nombre}: precio venta $${p.precioVenta}, costo $${p.precioCompra}, margen ${p.margen}%, categoría: ${p.categoria}`).join('\n');

    const prompt = `Sos un experto en precios de productos para mascotas en Argentina. Analizá estos productos y buscá precios de referencia en internet:\n\n${listado}\n\nPara cada producto indicá si el precio es competitivo, muy alto o muy bajo. Respondé con JSON: { "resumen": "...", "productos": [ { "nombre": "...", "miPrecio": N, "precioReferencia": "rango en ARS", "estado": "competitivo/alto/bajo", "sugerencia": "..." } ], "recomendacionesGenerales": "..." }`;

    const ia = await callWeb(prompt);

    res.json({ productos: lista, ia });

    AIFeatureHistory.create({
      tipo: 'precios', titulo: `Precios: ${lista.length} productos analizados`,
      resultado: { productos: lista, ia },
      empleado: req.user?._id,
    }).catch(() => {});
  } catch (error) {
    console.error('Error precios:', error);
    res.status(500).json({ message: 'Error al analizar precios' });
  }
};

// ─── 3. ANÁLISIS DE CLIENTES INACTIVOS ──────────────────────────
const analizarClientesInactivos = async (req, res) => {
  try {
    const clientes = await Customer.find({ activo: true });
    const hace90 = new Date();
    hace90.setDate(hace90.getDate() - 90);

    const ventas = await Sale.find({ estado: 'completada' }).select('cliente fecha totalFinal');

    const comprasMap = {};
    ventas.forEach((v) => {
      const cid = v.cliente?.toString();
      if (!cid) return;
      if (!comprasMap[cid]) comprasMap[cid] = { compras: 0, total: 0, ultima: null };
      comprasMap[cid].compras++;
      comprasMap[cid].total += v.totalFinal;
      if (!comprasMap[cid].ultima || v.fecha > comprasMap[cid].ultima) comprasMap[cid].ultima = v.fecha;
    });

    const ahora = new Date();
    const clientesData = clientes.map((c) => {
      const d = comprasMap[c._id.toString()];
      const ultima = d?.ultima;
      const dias = ultima ? Math.floor((ahora - new Date(ultima)) / 86400000) : null;
      return {
        id: c._id, nombre: c.nombre, telefono: c.telefono,
        esAfiliado: c.esAfiliado, puntos: c.puntos,
        totalCompras: d?.compras || 0, totalGastado: d?.total || 0,
        ultimaCompra: ultima, diasSinComprar: dias,
        esInactivo: !ultima || dias > 60,
      };
    });

    const inactivos = clientesData.filter((c) => c.esInactivo && c.totalCompras > 0);

    const listado = inactivos.slice(0, 10).map((c) =>
      `- ${c.nombre} (tel: ${c.telefono || 'sin tel'}): ${c.totalCompras} compras, $${c.totalGastado} gastados, última compra hace ${c.diasSinComprar} días, puntos: ${c.puntos}`
    ).join('\n');

    const prompt = listado
      ? `Sos un experto en retención de clientes de una tienda de mascotas en Argentina. Estos clientes están inactivos:\n\n${listado}\n\nSugerí estrategias de reactivación personalizadas. Respondé con JSON: { "resumen": "...", "clientes": [ { "nombre": "...", "nivel": "alto/medio/bajo", "estrategia": "...", "mensajeWhatsApp": "mensaje listo para enviar" } ], "estrategiasGenerales": ["..."] }`
      : 'No hay clientes inactivos con compras previas. Respondé: { "resumen": "No hay clientes inactivos para analizar", "clientes": [], "estrategiasGenerales": [] }';

    const ia = await callWeb(prompt);

    res.json({ clientes: inactivos, totalClientes: clientes.length, totalInactivos: inactivos.length, ia });

    AIFeatureHistory.create({
      tipo: 'clientes', titulo: `Clientes: ${inactivos.length} inactivos detectados`,
      resultado: { clientes: inactivos, totalClientes: clientes.length, totalInactivos: inactivos.length, ia },
      empleado: req.user?._id,
    }).catch(() => {});
  } catch (error) {
    console.error('Error clientes:', error);
    res.status(500).json({ message: 'Error al analizar clientes' });
  }
};

// ─── 4. PREDICCIÓN DE TENDENCIAS ────────────────────────────────
const analizarTendencias = async (req, res) => {
  try {
    const products = await Product.find({ activo: true }).select('nombre categoria').populate('categoria', 'nombre');
    const cats = [...new Set(products.map((p) => p.categoria?.nombre).filter(Boolean))];
    const catCounts = cats.map((c) => `${c}: ${products.filter((p) => p.categoria?.nombre === c).length} productos`);

    const prompt = `Sos un experto en tendencias de productos para mascotas en Argentina y el mundo (2025-2026). Mi tienda tiene estas categorías:\n\n${catCounts.join('\n')}\n\nBuscá en internet tendencias actuales: nuevas marcas, alimentación natural, suplementos, accesorios tech, etc. Recomendá qué categorías o productos agregar.\n\nRespondé con JSON: { "resumen": "...", "tendencias": [ { "tendencia": "...", "descripcion": "...", "relevancia": "alta/media/baja", "productosRecomendados": ["..."], "categoriaSugerida": "..." } ], "accionesConcretas": ["..."] }`;

    const ia = await callWeb(prompt);

    res.json({ categoriasActuales: cats, totalProductos: products.length, ia });

    AIFeatureHistory.create({
      tipo: 'tendencias', titulo: `Tendencias: ${cats.length} categorías analizadas`,
      resultado: { categoriasActuales: cats, totalProductos: products.length, ia },
      empleado: req.user?._id,
    }).catch(() => {});
  } catch (error) {
    console.error('Error tendencias:', error);
    res.status(500).json({ message: 'Error al analizar tendencias' });
  }
};

// ─── 5. GENERADOR DE PROMOCIONES IA ──────────────────────────────
const generarPromocionesIA = async (req, res) => {
  try {
    const products = await Product.find({ activo: true, stock: { $gt: 0 } }).populate('categoria', 'nombre');

    const hace60 = new Date();
    hace60.setDate(hace60.getDate() - 60);
    const ventas = await Sale.find({ fecha: { $gte: hace60 }, estado: 'completada' }).select('items');

    const ventasMap = {};
    ventas.forEach((sale) => {
      sale.items.forEach((item) => {
        const pid = item.producto?.toString();
        if (!pid) return;
        if (!ventasMap[pid]) ventasMap[pid] = 0;
        ventasMap[pid] += item.cantidad;
      });
    });

    const catalogo = products.map((p) => {
      const margen = p.precioVenta > 0 ? Math.round(((p.precioVenta - p.precioCompra) / p.precioVenta) * 100) : 0;
      return { id: p._id, nombre: p.nombre, cat: p.categoria?.nombre || '', precioVenta: p.precioVenta, precioCompra: p.precioCompra, margen, stock: p.stock, vendidos: ventasMap[p._id.toString()] || 0 };
    });

    const listado = catalogo.map((p) => `- ${p.nombre} (${p.cat}): $${p.precioVenta}, margen ${p.margen}%, stock ${p.stock}, vendidos 60d: ${p.vendidos}`).join('\n');

    const categoriasUnicas = [...new Set(catalogo.map(p => p.cat))];
    const tieneOtrasCats = categoriasUnicas.some(c => !/alimento|balancead|perro|gato/i.test(c));

    const prompt = `Sos un experto en promociones de una tienda de mascotas en Argentina. Estos son los productos:\n\n${listado}\n\nGenerá 5-8 promociones inteligentes: combos, descuentos, 2x1, impulsos. Considerá márgenes, stock y movimiento.\n\nREGLAS PARA COMBOS:\n- IDEAL: mezclar CATEGORÍAS DISTINTAS (ej: alimento + juguete, snack + accesorio).\n- ${tieneOtrasCats ? 'PRIORIZÁ combos cross-category.' : 'SOLO TENÉS categorías de alimento; PODÉS combinar Alimento Perro + Alimento Gato si tiene sentido comercial.'}\n- PRIORIZÁ estas categorías para combos: Juguetes, Accesorios, Pouches, Snacks, Higiene, Cama/Transporte.\n- El alimento balanceado (perro/gato) preferentemente como base principal, combinado con otra categoría.\n- Máximo 3 productos por combo.\n- Descuento 5-20% según margen: dejar mínimo 25% margen final.\n\nRespondé con JSON: { "resumen": "...", "promociones": [ { "nombre": "...", "tipo": "combo/descuento/2x1/impulso", "descripcion": "...", "productos": [ { "id": "...", "cantidad": 1, "categoria": "..." } ], "descuentoPorcentaje": N, "motivo": "...", "impactoEsperado": "..." } ] }`;

    const ia = await callWeb(prompt);

    // Validar y filtrar: solo productos que existan en mi catálogo
    const catalogoIds = new Set(catalogo.map(p => p.id.toString()));
    const catalogoNombres = new Map(catalogo.map(p => [p.nombre.toLowerCase(), p]));
    const catMap = new Map(catalogo.map(p => [p.id.toString(), p]));

    let promocionesValidas = (ia.promociones || []).map(promo => {
      const productosFiltrados = (promo.productos || [])
        .map(p => {
          let prod = null;
          // La IA a veces pone el nombre en "id" y a veces en "nombre"
          const searchId = p.id || p.nombre;
          if (searchId) {
            if (catalogoIds.has(searchId.toString())) {
              prod = catMap.get(searchId.toString());
            } else if (catalogoNombres.has(searchId.toString().toLowerCase())) {
              prod = catalogoNombres.get(searchId.toString().toLowerCase());
            }
          }
          if (!prod) return null;
          return {
            id: prod._id,
            nombre: prod.nombre,
            categoria: prod.cat,
            cantidad: p.cantidad || 1,
            precioVenta: prod.precioVenta,
            precioCompra: prod.precioCompra,
          };
        })
        .filter(Boolean);
      return { ...promo, productos: productosFiltrados };
    }).filter(p => p.productos.length >= 2);

    ia.promociones = promocionesValidas;

    res.json({ catalogo, ia });

    AIFeatureHistory.create({
      tipo: 'promos', titulo: `Promos IA: ${(ia.promociones || []).length} generadas`,
      resultado: { catalogo, ia },
      empleado: req.user?._id,
    }).catch(() => {});
  } catch (error) {
    console.error('Error promos:', error);
    res.status(500).json({ message: 'Error al generar promociones' });
  }
};

// ─── 6. CHATBOT CATÁLOGO ────────────────────────────────────────
const chatbotCatalogo = async (req, res) => {
  try {
    const { mensaje } = req.body;
    if (!mensaje?.trim()) return res.status(400).json({ message: 'Ingresá un mensaje' });

    const products = await Product.find({ activo: true }).populate('categoria', 'nombre');
    const catalogo = products.map((p) =>
      `${p._id}|${p.nombre}|${p.categoria?.nombre || ''}|$${p.precioVenta}|stock:${p.stock}|${p.unidadMedida}`
    ).join('\n');

    const prompt = `Sos el asistente virtual de "Poroto PetShop" (tienda de mascotas en Argentina). Catálogo:\n\n${catalogo}\n\nEl cliente dice: "${mensaje}"\n\nRecomendá productos del catálogo por su ID si corresponden. Respondé con JSON: { "respuesta": "tu mensaje amigable", "productosRecomendados": [ { "id": "...", "motivo": "..." } ] }`;

    const ia = await callWeb(prompt);

    const recomendados = [];
    if (ia.productosRecomendados) {
      for (const r of ia.productosRecomendados) {
        const p = products.find((x) => x._id.toString() === r.id);
        if (p) recomendados.push({ _id: p._id, nombre: p.nombre, precioVenta: p.precioVenta, stock: p.stock, unidadMedida: p.unidadMedida, categoria: p.categoria?.nombre, motivo: r.motivo });
      }
    }

    res.json({ respuesta: ia.respuesta || 'Disculpá, intentá de nuevo.', productosRecomendados: recomendados });

    if (recomendados.length > 0) {
      AIFeatureHistory.create({
        tipo: 'chatbot', titulo: `Chatbot: ${mensaje.slice(0, 50)}`,
        parametros: { mensaje },
        resultado: { respuesta: ia.respuesta, productosRecomendados: recomendados },
      }).catch(() => {});
    }
} catch (error) {
    console.error('Error promos:', error);
    res.status(500).json({ message: 'Error al generar promociones' });
  }
};

// ─── 7. CREAR COMBO COMO PRODUCTO REAL ─────────────────────────────
const crearComboProducto = async (req, res) => {
  try {
    const { nombre, descripcion, items, descuentoPorcentaje, categoriaId, imagen } = req.body;

    if (!nombre || !items?.length) {
      return res.status(400).json({ message: 'Nombre e items son requeridos' });
    }

    // Resolver productos: si es ObjectId válido, buscar por _id; si no, por nombre
    const productos = await Product.find({ activo: true }).populate('categoria', 'nombre');
    const productosPorId = new Map(productos.map(p => [p._id.toString(), p]));
    const productosPorNombre = new Map(productos.map(p => [p.nombre.toLowerCase(), p]));

    let costoTotal = 0;
    let precioVentaTotal = 0;
    const comboItems = [];

    for (const item of items) {
      const searchKey = item.producto;
      let prod = null;
      
      if (!searchKey) {
        return res.status(400).json({ message: 'Producto requerido en items' });
      }
      
      if (productosPorId.has(searchKey)) {
        prod = productosPorId.get(searchKey);
      } else if (productosPorNombre.has(searchKey.toLowerCase())) {
        prod = productosPorNombre.get(searchKey.toLowerCase());
      }
      
      if (!prod) {
        return res.status(400).json({ message: `Producto no encontrado: ${searchKey}` });
      }

      const cant = item.cantidad || 1;
      const hayStock = prod.stock >= cant;
      
      costoTotal += prod.precioCompra * cant;
      precioVentaTotal += prod.precioVenta * cant;
      comboItems.push({ producto: prod._id, cantidad: cant, hayStock });
    }

    const descuento = descuentoPorcentaje || 0;
    const precioVentaFinal = Math.round(precioVentaTotal * (1 - descuento / 100));
    const margen = precioVentaFinal > 0 ? Math.round(((precioVentaFinal - costoTotal) / precioVentaFinal) * 100) : 0;

    if (margen < 15) {
      return res.status(400).json({ message: `Margen muy bajo (${margen}%). Ajustá descuento o productos.` });
    }

    const sku = await Product.generarSKU(nombre, true);

    const combo = new Product({
      nombre,
      descripcion: descripcion || `Combo: ${comboItems.map(ci => productosPorId.get(ci.producto.toString())?.nombre).join(' + ')}`,
      sku,
      categoria: categoriaId || comboItems[0]?.producto ? productosPorId.get(comboItems[0].producto.toString())?.categoria?._id : undefined,
      precioCompra: costoTotal,
      precioVenta: precioVentaFinal,
      stock: 999,
      stockMinimo: 0,
      unidadMedida: 'unidad',
      proveedor: 'Combo IA',
      imagen: imagen || (comboItems[0]?.producto ? productosPorId.get(comboItems[0].producto.toString())?.imagen : '') || '',
      activo: true,
      esCombo: true,
      comboItems,
      notasIA: `Combo generado por IA con ${descuento}% descuento. Margen: ${margen}%`,
    });

    await combo.save();
    await combo.populate('categoria', 'nombre');
    await combo.populate('comboItems.producto', 'nombre precioVenta precioCompra');

    const sinStock = comboItems.filter(ci => !ci.hayStock).map(ci => {
      const p = productosPorId.get(ci.producto.toString());
      return p?.nombre || ci.producto;
    });

    res.status(201).json({
      combo,
      stats: {
        costoTotal,
        precioVentaOriginal: precioVentaTotal,
        descuentoPorcentaje: descuento,
        precioVentaFinal,
        margenPorcentaje: margen,
        gananciaUnitaria: precioVentaFinal - costoTotal,
      },
      warnings: sinStock.length > 0 ? { sinStock, message: `Productos SIN stock: ${sinStock.join(', ')}. El combo se creó pero no podrá venderse en POS hasta reponer.` } : null,
    });
  } catch (error) {
    console.error('Error crear combo:', error);
    res.status(500).json({ message: 'Error al crear combo' });
  }
};

// ─── 8. ANÁLISIS DE VENTAS (reporte completo con IA) ─────────────
// Costo fijo mensual aproximado (debe coincidir con FIXED_COSTS_MONTHLY del Dashboard).
const COSTO_FIJO_MENSUAL = 1000000;
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// El local NO abre los domingos: el Domingo se marca como día de cierre.
const DIAS_CERRADOS = [0];

const formatMoney = (n) => '$' + Math.round(n || 0).toLocaleString('es-AR');

const analizarVentas = async (req, res) => {
  try {
    let desde = new Date();
    let hasta = new Date();
    let dias = 90;

    if (req.query.desde && req.query.hasta) {
      const d1 = new Date(req.query.desde + 'T00:00:00');
      const d2 = new Date(req.query.hasta + 'T00:00:00');
      if (isNaN(d1) || isNaN(d2) || d2 < d1) {
        return res.status(400).json({ message: 'Rango de fechas inválido' });
      }
      desde = d1;
      desde.setHours(0, 0, 0, 0);
      hasta = d2;
      hasta.setHours(23, 59, 59, 999);
      dias = Math.round((hasta - desde) / 86400000) + 1;
    } else {
      dias = Math.min(Math.max(parseInt(req.query.dias) || 90, 1), 730);
      desde.setDate(desde.getDate() - (dias - 1));
      desde.setHours(0, 0, 0, 0);
    }

    const [sales, products] = await Promise.all([
      Sale.find({ fecha: { $gte: desde, $lte: hasta }, estado: 'completada' })
        .select('fecha items totalFinal')
        .lean(),
      Product.find({ activo: true }).populate('categoria', 'nombre').lean(),
    ]);

    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const diasSemana = DIAS_SEMANA.map((nombre, i) => ({ nombre, cerrado: DIAS_CERRADOS.includes(i), ventas: 0, facturacion: 0 }));
    const horas = Array.from({ length: 24 }, (_, i) => ({ hora: i, ventas: 0, facturacion: 0 }));
    const porProducto = new Map();
    const porCategoria = new Map();

    let totalVentas = 0;
    let facturacion = 0;
    let costo = 0;
    let unidades = 0;

    for (const sale of sales) {
      const d = new Date(sale.fecha);
      const dia = d.getDay();
      const hora = d.getHours();

      totalVentas++;
      facturacion += sale.totalFinal || 0;
      diasSemana[dia].ventas++;
      diasSemana[dia].facturacion += sale.totalFinal || 0;
      horas[hora].ventas++;
      horas[hora].facturacion += sale.totalFinal || 0;

      for (const item of (sale.items || [])) {
        const pid = item.producto?.toString();
        if (!pid) continue;
        const itemCosto = (item.precioCompraHisto || 0) * (item.cantidad || 0);
        costo += itemCosto;
        unidades += item.cantidad || 0;

        let agg = porProducto.get(pid);
        if (!agg) { agg = { unidades: 0, facturacion: 0, costo: 0 }; porProducto.set(pid, agg); }
        agg.unidades += item.cantidad || 0;
        agg.facturacion += item.subtotal || 0;
        agg.costo += itemCosto;

        const product = productMap.get(pid);
        const cat = product?.categoria?.nombre || 'Sin categoría';
        let catAgg = porCategoria.get(cat);
        if (!catAgg) { catAgg = { unidades: 0, facturacion: 0, costo: 0 }; porCategoria.set(cat, catAgg); }
        catAgg.unidades += item.cantidad || 0;
        catAgg.facturacion += item.subtotal || 0;
        catAgg.costo += itemCosto;
      }
    }

    const round2 = (n) => Math.round((n || 0) * 100) / 100;

    const productosData = [...porProducto.entries()].map(([pid, agg]) => {
      const product = productMap.get(pid);
      const ganancia = agg.facturacion - agg.costo;
      return {
        id: pid,
        nombre: product?.nombre || 'Producto eliminado',
        sku: product?.sku || '',
        categoria: product?.categoria?.nombre || 'Sin categoría',
        unidadMedida: product?.unidadMedida || 'unidad',
        precioVenta: product?.precioVenta || 0,
        precioCompra: product?.precioCompra || 0,
        stock: product?.stock ?? 0,
        stockMinimo: product?.stockMinimo ?? 0,
        necesitaReponer: product ? product.stock <= product.stockMinimo : false,
        unidades: round2(agg.unidades),
        facturacion: round2(agg.facturacion),
        costo: round2(agg.costo),
        ganancia: round2(ganancia),
        margenPct: agg.facturacion > 0 ? Math.round((ganancia / agg.facturacion) * 100) : 0,
      };
    }).sort((a, b) => b.facturacion - a.facturacion);

    const categoriasData = [...porCategoria.entries()].map(([nombre, agg]) => ({
      nombre,
      unidades: round2(agg.unidades),
      facturacion: round2(agg.facturacion),
      costo: round2(agg.costo),
      ganancia: round2(agg.facturacion - agg.costo),
      margenPct: agg.facturacion > 0 ? Math.round(((agg.facturacion - agg.costo) / agg.facturacion) * 100) : 0,
    })).sort((a, b) => b.facturacion - a.facturacion);

    const gananciaTotal = facturacion - costo;
    const margenGlobal = facturacion > 0 ? Math.round((gananciaTotal / facturacion) * 100) : 0;
    const ticketPromedio = totalVentas > 0 ? Math.round(facturacion / totalVentas) : 0;

    const topFacturacion = productosData.slice(0, 15);
    const topGanancia = [...productosData].sort((a, b) => b.ganancia - a.ganancia).slice(0, 10);

    const diasTexto = diasSemana
      .map((d) => `- ${d.nombre}${d.cerrado ? ' (CERRADO)' : ''}: ${formatMoney(d.facturacion)} / ${d.ventas} ventas`)
      .join('\n');

    const topHoras = [...horas].sort((a, b) => b.facturacion - a.facturacion).filter((h) => h.ventas > 0);
    const horasPico = topHoras.slice(0, 4).map((h) => `- ${String(h.hora).padStart(2, '0')}:00 hs → ${formatMoney(h.facturacion)} en ${h.ventas} ventas`).join('\n') || '- sin datos';
    const horasFlojas = topHoras.slice(-3).map((h) => `- ${String(h.hora).padStart(2, '0')}:00 hs → ${formatMoney(h.facturacion)} en ${h.ventas} ventas`).join('\n') || '- sin datos';

    const topFacturacionTexto = topFacturacion.map((p) =>
      `- ${p.nombre} (${p.categoria}): ${p.unidades} uds, ${formatMoney(p.facturacion)}, ganancia ${formatMoney(p.ganancia)} (${p.margenPct}%), stock ${p.stock}${p.necesitaReponer ? ' (REPONER)' : ''}`
    ).join('\n');

    const topGananciaTexto = topGanancia.map((p) =>
      `- ${p.nombre}: ganancia ${formatMoney(p.ganancia)} (${p.margenPct}%), vende ${p.unidades} uds, stock ${p.stock}`
    ).join('\n');

    const categoriasTexto = categoriasData.map((c) =>
      `- ${c.nombre}: ${formatMoney(c.facturacion)} / ganancia ${formatMoney(c.ganancia)} (${c.margenPct}%)`
    ).join('\n');

    const prompt = `Sos un analista financiero y experto en retail de mascotas en Argentina. Analizá el rendimiento de la tienda "Poroto PetShop".

PERIODO: ${desde.toISOString().slice(0, 10)} hasta ${hasta.toISOString().slice(0, 10)} (${dias} días)
VENTAS: ${totalVentas} | FACTURACIÓN: ${formatMoney(facturacion)} | COSTO MERCADERÍA: ${formatMoney(costo)} | GANANCIA ESTIMADA: ${formatMoney(gananciaTotal)} | MARGEN GLOBAL: ${margenGlobal}%
TICKET PROMEDIO: ${formatMoney(ticketPromedio)} | COSTO FIJO ESTIMADO MENSUAL: ${formatMoney(COSTO_FIJO_MENSUAL)} (para evaluar rentabilidad)

IMPORTANTE: el local está CERRADO los domingos (no abre). El Domingo va a figurar sin ventas por eso, salvo ventas excepcionales. NO lo consideres un "peor día", NO lo marques como problema y NO sugieras abrir los domingos.

FACTURACIÓN POR DÍA DE SEMANA:
${diasTexto}

HORARIOS CON MÁS VENTA:
${horasPico}

HORARIOS MÁS FLOJOS:
${horasFlojas}

TOP PRODUCTOS POR FACTURACIÓN:
${topFacturacionTexto || '- sin datos'}

TOP PRODUCTOS POR GANANCIA:
${topGananciaTexto || '- sin datos'}

RENTABILIDAD POR CATEGORÍA:
${categoriasTexto || '- sin datos'}

Respondé EXCLUSIVAMENTE con JSON válido (sin backticks, sin texto extra) en este formato:
{
  "resumen": "Análisis general en 2-4 oraciones, incluyendo si el negocio es rentable considerando costos fijos",
  "mejoresDias": ["día o días con mejor desempeño y por qué"],
  "peoresDias": ["día o días con peor desempeño y por qué"],
  "productosParaInvertir": [ { "nombre": "nombre exacto del producto", "prioridad": "alta/media/baja", "motivo": "por qué conviene invertir/reponer" } ],
  "categoriasDestacadas": ["categorías más rentables"],
  "accionesConcretas": ["acción accionable para los próximos 7 días"],
  "riesgos": ["riesgo identificado"],
  "proyeccionProximaSemana": { "facturacionEstimada": N, "explicacion": "cómo llegaste a ese número" }
}`;

    const ia = await callOpenAI(
      'Sos un analista de datos de ventas. Siempre respondés con JSON válido.',
      prompt
    );

    const resultado = {
      period: {
        desde: desde.toISOString().slice(0, 10),
        hasta: hasta.toISOString().slice(0, 10),
        dias,
      },
      resumen: {
        ventas: totalVentas,
        facturacion: round2(facturacion),
        costo: round2(costo),
        ganancia: round2(gananciaTotal),
        margenPct: margenGlobal,
        ticketPromedio,
        unidades: round2(unidades),
        costoFijoMensual: COSTO_FIJO_MENSUAL,
      },
      diasCerrados: DIAS_CERRADOS.map((i) => DIAS_SEMANA[i]),
      diasSemana,
      horas: horas.filter((h) => h.ventas > 0),
      categorias: categoriasData,
      productos: productosData,
      ia,
    };

    res.json(resultado);

    AIFeatureHistory.create({
      tipo: 'ventas',
      titulo: `Análisis de ventas: ${formatMoney(facturacion)} en ${dias} días`,
      parametros: { dias },
      resultado,
      empleado: req.user?._id,
    }).catch(() => {});
  } catch (error) {
    console.error('Error analizar ventas:', error);
    res.status(500).json({ message: 'Error al analizar ventas' });
  }
};

module.exports = {
  analizarRestock,
  analizarPrecios,
  analizarClientesInactivos,
  analizarTendencias,
  generarPromocionesIA,
  chatbotCatalogo,
  crearComboProducto,
  analizarVentas,
};
