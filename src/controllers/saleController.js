const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Promotion = require('../models/Promotion');
const StockMovement = require('../models/StockMovement');
const Customer = require('../models/Customer');
const generateTicketNumber = require('../utils/generateTicketNumber');
const { calcularPuntos } = require('../utils/loyalty');
const { consumirKilos, devolverKilos, estadoInicial } = require('../utils/bolsaStock');

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
    const bagStates = new Map();

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
         // La venta suelta se descuenta de la bolsa abierta en gramos.
         // Al vaciarse una bolsa entera, se descuenta 1 del stock normal automáticamente.
         stockDeduction = 0;

         let bag = bagStates.get(String(product._id));
         if (!bag) {
           bag = { ...estadoInicial(product), kilosPorBolsa: product.kilosPorBolsa, stockInicial: product.stock || 0 };
           bagStates.set(String(product._id), bag);
         }
         const consumido = consumirKilos(bag, kilosVendidosCalculados);
         bag.stock = consumido.stock;
         bag.gramos = consumido.gramos;

         for (const a of consumido.bolsasConsumidas) {
           stockMovements.push({
             producto: product._id,
             tipo: 'venta',
             cantidad: 1,
             stockAnterior: a.stockAnterior,
             stockNuevo: a.stockNuevo,
             motivo: 'Venta suelta - bolsa consumida',
             usuario: req.user._id,
             __bolsaSuelta: true
           });
         }
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

    for (const [pid, bag] of bagStates) {
      const delta = bag.stock - bag.stockInicial;
      const update = { $set: { gramosBolsaAbierta: bag.gramos } };
      if (delta !== 0) update.$inc = { stock: delta };
      productsToUpdate.push({ updateOne: { filter: { _id: pid }, update } });
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
    stockMovements.forEach(sm => {
      if (sm.__bolsaSuelta) {
        sm.motivo = `Venta ${createdSale.numeroTicket} · bolsa suelta consumida`;
      } else {
        sm.motivo = `Venta ${createdSale.numeroTicket}`;
      }
    });

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
    const bagRestore = new Map();

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
        if (item.esVentaSuelta && product.esBolsaAlimento && product.kilosPorBolsa) {
          let bag = bagRestore.get(String(product._id));
          if (!bag) {
            bag = { ...estadoInicial(product), kilosPorBolsa: product.kilosPorBolsa, stockInicial: product.stock || 0 };
            bagRestore.set(String(product._id), bag);
          }
          const stockAnterior = bag.stock;
          const devuelto = devolverKilos(bag, item.kilosVendidos || 0);
          bag.stock = devuelto.stock;
          bag.gramos = devuelto.gramos;

          if (devuelto.bolsasDevueltas > 0) {
            stockMovements.push({
              producto: product._id,
              tipo: 'ajuste',
              cantidad: devuelto.bolsasDevueltas,
              stockAnterior,
              stockNuevo: devuelto.stock,
              motivo: `Anulación de ticket ${sale.numeroTicket} · devolución de bolsa`,
              usuario: req.user._id
            });
          }
          continue;
        }

        let stockRestored = item.cantidad;

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

    for (const [pid, bag] of bagRestore) {
      const delta = bag.stock - bag.stockInicial;
      const update = { $set: { gramosBolsaAbierta: bag.gramos } };
      if (delta !== 0) update.$inc = { stock: delta };
      productsToUpdate.push({ updateOne: { filter: { _id: pid }, update } });
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

// @desc    Editar una venta completada (items, descuento, pago). Ajusta stock por delta.
// @route   PATCH /api/sales/:id
// @access  Private/Admin
const updateSale = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) throw new Error('Venta no encontrada');
    if (sale.estado !== 'completada') throw new Error('Solo se pueden editar ventas completadas');

    const { items, descuento, metodoPago, montoPagado, notas } = req.body;
    if (!items || items.length === 0) throw new Error('No hay productos en la venta editada');

    // Mapa de precios/costos históricos de las líneas ya existentes (para no repreciar la venta)
    const oldByProduct = new Map();
    const oldConsumed = new Map();
    const oldBolsa = new Map();
    for (const it of sale.items) {
      if (it.promocion) {
        oldByProduct.set(`promo:${String(it.promocion)}`, {
          precioVenta: it.precioVentaHisto,
          precioCompra: it.precioCompraHisto,
        });
        const promotion = await Promotion.findById(it.promocion);
        if (promotion) {
          for (const pi of promotion.items) {
            oldConsumed.set(String(pi.producto), (oldConsumed.get(String(pi.producto)) || 0) + (pi.cantidad * it.cantidad));
          }
        }
      } else {
        const perUnit = it.esVentaSuelta && it.cantidad > 0 ? it.subtotal / it.cantidad : it.precioVentaHisto;
        oldByProduct.set(String(it.producto), {
          precioVenta: perUnit,
          precioCompra: it.precioCompraHisto,
          kilosVendidos: it.kilosVendidos,
          esVentaSuelta: it.esVentaSuelta,
        });
        const product = await Product.findById(it.producto);
        if (product && product.esBolsaAlimento) {
          const rec = oldBolsa.get(String(it.producto)) || { sueltoKg: 0, bolsas: 0 };
          if (it.esVentaSuelta) rec.sueltoKg += it.kilosVendidos || 0;
          else rec.bolsas += it.cantidad;
          oldBolsa.set(String(it.producto), rec);
        } else {
          oldConsumed.set(String(it.producto), (oldConsumed.get(String(it.producto)) || 0) + it.cantidad);
        }
      }
    }

    const newConsumed = new Map();
    const newBolsa = new Map();
    const saleItems = [];
    let subtotal = 0;

    for (const item of items) {
      if (item.promocion) {
        const promotion = await Promotion.findById(item.promocion);
        if (!promotion) throw new Error(`Promoción no encontrada: ${item.promocion}`);

        const existed = oldByProduct.has(`promo:${String(item.promocion)}`);
        if (!existed && (!promotion.activo || promotion.estado !== 'activa')) {
          throw new Error(`La promoción "${promotion.nombre}" no está activa`);
        }

        const cantidadPromos = item.cantidad || 1;
        const old = oldByProduct.get(`promo:${String(item.promocion)}`);
        const promoUnit = old ? old.precioVenta : promotion.precioFinal;
        const promoCost = old ? old.precioCompra : promotion.subtotalCosto;
        const promoSubtotal = promoUnit * cantidadPromos;

        for (const pi of promotion.items) {
          const product = await Product.findById(pi.producto);
          if (!product) continue;
          newConsumed.set(String(product._id), (newConsumed.get(String(product._id)) || 0) + (pi.cantidad * cantidadPromos));
        }

        subtotal += promoSubtotal;
        saleItems.push({
          producto: promotion.productoPrincipal,
          promocion: promotion._id,
          nombre: promotion.nombre,
          cantidad: cantidadPromos,
          precioVentaHisto: promoUnit,
          precioCompraHisto: promoCost,
          subtotal: promoSubtotal,
          esVentaSuelta: false,
        });
        continue;
      }

      const product = await Product.findById(item.producto);
      if (!product) throw new Error(`Producto no encontrado: ${item.producto}`);

      const old = oldByProduct.get(String(product._id));
      const esVentaSuelta = item.esVentaSuelta && product.esBolsaAlimento;

      if (esVentaSuelta) {
        if (!product.kilosPorBolsa || product.kilosPorBolsa <= 0) {
          throw new Error(`El producto ${product.nombre} no tiene kilos configurados para venta suelta`);
        }

        let unitPrice;
        let kilosVendidosCalculados;
        if (old && old.esVentaSuelta) {
          unitPrice = old.precioVenta;
          const oldCantidad = sale.items.find((i) => !i.promocion && String(i.producto) === String(product._id))?.cantidad || 1;
          kilosVendidosCalculados = ((old.kilosVendidos || 0) / oldCantidad) * item.cantidad;
        } else {
          if (item.subtotal === undefined) {
            throw new Error(`Debe mandar el subtotal cobrado para venta suelta de: ${product.nombre}`);
          }
          const pricePerKg = product.precioKilo || ((product.precioVenta / product.kilosPorBolsa) * (1 + ((product.margenSuelto || 42) / 100)));
          unitPrice = item.cantidad > 0 ? item.subtotal / item.cantidad : item.subtotal;
          kilosVendidosCalculados = item.kilosVendidos !== undefined ? item.kilosVendidos : item.subtotal / pricePerKg;
        }

        const itemSubtotal = unitPrice * item.cantidad;
        if (product.esBolsaAlimento) {
          const rec = newBolsa.get(String(product._id)) || { sueltoKg: 0, bolsas: 0 };
          rec.sueltoKg += kilosVendidosCalculados;
          newBolsa.set(String(product._id), rec);
        } else {
          newConsumed.set(String(product._id), (newConsumed.get(String(product._id)) || 0) + (kilosVendidosCalculados / product.kilosPorBolsa));
        }

        saleItems.push({
          producto: product._id,
          cantidad: item.cantidad,
          precioVentaHisto: itemSubtotal,
          precioCompraHisto: old ? old.precioCompra : (product.precioCompra / product.kilosPorBolsa) * kilosVendidosCalculados,
          subtotal: itemSubtotal,
          esVentaSuelta: true,
          kilosVendidos: kilosVendidosCalculados,
        });
        subtotal += itemSubtotal;
        continue;
      }

      let unitPrice;
      if (product.esGenerico) {
        unitPrice = old ? old.precioVenta : (item.precioUnitario !== undefined ? item.precioUnitario : product.precioVenta);
      } else {
        unitPrice = old ? old.precioVenta : product.precioVenta;
      }

      const itemSubtotal = unitPrice * item.cantidad;
      if (product.esBolsaAlimento) {
        const rec = newBolsa.get(String(product._id)) || { sueltoKg: 0, bolsas: 0 };
        rec.bolsas += item.cantidad;
        newBolsa.set(String(product._id), rec);
      } else {
        newConsumed.set(String(product._id), (newConsumed.get(String(product._id)) || 0) + item.cantidad);
      }

      saleItems.push({
        producto: product._id,
        cantidad: item.cantidad,
        precioVentaHisto: unitPrice,
        precioCompraHisto: old ? old.precioCompra : product.precioCompra,
        subtotal: itemSubtotal,
        esVentaSuelta: false,
      });
      subtotal += itemSubtotal;
    }

    const discountAmount = descuento ? (subtotal * (descuento / 100)) : 0;
    const totalFinal = subtotal - discountAmount;
    const vuelto = montoPagado - totalFinal;

    if (vuelto < -0.01) {
      throw new Error('El monto pagado es menor al total de la venta editada');
    }

    // === Ajuste de stock por delta (devuelve lo quitado, descuenta lo agregado) ===
    const bolsaIds = new Set([...oldBolsa.keys(), ...newBolsa.keys()]);
    const productIds = new Set([...oldConsumed.keys(), ...newConsumed.keys()].filter(id => !bolsaIds.has(id)));
    const stockMovements = [];
    const productsToUpdate = [];

    for (const pid of productIds) {
      const diff = (newConsumed.get(pid) || 0) - (oldConsumed.get(pid) || 0);
      const rounded = Math.round((diff + Number.EPSILON) * 1000) / 1000;
      if (Math.abs(rounded) < 0.0001) continue;

      const product = await Product.findById(pid);
      if (!product) continue;
      const motivo = `Edición de ticket ${sale.numeroTicket}`;

      if (rounded > 0) {
        stockMovements.push({
          producto: product._id,
          tipo: 'venta',
          cantidad: rounded,
          stockAnterior: product.stock,
          stockNuevo: product.stock - rounded,
          motivo,
          usuario: req.user._id
        });
        productsToUpdate.push({ updateOne: { filter: { _id: product._id }, update: { $inc: { stock: -rounded } } } });
      } else {
        const amount = -rounded;
        stockMovements.push({
          producto: product._id,
          tipo: 'ajuste',
          cantidad: amount,
          stockAnterior: product.stock,
          stockNuevo: product.stock + amount,
          motivo,
          usuario: req.user._id
        });
        productsToUpdate.push({ updateOne: { filter: { _id: product._id }, update: { $inc: { stock: amount } } } });
      }
    }

    // === Productos de bolsa: recalcular gramos de la bolsa abierta y bolsas consumidas ===
    const motivoBolsa = `Edición de ticket ${sale.numeroTicket}`;
    for (const pid of bolsaIds) {
      const product = await Product.findById(pid);
      if (!product) continue;

      const recOld = oldBolsa.get(pid) || { sueltoKg: 0, bolsas: 0 };
      const recNew = newBolsa.get(pid) || { sueltoKg: 0, bolsas: 0 };
      const oldUnit = oldConsumed.get(pid) || 0;
      const newUnit = newConsumed.get(pid) || 0;

      let bag = { ...estadoInicial(product), kilosPorBolsa: product.kilosPorBolsa };
      const rev = devolverKilos(bag, recOld.sueltoKg);
      bag.stock = rev.stock - recOld.bolsas - oldUnit;
      bag.gramos = rev.gramos;
      bag.stock -= recNew.bolsas + newUnit;
      const cons = consumirKilos(bag, recNew.sueltoKg);
      bag.stock = cons.stock;
      bag.gramos = cons.gramos;

      const stockDelta = bag.stock - (product.stock || 0);
      if (stockDelta !== 0 || bag.gramos !== (Number(product.gramosBolsaAbierta) || 0)) {
        const update = { $set: { gramosBolsaAbierta: bag.gramos } };
        if (stockDelta !== 0) update.$inc = { stock: stockDelta };
        productsToUpdate.push({ updateOne: { filter: { _id: pid }, update } });
        if (stockDelta !== 0) {
          stockMovements.push({
            producto: pid,
            tipo: stockDelta > 0 ? 'ajuste' : 'venta',
            cantidad: Math.abs(stockDelta),
            stockAnterior: product.stock,
            stockNuevo: product.stock + stockDelta,
            motivo: motivoBolsa,
            usuario: req.user._id
          });
        }
      }
    }

    // === Puntos del cliente (recalcular contra el nuevo total) ===
    const puntosNuevos = sale.cliente ? await calcularPuntos(totalFinal) : 0;
    const puntosDelta = puntosNuevos - (sale.puntosGanados || 0);

    sale.items = saleItems;
    sale.subtotal = subtotal;
    sale.descuento = descuento || 0;
    sale.totalFinal = totalFinal;
    sale.metodoPago = metodoPago;
    sale.montoPagado = montoPagado;
    sale.vuelto = vuelto < 0 ? 0 : vuelto;
    sale.puntosGanados = puntosNuevos;
    if (notas !== undefined) sale.notas = notas || undefined;
    await sale.save();

    if (sale.cliente && puntosDelta !== 0) {
      await Customer.findByIdAndUpdate(sale.cliente, { $inc: { puntos: puntosDelta } });
    }

    if (stockMovements.length > 0) {
      await StockMovement.insertMany(stockMovements);
      await Product.bulkWrite(productsToUpdate);
    }

    const updated = await Sale.findById(sale._id)
      .populate('empleado', 'nombre')
      .populate('cliente', 'nombre telefono')
      .populate('items.producto', 'nombre sku')
      .populate('items.promocion', 'nombre numero');

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
  setSaleCustomer,
  updateSale
};
