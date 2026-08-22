 const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Expense = require('../models/Expense');

// Helper para obtener el inicio del día en Argentina (UTC-3)
const getArgStartOfDay = (date = new Date()) => {
  const argDateStr = date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const [y, m, d] = argDateStr.split('-').map(Number);
  // Argentina es UTC-3, por lo que 00:00 local es 03:00 UTC
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));
};

// Helper para obtener el rango de fechas según el período
const getDateRange = (period, dateStr, yearStr, monthStr) => {
  let start, end;
  const now = new Date();

  switch (period) {
    case 'daily':
      if (dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        start = new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));
      } else {
        start = getArgStartOfDay(now);
      }
      end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
      break;
    case 'weekly':
      // Para semanal, retrocedemos al principio de la semana según Arg
      if (dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        start = new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));
      } else {
        const argNow = getArgStartOfDay(now);
        // getDay() devuelve el día de la semana (0-6)
        // Pero tenemos que tener cuidado porque argNow es UTC (las 03:00)
        // La fecha UTC de argNow es el mismo día civil que en Arg
        const dayOfWeek = argNow.getUTCDay(); 
        start = new Date(argNow.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
      }
      end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      break;
    case 'monthly':
      const yStr = yearStr ? parseInt(yearStr) : parseInt(now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).split('-')[0]);
      const mStr = monthStr ? parseInt(monthStr) - 1 : parseInt(now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).split('-')[1]) - 1;
      start = new Date(Date.UTC(yStr, mStr, 1, 3, 0, 0, 0));
      end = new Date(Date.UTC(yStr, mStr + 1, 0, 23, 59, 59, 999) + 3 * 3600 * 1000);
      break;
    case 'annual':
      const yr = yearStr ? parseInt(yearStr) : parseInt(now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).split('-')[0]);
      start = new Date(Date.UTC(yr, 0, 1, 3, 0, 0, 0));
      end = new Date(Date.UTC(yr, 11, 31, 23, 59, 59, 999) + 3 * 3600 * 1000);
      break;
    default:
      start = new Date(0);
      end = new Date();
  }
  return { start, end };
};

