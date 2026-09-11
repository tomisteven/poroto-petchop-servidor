const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Promotion = require('../models/Promotion');
const StockMovement = require('../models/StockMovement');
const Customer = require('../models/Customer');
const generateTicketNumber = require('../utils/generateTicketNumber');
const { calcularPuntos } = require('../utils/loyalty');

// @desc    Obtener todas las ventas
// @route   GET /api/sales
// @access  Private
const getSales = async (req, res) => {
  try {
    const { startDate, endDate, empleado, metodoPago } = req.query;
    let query = {};

    if (startDate || endDate) {
      query.fecha = {};
      if (startDate) {
        // Si viene solo fecha YYYY-MM-DD, ajustamos al inicio del día en Arg (03:00 UTC)
        const s = new Date(startDate);
        if (startDate.length <= 10) s.setUTCHours(3, 0, 0, 0); 
        query.fecha.$gte = s;
      }
      if (endDate) {
        // Si viene solo fecha, ajustamos al fin del día en Arg (02:59:59 del día siguiente UTC)
        const e = new Date(endDate);
        if (endDate.length <= 10) e.setUTCHours(26, 59, 59, 999); // 23+3 = 26
        query.fecha.$lte = e;
      }
    }

    if (empleado) query.empleado = empleado;
    if (metodoPago) query.metodoPago = metodoPago;

    const sales = await Sale.find(query)
      .populate('empleado', 'nombre')
      .populate('cliente', 'nombre telefono')
      .populate('items.producto', 'nombre sku')
      .populate('items.promocion', 'nombre numero')
      .sort({ fecha: -1 });
      
    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener ventas' });
  }
};

