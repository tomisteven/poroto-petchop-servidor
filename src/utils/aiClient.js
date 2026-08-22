// Cliente de OpenAI para generación de promociones y recomendaciones con IA.
// Usa fetch nativo (Node 18+) contra la API de Chat Completions.

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

// Llamada base: arma el request y devuelve el JSON parseado.
const callOpenAI = async (system, prompt) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no está configurada en el servidor');
  }

  const modelo = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelo,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error de OpenAI (${response.status}): ${text.slice(0, 500)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI no devolvió contenido');

  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error('OpenAI devolvió JSON inválido');
  }
};

// ---------- PROMOCIONES ----------

const buildPromocionesPrompt = ({ productoPrincipal, catalogo }) => {
  const main = `PRODUCTO PRINCIPAL:
id: ${productoPrincipal._id}
nombre: ${productoPrincipal.nombre}
sku: ${productoPrincipal.sku}
categoria: ${productoPrincipal.categoria?.nombre || 'Sin categoría'}
precioVenta: ${productoPrincipal.precioVenta}
precioCompra: ${productoPrincipal.precioCompra}
stock: ${productoPrincipal.stock}
stockMinimo: ${productoPrincipal.stockMinimo}
unidadMedida: ${productoPrincipal.unidadMedida}
esBolsaAlimento: ${productoPrincipal.esBolsaAlimento}
kilosPorBolsa: ${productoPrincipal.kilosPorBolsa || 0}
margenGanancia: ${productoPrincipal.margenGanancia || 0}%
descripcion: ${productoPrincipal.descripcion || 'Sin descripción'}
`;

  const catalog = catalogo
    .map((p) => `${p._id}|${p.nombre}|${p.sku}|${p.categoria?.nombre || 'Sin categoría'}|precioVenta:${p.precioVenta}|precioCompra:${p.precioCompra}|stock:${p.stock}|unidadMedida:${p.unidadMedida}${p.esBolsaAlimento ? '|esBolsaAlimento:kilosPorBolsa:' + (p.kilosPorBolsa || 0) : ''}`)
    .join('\n');

  return [
    'Sos un experto en marketing y armado de combos para una tienda de mascotas/kiosco en Argentina. Tu objetivo es maximizar la venta cruzada y la ganancia.',
    '',
    main,
    '',
    'CATÁLOGO DE PRODUCTOS DISPONIBLES (formato: id|nombre|sku|categoria|precioVenta|precioCompra|stock|unidadMedida):',
    catalog,
    '',
    'Instrucciones:',
    '1. Generá entre 3 y 5 propuestas de PROMOCIÓN/COMBO que incluyan SIEMPRE al PRODUCTO PRINCIPAL combinado con 1 o más productos del catálogo (puede incluir varias unidades del mismo producto).',
    '2. Cada ítem de cada promoción debe referenciarse SOLO por su `id` EXACTO tal como figura en el catálogo. NO inventar ids.',
    '3. El descuento es un porcentaje (0-100) aplicado sobre el subtotal de venta del combo. Debe dejar un margen de ganancia razonable (idealmente 20-45%).',
    '4. Respetá el stock disponible y priorizá productos con buen margen. No incluyas productos con stock 0.',
    '5. Los nombres de las promociones deben ser atractivos para el cliente final, en español.',
    '',
    'Respondé EXCLUSIVAMENTE con JSON válido en este formato (sin texto adicional):',
    '{ "promociones": [ { "nombre": "...", "descripcion": "...", "items": [ { "id": "...", "cantidad": 2 } ], "descuento": 10 } ] }'
  ].join('\n');
};

const llamarIA = async (prompt) => {
  const parsed = await callOpenAI(
    'Sos un asistente que genera promociones de venta para un negocio. Siempre respondés con JSON válido.',
    prompt
  );

  if (!parsed.promociones || !Array.isArray(parsed.promociones)) {
    throw new Error('OpenAI no devolvió un arreglo de promociones');
  }

  return parsed.promociones;
};

// ---------- RECOMENDACIONES DE PRODUCTOS ----------

