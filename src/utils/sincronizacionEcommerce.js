const http = require('http');
const https = require('https');

const API_URL = process.env.ECOMMERCE_API_URL || 'http://localhost:9090/api/admin/pos';
const API_KEY = process.env.ECOMMERCE_API_KEY || '';
const LOTE_TAMANO = 50;

const makeRequest = (path, body) => {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_URL}${path}`);
    const data = JSON.stringify(body);
    const isHttps = url.protocol === 'https:';

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const client = isHttps ? https : http;
    const req = client.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseData) });
        } catch {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
};

const mapearProducto = (producto) => ({
  sku: producto.sku,
  nombre: producto.nombre,
  descripcion: producto.descripcion || '',
  stock: Number(producto.stock) || 0,
  precioVenta: Number(producto.precioVenta) || 0,
  precioCosto: Number(producto.precioCompra) || 0,
  activo: producto.activo !== false,
  mostrarEnCatalogo: producto.mostrarEnCatalogo !== false,
  imagen: producto.imagen || '',
  categoria: producto.categoria?.nombre || '',
});

const debeSincronizarse = (producto) => {
  if (!producto.sku || !producto.nombre) return false;
  return true;
};

const sincronizarProducto = async (producto) => {
  try {
    if (!debeSincronizarse(producto)) {
      return { success: true, skipped: true, reason: 'Producto sin SKU o nombre' };
    }

    const payload = mapearProducto(producto);
    const response = await makeRequest('/products/single', payload);

    if (response.status >= 200 && response.status < 300) {
      console.log(`[ECOMMERCE] Producto sincronizado: ${producto.sku} - ${producto.nombre}`);
      return { success: true, sku: producto.sku, data: response.data };
    }

    console.error(`[ECOMMERCE] Error sincronizando ${producto.sku}: ${response.status}`, response.data);
    return { success: false, sku: producto.sku, status: response.status, data: response.data };
  } catch (error) {
    console.error(`[ECOMMERCE] Excepción sincronizando ${producto.sku}:`, error.message);
    return { success: false, sku: producto.sku, error: error.message };
  }
};

const sincronizarLote = async (productosMapeados) => {
  try {
    const response = await makeRequest('/products/batch', { products: productosMapeados });

    if (response.status >= 200 && response.status < 300) {
      const body = response.data && typeof response.data === 'object' ? response.data : {};
      const batch = body.data && typeof body.data === 'object' ? body.data : {};
      const resultados = Array.isArray(batch.results) ? batch.results : [];
      const erroresDetalle = Array.isArray(batch.errors) ? batch.errors : [];

      if (resultados.length > 0 || erroresDetalle.length > 0) {
        const nombres = new Map(productosMapeados.map((p) => [p.sku, p.nombre]));
        const importados = resultados.map((r) => ({
          sku: r.sku,
          nombre: nombres.get(r.sku) || '',
          success: true,
        }));
        const errores = erroresDetalle.map((e) => ({
          sku: e.sku,
          nombre: nombres.get(e.sku) || '',
          success: false,
          error: e.error || 'Error al importar en la tienda',
        }));

        return {
          success: errores.length === 0,
          importados,
          errores,
          count: importados.length,
          data: response.data,
        };
      }

      if (body.success === false) {
        const errores = productosMapeados.map((p) => ({
          sku: p.sku,
          nombre: p.nombre,
          success: false,
          error: body.message || 'La tienda rechazó la sincronización',
        }));
        return {
          success: false,
          importados: [],
          errores,
          count: 0,
          data: response.data,
        };
      }

      const importados = productosMapeados.map((p) => ({ sku: p.sku, nombre: p.nombre, success: true }));
      return {
        success: true,
        importados,
        errores: [],
        count: importados.length,
        data: response.data,
      };
    }

    console.error(`[ECOMMERCE] Error en lote: ${response.status}`, response.data);
    const errores = productosMapeados.map((p) => ({ sku: p.sku, nombre: p.nombre, success: false, status: response.status }));
    return {
      success: false,
      importados: [],
      errores,
      count: 0,
      data: response.data,
    };
  } catch (error) {
    console.error('[ECOMMERCE] Excepción en lote:', error.message);
    const errores = productosMapeados.map((p) => ({ sku: p.sku, nombre: p.nombre, success: false, error: error.message }));
    return {
      success: false,
      importados: [],
      errores,
      count: 0,
      error: error.message,
    };
  }
};

const sincronizarCatalogoCompleto = async (productos) => {
  const validos = productos.filter(debeSincronizarse).map(mapearProducto);

  if (validos.length === 0) {
    console.log('[ECOMMERCE] No hay productos válidos para sincronizar');
    return {
      success: true,
      total: 0,
      importados: 0,
      errores: 0,
      detalleImportados: [],
      detalleErrores: [],
      message: 'No hay productos válidos para sincronizar',
    };
  }

  const lotes = [];
  for (let i = 0; i < validos.length; i += LOTE_TAMANO) {
    lotes.push(validos.slice(i, i + LOTE_TAMANO));
  }

  console.log(`[ECOMMERCE] Sincronizando ${validos.length} productos en ${lotes.length} lote(s) de hasta ${LOTE_TAMANO}`);

  let totalImportados = 0;
  let totalErrores = 0;
  const detalleImportados = [];
  const detalleErrores = [];

  for (let i = 0; i < lotes.length; i++) {
    const lote = lotes[i];
    console.log(`[ECOMMERCE] Procesando lote ${i + 1}/${lotes.length} (${lote.length} productos)`);

    const resultado = await sincronizarLote(lote);

    if (resultado.importados && resultado.importados.length > 0) {
      totalImportados += resultado.importados.length;
      detalleImportados.push(...resultado.importados);
    }

    if (resultado.errores && resultado.errores.length > 0) {
      totalErrores += resultado.errores.length;
      detalleErrores.push(...resultado.errores);
    }
  }

  const resumen = {
    success: totalErrores === 0,
    total: validos.length,
    importados: totalImportados,
    errores: totalErrores,
    detalleImportados,
    detalleErrores,
    message: `Sincronización completada: ${totalImportados} importados, ${totalErrores} con error`,
  };

  console.log(`[ECOMMERCE] ${resumen.message}`);
  return resumen;
};

const sincronizarCatalogo = async (productos) => {
  return sincronizarCatalogoCompleto(productos);
};

module.exports = { sincronizarProducto, sincronizarCatalogo, sincronizarCatalogoCompleto };