// @desc    Obtener venta por ID
// @route   GET /api/sales/:id
// @access  Private
const getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate('empleado', 'nombre')
      .populate('cliente', 'nombre telefono')
      .populate('items.producto', 'nombre sku')
      .populate('items.promocion', 'nombre numero');

    if (sale) {
      res.json(sale);
    } else {
      res.status(404).json({ message: 'Venta no encontrada' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener la venta' });
  }
};

// @desc    Crear venta nueva transaccionalmente
// @route   POST /api/sales
// @access  Private
const createSale = async (req, res) => {
  try {
    const { items, descuento, metodoPago, montoPagado, cliente, notas } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No hay productos en la venta' });
    }

    let customerDoc = null;
    if (cliente) {
      customerDoc = await Customer.findById(cliente);
      if (!customerDoc) {
        return res.status(400).json({ message: 'Cliente no encontrado' });
      }
    }

    let subtotal = 0;
    const saleItems = [];
    const stockMovements = [];
    const productsToUpdate = [];

    // Validar stock y preparar items
    for (const item of items) {
      // === Venta de promoción: descuenta stock de cada producto que la compone ===
      if (item.promocion) {
        const promotion = await Promotion.findById(item.promocion);

        if (!promotion) {
          throw new Error(`Promoción no encontrada: ${item.promocion}`);
        }
        if (!promotion.activo || promotion.estado !== 'activa') {
          throw new Error(`La promoción "${promotion.nombre}" no está activa`);
        }

        const cantidadPromos = item.cantidad || 1;
        const promoSubtotal = promotion.precioFinal * cantidadPromos;

        for (const pi of promotion.items) {
          const product = await Product.findById(pi.producto);

          if (!product) {
            throw new Error(`Producto de la promoción no encontrado: ${pi.producto}`);
          }

          const stockDeduction = pi.cantidad * cantidadPromos;
          const availableStock = product.stock || 0;

          if (availableStock < stockDeduction - 0.0001) {
            throw new Error(`Stock insuficiente para el producto: ${product.nombre}. Solicitado: ${stockDeduction.toFixed(2)}, Disponible: ${availableStock.toFixed(2)}`);
          }

          stockMovements.push({
            producto: product._id,
            tipo: 'venta',
            cantidad: stockDeduction,
            stockAnterior: product.stock,
            stockNuevo: product.stock - stockDeduction,
            motivo: 'Venta de promoción',
            usuario: req.user._id
          });

          productsToUpdate.push({
            updateOne: {
              filter: { _id: product._id },
              update: { $inc: { stock: -stockDeduction } }
            }
          });
        }

        subtotal += promoSubtotal;

        saleItems.push({
          producto: promotion.productoPrincipal,
          promocion: promotion._id,
          nombre: promotion.nombre,
          cantidad: cantidadPromos,
          precioVentaHisto: promotion.precioFinal,
          precioCompraHisto: promotion.subtotalCosto,
          subtotal: promoSubtotal,
          esVentaSuelta: false
        });

        continue;
      }

      const product = await Product.findById(item.producto);
      
      if (!product) {
        throw new Error(`Producto no encontrado: ${item.producto}`);
      }
      
      let itemSubtotal = 0;
      let stockDeduction = 0;
      let precioVentaHisto = product.precioVenta;
      let kilosVendidosCalculados = item.kilosVendidos || 0;

      if (product.esGenerico) {
         if (item.precioUnitario === undefined || item.precioUnitario < 0) {
            throw new Error(`Debe proporcionar un precio para el producto genérico: ${product.nombre}`);
         }
         precioVentaHisto = item.precioUnitario;
         itemSubtotal = precioVentaHisto * item.cantidad;
         stockDeduction = item.cantidad;
      } else if (item.esVentaSuelta && product.esBolsaAlimento) {
         if (!product.kilosPorBolsa || product.kilosPorBolsa <= 0) {
            throw new Error(`El producto ${product.nombre} no tiene kilos configurados para venta suelta`);
         }
         if (item.subtotal !== undefined) {
             itemSubtotal = item.subtotal;
             precioVentaHisto = item.subtotal; // Subtotal es el unitario para esta linea en este caso
             
if (item.kilosVendidos === undefined) {
                  // Si solo mandaron dinero (subtotal), calculamos kilos
                  const pricePerKg = product.precioKilo || ((product.precioVenta / product.kilosPorBolsa) * (1 + ((product.margenSuelto || 42)/100)));
                  kilosVendidosCalculados = itemSubtotal / pricePerKg;
              }
         } else {
             // Si solo mandaron cantidad (como kilos), este bloque no se usaría porque el front manda subtotal
             throw new Error(`Debe mandar el subtotal cobrado para venta suelta de: ${product.nombre}`);
         }
         // La venta suelta NO descuenta stock del producto de bolsa, según requerimiento del usuario.
         // El usuario maneja el stock de bolsas abiertas de forma externa o solo le interesa el stock de bolsas cerradas.
         stockDeduction = 0;
      } else {
         itemSubtotal = product.precioVenta * item.cantidad;
         stockDeduction = item.cantidad;
      }

      // Se permite vender igual si el registro de stock dice 0 pero hay stock físico.
      // El stock se descuenta igual y puede quedar negativo hasta reposición.

      subtotal += itemSubtotal;

      // Calcular costo proporcional para ventas sueltas
      let precioCompraHisto = product.precioCompra;
      if (item.esVentaSuelta && product.esBolsaAlimento && product.kilosPorBolsa > 0) {
         precioCompraHisto = (product.precioCompra / product.kilosPorBolsa) * kilosVendidosCalculados;
      }

      saleItems.push({
        producto: product._id,
        cantidad: item.cantidad,
        precioVentaHisto: precioVentaHisto,
        precioCompraHisto: precioCompraHisto,
        subtotal: itemSubtotal,
        esVentaSuelta: item.esVentaSuelta || false,
        kilosVendidos: kilosVendidosCalculados
      });

      // Preparar mov. stock solo si hay algo que descontar
      if (stockDeduction > 0) {
        stockMovements.push({
          producto: product._id,
          tipo: 'venta',
          cantidad: stockDeduction,
          stockAnterior: product.stock,
          stockNuevo: product.stock - stockDeduction,
          motivo: 'Venta completada',
          usuario: req.user._id
        });

        // Preparar actualización producto
        productsToUpdate.push({
          updateOne: {
            filter: { _id: product._id },
            update: { $inc: { stock: -stockDeduction } }
          }
        });
      }
    }

    const discountAmount = descuento ? (subtotal * (descuento / 100)) : 0;
    const totalFinal = subtotal - discountAmount;
    const vuelto = montoPagado - totalFinal;

    if (vuelto < -0.01) {
        throw new Error('El monto pagado es menor al total de la venta');
    }

    const numeroTicket = await generateTicketNumber();

    const puntosGanados = customerDoc ? await calcularPuntos(totalFinal) : 0;

    const sale = new Sale({
      numeroTicket,
      empleado: req.user._id,
      cliente: customerDoc?._id,
      puntosGanados,
      items: saleItems,
      subtotal,
      descuento: descuento || 0,
      totalFinal,
      metodoPago,
      montoPagado,
      vuelto: vuelto < 0 ? 0 : vuelto,
      estado: 'completada',
      notas: notas || undefined
    });

    const createdSale = await sale.save();

    if (customerDoc) {
      if (!customerDoc.esAfiliado) {
        customerDoc.esAfiliado = true;
        customerDoc.fechaAfiliacion = customerDoc.fechaAfiliacion || new Date();
      }
      customerDoc.puntos += puntosGanados;
      await customerDoc.save();
    }

    // Modificar los motivos de stock para incluir el nro de ticket
    stockMovements.forEach(sm => sm.motivo = `Venta ${createdSale.numeroTicket}`);

    await StockMovement.insertMany(stockMovements);
    await Product.bulkWrite(productsToUpdate);

    res.status(201).json(createdSale);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Anular venta (reponer stock)
// @route   PATCH /api/sales/:id/anular
// @access  Private/Admin
const cancelSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);

    if (!sale) {
      throw new Error('Venta no encontrada');
    }

    if (sale.estado === 'anulada') {
      throw new Error('La venta ya está anulada');
    }

    const stockMovements = [];
    const productsToUpdate = [];

    // Revertir inventario
    for (const item of sale.items) {
      // === Línea de promoción: reponer stock de cada producto que la compone ===
      if (item.promocion) {
        const promotion = await Promotion.findById(item.promocion);

        if (promotion) {
          for (const pi of promotion.items) {
            const product = await Product.findById(pi.producto);

            if (!product) continue;

            const stockRestored = pi.cantidad * item.cantidad;

            stockMovements.push({
              producto: product._id,
              tipo: 'ajuste',
              cantidad: stockRestored,
              stockAnterior: product.stock,
              stockNuevo: product.stock + stockRestored,
              motivo: `Anulación de ticket ${sale.numeroTicket}`,
              usuario: req.user._id
            });

            productsToUpdate.push({
              updateOne: {
                filter: { _id: product._id },
                update: { $inc: { stock: stockRestored } }
              }
            });
          }
        }

        continue;
      }

      const product = await Product.findById(item.producto);
      
      if (product) {
        let stockRestored = item.cantidad;
        if (item.esVentaSuelta && product.esBolsaAlimento && product.kilosPorBolsa) {
             stockRestored = (item.kilosVendidos || 0) / product.kilosPorBolsa;
        }

        stockMovements.push({
          producto: product._id,
          tipo: 'ajuste', // O 'entrada' pero ajuste por anulación es mejor
          cantidad: stockRestored,
          stockAnterior: product.stock,
          stockNuevo: product.stock + stockRestored,
          motivo: `Anulación de ticket ${sale.numeroTicket}`,
          usuario: req.user._id
        });

        productsToUpdate.push({
          updateOne: {
            filter: { _id: product._id },
            update: { $inc: { stock: stockRestored } }
          }
        });
      }
    }

    sale.estado = 'anulada';
    await sale.save();

    if (sale.cliente && sale.puntosGanados > 0) {
      await Customer.findByIdAndUpdate(sale.cliente, { $inc: { puntos: -sale.puntosGanados } });
    }

    if (stockMovements.length > 0) {
      await StockMovement.insertMany(stockMovements);
      await Product.bulkWrite(productsToUpdate);
    }

    res.json({ message: 'Venta anulada exitosamente', sale });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const setSaleCustomer = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ message: 'Venta no encontrada' });
    if (sale.estado !== 'completada') {
      return res.status(400).json({ message: 'Solo se puede asignar cliente a ventas completadas' });
    }

    const { cliente } = req.body;
    const clienteId = cliente || null;

    if (sale.cliente && sale.puntosGanados > 0) {
      await Customer.findByIdAndUpdate(sale.cliente, { $inc: { puntos: -sale.puntosGanados } });
    }

    let puntosNuevos = 0;
    if (clienteId) {
      const customer = await Customer.findById(clienteId);
      if (!customer) return res.status(400).json({ message: 'Cliente no encontrado' });
      puntosNuevos = await calcularPuntos(sale.totalFinal);
      if (!customer.esAfiliado) {
        customer.esAfiliado = true;
        customer.fechaAfiliacion = customer.fechaAfiliacion || new Date();
      }
      customer.puntos += puntosNuevos;
      await customer.save();
    }

    sale.cliente = clienteId || undefined;
    sale.puntosGanados = puntosNuevos;
    await sale.save();

    const updated = await Sale.findById(sale._id).populate('cliente', 'nombre telefono');
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getSales,
  getSaleById,
  createSale,
  cancelSale,
  setSaleCustomer
};