const buildRecomendacionesPrompt = ({ consulta, catalogo }) => {
  const catalog = catalogo
    .map((p) => `${p._id}|${p.nombre}|${p.sku}|${p.categoria?.nombre || 'Sin categoría'}|precioVenta:${p.precioVenta}|stock:${p.stock}|unidadMedida:${p.unidadMedida}${p.esBolsaAlimento ? '|esBolsaAlimento:kilosPorBolsa:' + (p.kilosPorBolsa || 0) : ''}|descripcion:${(p.descripcion || '').replace(/\n/g, ' ')}`)
    .join('\n');

  return [
    'Sos un vendedor experto de una tienda de mascotas/kiosco en Argentina. Un cliente hace una consulta y necesitás recomendarle los productos adecuados que TENÉS EN STOCK.',
    '',
    `CONSULTA DEL CLIENTE: "${consulta}"`,
    '',
    'CATÁLOGO DE PRODUCTOS EN STOCK (formato: id|nombre|sku|categoria|precioVenta|stock|unidadMedida|descripcion):',
    catalog,
    '',
    'Instrucciones:',
    '1. Elegí de 1 a 5 productos del catálogo que mejor resuelvan lo que pide el cliente, considerando nombre, categoría y descripción.',
    '2. Cada recomendación debe referenciarse SOLO por su `id` EXACTO tal como figura en el catálogo. NO inventar ids.',
    '3. Priorizá productos con stock disponible y, entre varias opciones equivalentes, la que tenga mejor precio para el cliente.',
    '4. El `motivo` debe explicar en 1 línea por qué ese producto sirve para la consulta del cliente, en español.',
    '',
    'Respondé EXCLUSIVAMENTE con JSON válido en este formato (sin texto adicional):',
    '{ "recomendaciones": [ { "id": "...", "motivo": "..." } ] }'
  ].join('\n');
};

const generarRecomendaciones = async ({ consulta, catalogo }) => {
  const prompt = buildRecomendacionesPrompt({ consulta, catalogo });
  const parsed = await callOpenAI(
    'Sos un asistente que recomienda productos de un catálogo. Siempre respondés con JSON válido.',
    prompt
  );

  if (!parsed.recomendaciones || !Array.isArray(parsed.recomendaciones)) {
    throw new Error('OpenAI no devolvió recomendaciones');
  }

  return parsed.recomendaciones;
};

// ---------- COMPARACIÓN DE PRODUCTOS DEL CATÁLOGO ----------

const fmtPrecio = (n) => n == null ? 'N/A' : `$${n.toLocaleString('es-AR')}`;
const precioPorKg = (p) => p.precioKilo || (p.esBolsaAlimento && p.kilosPorBolsa ? p.precioVenta / p.kilosPorBolsa : null);

const productInfo = (p) => [
  `id: ${p._id}`,
  `nombre: ${p.nombre}`,
  `sku: ${p.sku}`,
  `categoria: ${p.categoria?.nombre || 'Sin categoría'}`,
  `descripcion: ${(p.descripcion || 'Sin descripción').replace(/\n/g, ' ')}`,
  `precioCompra: ${fmtPrecio(p.precioCompra)}`,
  `precioVenta: ${fmtPrecio(p.precioVenta)}`,
  `precioPorKg: ${precioPorKg(p) ? fmtPrecio(precioPorKg(p)) : 'N/A (no es bolsa de alimento)'}`,
  `stock: ${p.stock}`,
  `stockMinimo: ${p.stockMinimo}`,
  `unidadMedida: ${p.unidadMedida}`,
  `esBolsaAlimento: ${p.esBolsaAlimento}`,
  `kilosPorBolsa: ${p.kilosPorBolsa || 'N/A'}`,
  `margenSuelto: ${p.margenSuelto || 0}%`,
  `proveedor: ${p.proveedor || 'Sin proveedor'}`,
].join('\n');

const buildCompararPrompt = ({ productos }) => {
  const blocks = productos
    .map((p, i) => `PRODUCTO ${i + 1}:\n${productInfo(p)}`)
    .join('\n\n');

  return [
    'Sos un experto en nutrición animal y asesor de ventas de una tienda de mascotas en Argentina. Necesito una comparación MUY DETALLADA entre los productos del catálogo que te paso, para recomendarle al vendedor cuál conviene ofrecer según el caso.',
    '',
    blocks,
    '',
    'Instrucciones:',
    '1. Compará SOLO con la información provista (nombres, descripciones, categorías, precios). No inventes ingredientes ni datos nutricionales que no figuren en la descripción.',
    '2. En tabla_comparativa incluí al menos 10 atributos relevantes: categoría, presentación/gramaje, precio de venta, precio por kg, stock disponible, perfil nutricional, ingredientes/beneficios destacados (según descripción), ideal para qué tipo de mascota, y cualquier diferencia clave. Cada fila tiene "valores": un arreglo con UN valor por producto, en el MISMO ORDEN en que están listados los productos (producto 1, producto 2, etc.).',
    '3. puntos_fuertes y puntos_debiles: arreglos con un objeto por producto: { "producto": "nombre exacto", "detalles": ["frase corta", ...] }.',
    '4. relacion_precio_calidad.ganador y veredicto.ganador deben ser el NOMBRE EXACTO del producto ganador, o "empate" si no hay diferencia clara.',
    '5. Redactá todo en español rioplatense.',
    '',
    'Respondé EXCLUSIVAMENTE con JSON válido en este formato (sin texto adicional):',
    '{',
    '  "resumen": "Resumen general de la comparación en 2-3 oraciones.",',
    '  "tabla_comparativa": [ { "atributo": "nombre del atributo", "valores": ["valor producto 1", "valor producto 2", ...] } ],',
    '  "puntos_fuertes": [ { "producto": "nombre exacto", "detalles": ["..."] } ],',
    '  "puntos_debiles": [ { "producto": "nombre exacto", "detalles": ["..."] } ],',
    '  "relacion_precio_calidad": { "ganador": "nombre exacto o empate", "detalle": "explicación" },',
    '  "para_quien": [ { "producto": "nombre exacto", "ideal_para": "para qué tipo de cliente o mascota es ideal" } ],',
    '  "veredicto": { "ganador": "nombre exacto", "motivo": "por qué es el ganador" },',
    '  "recomendacion_vendedor": "Qué producto recomendar y en qué situación, para el vendedor."',
    '}'
  ].join('\n');
};