const buildReportAggregation = async (startDate, endDate, groupByFormat) => {
  const matchStage = {
    $match: {
      fecha: { $gte: startDate, $lte: endDate },
      estado: 'completada'
    }
  };

  const mainStats = await Sale.aggregate([
    matchStage,
    {
      $unwind: '$items'
    },
    {
      $group: {
        _id: '$_id', // Agrupar por venta primero para sumar totales correctamente y no duplicar monto pagado
        totalFinal: { $first: '$totalFinal' },
        metodoPago: { $first: '$metodoPago' },
        fecha: { $first: '$fecha' },
        costoVenta: { $sum: { $multiply: ['$items.precioCompraHisto', '$items.cantidad'] } }
      }
    },
    {
      $group: {
        _id: groupByFormat ? { $dateToString: { format: groupByFormat, date: '$fecha' } } : null,
        totalVentas: { $sum: 1 },
        montoTotal: { $sum: '$totalFinal' },
        costoTotal: { $sum: '$costoVenta' }
      }
    },
    {
      $project: {
        totalVentas: 1,
        montoTotal: 1,
        costoTotal: 1,
        gananciaNeta: { $subtract: ['$montoTotal', '$costoTotal'] },
        ticketPromedio: { $divide: ['$montoTotal', { $cond: [{ $eq: ['$totalVentas', 0] }, 1, '$totalVentas'] }] }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const paymentMethods = await Sale.aggregate([
    matchStage,
    {
      $group: {
       _id: '$metodoPago',
       total: { $sum: '$totalFinal' },
       count: { $sum: 1 }
      }
    }
  ]);

  return {
    timeline: mainStats,
    paymentMethods
  };
};

const getReport = async (req, res, period, groupByFormat) => {
  try {
    const { date, year, month } = req.query;
    const { start, end } = getDateRange(period, date, year, month);

    const stats = await buildReportAggregation(start, end, groupByFormat);

    // Sumario total (ya que timeline puede venir separado por dias/horas)
    let totalVentas = 0;
    let montoTotal = 0;
    let costoTotal = 0;

    stats.timeline.forEach(t => {
      totalVentas += t.totalVentas;
      montoTotal += t.montoTotal;
      costoTotal += t.costoTotal;
    });

    const gananciaNeta = montoTotal - costoTotal;
    const ticketPromedio = totalVentas > 0 ? montoTotal / totalVentas : 0;

    res.json({
      periodo: { start, end },
      totales: {
        totalVentas,
        montoTotal,
        costoTotal,
        gananciaNeta,
        ticketPromedio
      },
      ventasPorMetodoPago: stats.paymentMethods,
      timeline: stats.timeline // ventas por hora/día/mes dependiendo del groupByFormat
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al generar reporte' });
  }
};

// @desc    Reporte Diario
// @route   GET /api/reports/daily
const getDailyReport = (req, res) => getReport(req, res, 'daily', '%H'); // Agrupa por hora

// @desc    Reporte Semanal
// @route   GET /api/reports/weekly
const getWeeklyReport = (req, res) => getReport(req, res, 'weekly', '%Y-%m-%d'); // Agrupa por dia

// @desc    Reporte Mensual
// @route   GET /api/reports/monthly
const getMonthlyReport = (req, res) => getReport(req, res, 'monthly', '%Y-%m-%d'); // Agrupa por dia

// @desc    Reporte Anual
// @route   GET /api/reports/annual
const getAnnualReport = (req, res) => getReport(req, res, 'annual', '%Y-%m'); // Agrupa por mes

// @desc    Top Productos Vendidos
// @route   GET /api/reports/top-products
const getTopProductsReport = async (req, res) => {
  try {
    const { period, date, year, month } = req.query;
    const { start, end } = getDateRange(period || 'monthly', date, year, month);

    const topProducts = await Sale.aggregate([
      {
        $match: {
          fecha: { $gte: start, $lte: end },
          estado: 'completada'
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.producto',
          cantidadVendida: { $sum: '$items.cantidad' },
          ingresosGenerados: { $sum: '$items.subtotal' }
        }
      },
      { $sort: { cantidadVendida: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productoInfo'
        }
      },
      { $unwind: '$productoInfo' },
      {
        $project: {
          _id: 1,
          cantidadVendida: 1,
          ingresosGenerados: 1,
          nombre: '$productoInfo.nombre',
          sku: '$productoInfo.sku',
          imagen: '$productoInfo.imagen'
        }
      }
    ]);

    res.json(topProducts);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener top productos' });
  }
};

// @desc    Resumen general Dashboard
// @route   GET /api/reports/summary
const getDashboardSummary = async (req, res) => {
  try {
    const todayStart = getArgStartOfDay();
    
    const matchStage = {
      $match: {
        fecha: { $gte: todayStart },
        estado: 'completada'
      }
    };

    const dailyStats = await Sale.aggregate([
      matchStage,
      { $unwind: '$items' },
      {
        $group: {
          _id: '$_id',
          totalFinal: { $first: '$totalFinal' },
          costoVenta: { $sum: { $multiply: ['$items.precioCompraHisto', '$items.cantidad'] } }
        }
      },
      {
        $group: {
          _id: null,
          totalVentas: { $sum: 1 },
          montoTotal: { $sum: '$totalFinal' },
          costoTotal: { $sum: '$costoVenta' }
        }
      }
    ]);

    const stats = dailyStats[0] || { totalVentas: 0, montoTotal: 0, costoTotal: 0 };
    const gananciaHoy = stats.montoTotal - stats.costoTotal;

    // Obtener productos mas vendidos de hoy
    const topToday = await Sale.aggregate([
      matchStage,
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.producto',
          cantidad: { $sum: '$items.cantidad' }
        }
      },
      { $sort: { cantidad: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'producto'
        }
      },
      { $unwind: '$producto' },
      {
        $project: {
          nombre: '$producto.nombre',
          cantidad: 1
        }
      }
    ]);

    // Ventas por hora
    const ventasPorHora = await Sale.aggregate([
      matchStage,
      {
        $group: {
          _id: { $hour: { date: '$fecha', timezone: 'America/Argentina/Buenos_Aires'} },
          total: { $sum: '$totalFinal' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Datos del mes actual
    const now = new Date();
    const [y, m] = now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).split('-').map(Number);
    const monthStart = new Date(Date.UTC(y, m - 1, 1, 3, 0, 0, 0));

    const monthlyStats = await Sale.aggregate([
      {
        $match: {
          fecha: { $gte: monthStart },
          estado: 'completada'
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$_id',
          totalFinal: { $first: '$totalFinal' },
          costoVenta: { $sum: { $multiply: ['$items.precioCompraHisto', '$items.cantidad'] } }
        }
      },
      {
        $group: {
          _id: null,
          totalVentas: { $sum: 1 },
          montoTotal: { $sum: '$totalFinal' },
          costoTotal: { $sum: '$costoVenta' }
        }
      }
    ]);

    const mStats = monthlyStats[0] || { totalVentas: 0, montoTotal: 0, costoTotal: 0 };

    res.json({
      ventasHoy: stats.totalVentas,
      facturacionHoy: stats.montoTotal,
      gananciaHoy,
      topProducts: topToday,
      ventasPorHora,
      mes: {
        ventas: mStats.totalVentas,
        facturacion: mStats.montoTotal,
        ganancia: mStats.montoTotal - mStats.costoTotal
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al generar resumen' });
  }
};

// @desc    Estadísticas Globales (Stock y Ventas Históricas)
// @route   GET /api/reports/global-stats
const getGlobalStats = async (req, res) => {
  try {
    // 1. Estadísticas de Productos
    const totalProducts = await Product.countDocuments({ activo: true });
    
    // Valor del Stock (Costo y Venta)
    const inventoryVal = await Product.aggregate([
      { $match: { activo: true } },
      {
        $group: {
          _id: null,
          totalCost: { $sum: { $multiply: ['$stock', '$precioCompra'] } },
          totalSalesValue: { $sum: { $multiply: ['$stock', '$precioVenta'] } }
        }
      }
    ]);

    // Breakdown por Categoría
    const categoryBreakdown = await Product.aggregate([
      { $match: { activo: true } },
      {
        $group: {
          _id: '$categoria',
          count: { $sum: 1 },
          stockTotal: { $sum: '$stock' },
          valorCoste: { $sum: { $multiply: ['$stock', '$precioCompra'] } }
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'categoriaInfo'
        }
      },
      { $unwind: '$categoriaInfo' },
      {
        $project: {
          nombre: '$categoriaInfo.nombre',
          count: 1,
          stockTotal: 1,
          valorCoste: 1
        }
      },
      { $sort: { valorCoste: -1 } }
    ]);

    // 2. Estadísticas de Ventas Históricas (Solo completadas)
    const saleStats = await Sale.aggregate([
      { $match: { estado: 'completada' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$_id',
          totalFinal: { $first: '$totalFinal' },
          totalCosto: { $sum: { $multiply: ['$items.precioCompraHisto', '$items.cantidad'] } }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          billing: { $sum: '$totalFinal' },
          cost: { $sum: '$totalCosto' }
        }
      }
    ]);

    const stats = saleStats[0] || { count: 0, billing: 0, cost: 0 };

    res.json({
      productos: {
        total: totalProducts,
        valorCoste: inventoryVal[0]?.totalCost || 0,
        valorVenta: inventoryVal[0]?.totalSalesValue || 0,
        breakdown: categoryBreakdown
      },
      ventas: {
        totalCount: stats.count,
        facturacionTotal: stats.billing,
        gananciaTotal: stats.billing - stats.cost
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener estadísticas globales' });
  }
};

// @desc    Estadísticas completas de ventas por producto
// @route   GET /api/reports/sales-stats
const getSalesStats = async (req, res) => {
  try {
    const productSales = await Sale.aggregate([
      { $match: { estado: 'completada' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.producto',
          cantidadVendida: { $sum: '$items.cantidad' },
          ingresosGenerados: { $sum: '$items.subtotal' },
          costoTotal: { $sum: { $multiply: ['$items.precioCompraHisto', '$items.cantidad'] } },
          cantidadUnidad: {
            $sum: {
              $cond: [
                { $ne: ['$items.esVentaSuelta', true] },
                '$items.cantidad',
                0
              ]
            }
          },
          cantidadSuelta: {
            $sum: {
              $cond: [
                { $eq: ['$items.esVentaSuelta', true] },
                { $ifNull: ['$items.kilosVendidos', 0] },
                0
              ]
            }
          },
          ingresosUnidad: {
            $sum: {
              $cond: [
                { $ne: ['$items.esVentaSuelta', true] },
                '$items.subtotal',
                0
              ]
            }
          },
          ingresosSuelta: {
            $sum: {
              $cond: [
                { $eq: ['$items.esVentaSuelta', true] },
                '$items.subtotal',
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productoInfo'
        }
      },
      { $unwind: '$productoInfo' },
      {
        $lookup: {
          from: 'categories',
          localField: 'productoInfo.categoria',
          foreignField: '_id',
          as: 'categoriaInfo'
        }
      },
      { $unwind: '$categoriaInfo' },
      {
        $project: {
          _id: 1,
          cantidadVendida: 1,
          ingresosGenerados: 1,
          costoTotal: 1,
          cantidadUnidad: 1,
          cantidadSuelta: 1,
          ingresosUnidad: 1,
          ingresosSuelta: 1,
          ganancia: { $subtract: ['$ingresosGenerados', '$costoTotal'] },
          margen: {
            $cond: [
              { $eq: ['$ingresosGenerados', 0] },
              0,
              { $multiply: [{ $divide: [{ $subtract: ['$ingresosGenerados', '$costoTotal'] }, '$ingresosGenerados'] }, 100] }
            ]
          },
          nombre: '$productoInfo.nombre',
          sku: '$productoInfo.sku',
          imagen: '$productoInfo.imagen',
          precioVentaActual: '$productoInfo.precioVenta',
          precioCompraActual: '$productoInfo.precioCompra',
          stockActual: '$productoInfo.stock',
          categoria: '$categoriaInfo.nombre',
          activo: '$productoInfo.activo'
        }
      },
      { $sort: { cantidadVendida: -1 } }
    ]);

    const totalSummary = await Sale.aggregate([
      { $match: { estado: 'completada' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$_id',
          totalFinal: { $first: '$totalFinal' },
          costoVenta: { $sum: { $multiply: ['$items.precioCompraHisto', '$items.cantidad'] } }
        }
      },
      {
        $group: {
          _id: null,
          totalVentas: { $sum: 1 },
          montoTotal: { $sum: '$totalFinal' },
          costoTotal: { $sum: '$costoVenta' }
        }
      }
    ]);

    const summary = totalSummary[0] || { totalVentas: 0, montoTotal: 0, costoTotal: 0 };
    const productosConVentas = productSales.filter(p => p.cantidadVendida > 0).length;

    res.json({
      summary: {
        totalVentas: summary.totalVentas,
        facturacionTotal: summary.montoTotal,
        costoTotal: summary.costoTotal,
        gananciaTotal: summary.montoTotal - summary.costoTotal,
        margenGeneral: summary.montoTotal > 0 ? ((summary.montoTotal - summary.costoTotal) / summary.montoTotal * 100) : 0,
        totalProductos: productSales.length,
        productosConVentas
      },
      products: productSales
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener estadísticas de ventas' });
  }
};

// @desc    Data para el heatmap de ventas (facturación y ganancia diaria)
// @route   GET /api/reports/sales-heatmap
const getSalesHeatmap = async (req, res) => {
  try {
    const months = req.query.months || 6;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    
    // Ajustar al inicio del día en Arg (UTC-3)
    const [y, m, d] = startDate.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).split('-').map(Number);
    const startDateArg = new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));

    const heatmapData = await Sale.aggregate([
      {
        $match: {
          fecha: { $gte: startDateArg, $lte: endDate },
          estado: 'completada'
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$_id',
          totalFinal: { $first: '$totalFinal' },
          fecha: { $first: '$fecha' },
          metodoPago: { $first: '$metodoPago' },
          costoVenta: { $sum: { $multiply: ['$items.precioCompraHisto', '$items.cantidad'] } }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$fecha", timezone: "America/Argentina/Buenos_Aires" } },
          total: { $sum: '$totalFinal' },
          costo: { $sum: '$costoVenta' },
          efectivo: { $sum: { $cond: [{ $eq: ['$metodoPago', 'efectivo'] }, '$totalFinal', 0] } },
          tarjeta: { $sum: { $cond: [{ $eq: ['$metodoPago', 'tarjeta'] }, '$totalFinal', 0] } },
          transferencia: { $sum: { $cond: [{ $eq: ['$metodoPago', 'transferencia'] }, '$totalFinal', 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          total: 1,
          profit: { $subtract: ['$total', '$costo'] },
          efectivo: 1,
          tarjeta: 1,
          transferencia: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

    res.json(heatmapData);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener datos del heatmap' });
  }
};

// @desc    Cierre de caja del día (ventas por método de pago + gastos)
// @route   GET /api/reports/cash-close
const getCashClose = async (req, res) => {
  try {
    const { date } = req.query;
    const start = date
      ? new Date(Date.UTC(...date.split('-').map(Number), 3, 0, 0, 0))
      : getArgStartOfDay();
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);

    const ventas = await Sale.aggregate([
      { $match: { fecha: { $gte: start, $lte: end }, estado: 'completada' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$_id',
          totalFinal: { $first: '$totalFinal' },
          metodoPago: { $first: '$metodoPago' },
          montoPagado: { $first: '$montoPagado' },
          vuelto: { $first: '$vuelto' },
          costoVenta: { $sum: { $multiply: ['$items.precioCompraHisto', '$items.cantidad'] } }
        }
      },
      {
        $group: {
          _id: null,
          totalVentas: { $sum: 1 },
          montoTotal: { $sum: '$totalFinal' },
          costoTotal: { $sum: '$costoVenta' },
          efectivo: { $sum: { $cond: [{ $eq: ['$metodoPago', 'efectivo'] }, '$totalFinal', 0] } },
          tarjeta: { $sum: { $cond: [{ $eq: ['$metodoPago', 'tarjeta'] }, '$totalFinal', 0] } },
          transferencia: { $sum: { $cond: [{ $eq: ['$metodoPago', 'transferencia'] }, '$totalFinal', 0] } },
          efectivoPagado: { $sum: { $cond: [{ $eq: ['$metodoPago', 'efectivo'] }, { $ifNull: ['$montoPagado', '$totalFinal'] }, 0] } },
          efectivoVuelto: { $sum: { $cond: [{ $eq: ['$metodoPago', 'efectivo'] }, { $ifNull: ['$vuelto', 0] }, 0] } }
        }
      }
    ]);

    const v = ventas[0] || { totalVentas: 0, montoTotal: 0, costoTotal: 0, efectivo: 0, tarjeta: 0, transferencia: 0, efectivoPagado: 0, efectivoVuelto: 0 };

    const gastos = await Expense.aggregate([
      { $match: { fecha: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$categoria',
          total: { $sum: '$monto' },
          cantidad: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]);

    const totalGastos = gastos.reduce((acc, g) => acc + g.total, 0);
    const gananciaBruta = v.montoTotal - v.costoTotal;
    const balanceNeto = gananciaBruta - totalGastos;
    const efectivoEnCaja = v.efectivoPagado - v.efectivoVuelto;

    res.json({
      fecha: start,
      ventas: {
        total: v.totalVentas,
        montoTotal: v.montoTotal,
        costoTotal: v.costoTotal,
        efectivo: v.efectivo,
        tarjeta: v.tarjeta,
        transferencia: v.transferencia,
        efectivoEnCaja,
      },
      gastos: {
        total: totalGastos,
        porCategoria: gastos,
      },
      gananciaBruta,
      balanceNeto,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al generar cierre de caja' });
  }
};

// @desc    Flujo de caja mensual (ventas - gastos por día)
// @route   GET /api/reports/cash-flow
const getCashFlow = async (req, res) => {
  try {
    const { year, month } = req.query;
    const now = new Date();
    const y = year ? parseInt(year) : parseInt(now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).split('-')[0]);
    const m = month ? parseInt(month) - 1 : parseInt(now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).split('-')[1]) - 1;

    const start = new Date(Date.UTC(y, m, 1, 3, 0, 0, 0));
    const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999) + 3 * 3600 * 1000);

    const ventasPorDia = await Sale.aggregate([
      { $match: { fecha: { $gte: start, $lte: end }, estado: 'completada' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$_id',
          fecha: { $first: '$fecha' },
          totalFinal: { $first: '$totalFinal' },
          metodoPago: { $first: '$metodoPago' },
          costoVenta: { $sum: { $multiply: ['$items.precioCompraHisto', '$items.cantidad'] } }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$fecha', timezone: 'America/Argentina/Buenos_Aires' } },
          ventas: { $sum: 1 },
          ingresos: { $sum: '$totalFinal' },
          costoVentas: { $sum: '$costoVenta' },
          efectivo: { $sum: { $cond: [{ $eq: ['$metodoPago', 'efectivo'] }, '$totalFinal', 0] } },
          tarjeta: { $sum: { $cond: [{ $eq: ['$metodoPago', 'tarjeta'] }, '$totalFinal', 0] } },
          transferencia: { $sum: { $cond: [{ $eq: ['$metodoPago', 'transferencia'] }, '$totalFinal', 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const gastosPorDia = await Expense.aggregate([
      { $match: { fecha: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$fecha', timezone: 'America/Argentina/Buenos_Aires' } },
          gastos: { $sum: '$monto' },
          cantidad: { $sum: 1 }
        }
      }
    ]);

    const gastosMap = {};
    gastosPorDia.forEach((g) => { gastosMap[g._id] = g.gastos; });

    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const dias = [];
    let totalIngresos = 0;
    let totalGastos = 0;
    let totalVentas = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const venta = ventasPorDia.find((v) => v._id === key);
      const gasto = gastosMap[key] || 0;
      const ingresos = venta?.ingresos || 0;
      const costoVentas = venta?.costoVentas || 0;
      const ganancia = ingresos - costoVentas;
      const balance = ganancia - gasto;

      totalIngresos += ingresos;
      totalGastos += gasto;
      totalVentas += venta?.ventas || 0;

      dias.push({
        fecha: key,
        ventas: venta?.ventas || 0,
        ingresos,
        costoVentas,
        ganancia,
        gastos: gasto,
        balance,
        efectivo: venta?.efectivo || 0,
        tarjeta: venta?.tarjeta || 0,
        transferencia: venta?.transferencia || 0,
      });
    }

    res.json({
      periodo: { year: y, month: m + 1, inicio: start, fin: end },
      totales: {
        ingresos: totalIngresos,
        gastos: totalGastos,
        ganancia: totalIngresos - totalGastos,
        ventas: totalVentas,
      },
      dias,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al generar flujo de caja' });
  }
};

module.exports = {
  getDailyReport,
  getWeeklyReport,
  getMonthlyReport,
  getAnnualReport,
  getTopProductsReport,
  getDashboardSummary,
  getGlobalStats,
  getSalesStats,
  getSalesHeatmap,
  getCashClose,
  getCashFlow,
};