const compararProductos = async ({ productos }) => {
  const prompt = buildCompararPrompt({ productos });
  const parsed = await callOpenAI(
    'Sos un asistente que genera comparaciones detalladas de productos. Siempre respondés con JSON válido.',
    prompt
  );

  if (!parsed.tabla_comparativa || !Array.isArray(parsed.tabla_comparativa)) {
    throw new Error('OpenAI no devolvió una comparación válida');
  }

  return parsed;
};

// ---------- BÚSQUEDA WEB (comparación y recomendaciones con info de internet) ----------

const buildBusquedaWebPrompt = ({ producto, referencia }) => {
  return [
    'Sos un asesor de ventas de una tienda de mascotas/kiosco en Argentina. Un cliente pide un producto o hace una consulta, y necesitás información actualizada de internet para decidir qué venderle.',
    '',
    `PRODUCTO / NECESIDAD DEL CLIENTE: ${producto}`,
    referencia ? `REFERENCIA / DATOS ADICIONALES: ${referencia}` : 'REFERENCIA / DATOS ADICIONALES: sin datos adicionales',
    '',
    'Buscá en internet información ACTUALIZADA sobre este producto, sus alternativas y precios aproximados en Argentina (en pesos argentinos). Considerá marcas, presentaciones, calidad y disponibilidad.',
    '',
    'Respondé EXCLUSIVAMENTE con JSON válido en este formato (sin texto adicional):',
    '{',
    '  "resumen": "Resumen general de la búsqueda en español, en 2 o 3 oraciones.",',
    '  "comparaciones": [',
    '    { "producto": "nombre", "marca": "marca", "precio_aprox": "precio o rango en ARS", "caracteristicas": "descripción breve", "pros": "ventaja", "contras": "desventaja" }',
    '  ],',
    '  "recomendaciones": [',
    '    { "producto": "nombre", "motivo": "por qué conviene venderlo" }',
    '  ],',
    '  "notas": "advertencias o información extra relevante para el vendedor"',
    '}'
  ].join('\n');
};

// Usa la Responses API de OpenAI con la herramienta de búsqueda web integrada.
const buscarEnInternet = async ({ producto, referencia }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no está configurada en el servidor');
  }

  const modelo = process.env.OPENAI_WEB_MODEL || 'gpt-4o-mini';
  const prompt = buildBusquedaWebPrompt({ producto, referencia });

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelo,
      tools: [{ type: 'web_search' }],
      input: [
        {
          role: 'system',
          content: 'Sos un asistente que busca información en internet. Respondé EXCLUSIVAMENTE con JSON válido, sin texto adicional antes o después.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error de OpenAI (${response.status}): ${text.slice(0, 500)}`);
  }

  const data = await response.json();

  const messageText = (data?.output || [])
    .filter((o) => o.type === 'message')
    .flatMap((m) => m.content || [])
    .filter((c) => c.text)
    .map((c) => c.text)
    .join('\n');

  if (!messageText) {
    throw new Error('OpenAI no devolvió contenido');
  }

  // Extraer citas/fuentes de los annotations
  const annotations = (data?.output || [])
    .flatMap((o) => o.content || [])
    .flatMap((c) => c.annotations || []);
  const fuentes = annotations
    .filter((a) => a.type === 'url_citation')
    .map((a) => ({ titulo: a.title || a.url, url: a.url }));

  let parsed;
  try {
    parsed = JSON.parse(messageText);
  } catch (e) {
    parsed = { resumen: messageText, comparaciones: [], recomendaciones: [], notas: '' };
  }

  return { ...parsed, fuentes };
};

module.exports = {
  buildPromocionesPrompt,
  llamarIA,
  generarRecomendaciones,
  compararProductos,
  buscarEnInternet,
};