const CalendarEvent = require('../models/CalendarEvent');
const PurchaseOrder = require('../models/PurchaseOrder');
const Budget = require('../models/Budget');
const Expense = require('../models/Expense');

const generarSerieId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

const sumarFrecuencia = (fecha, frecuencia) => {
  const d = new Date(fecha);
  if (frecuencia === 'diaria') d.setDate(d.getDate() + 1);
  else if (frecuencia === 'semanal') d.setDate(d.getDate() + 7);
  else if (frecuencia === 'quincenal') d.setDate(d.getDate() + 14);
  else if (frecuencia === 'mensual') d.setMonth(d.getMonth() + 1);
  else if (frecuencia === 'anual') d.setFullYear(d.getFullYear() + 1);
  return d;
};

const normalizarFecha = (fecha) => {
  if (!fecha) return new Date();
  if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return new Date(`${fecha}T03:00:00.000Z`);
  }
  return new Date(fecha);
};

const generarOcurrencias = (evento) => {
  const ocurrencias = [];
  const limite = new Date(evento.fecha);
  limite.setDate(limite.getDate() + 365);
  let fecha = sumarFrecuencia(evento.fecha, evento.recurrente.frecuencia);
  let count = 0;
  while (fecha.getTime() <= limite.getTime() && count < 60) {
    ocurrencias.push({
      titulo: evento.titulo,
      descripcion: evento.descripcion,
      tipo: evento.tipo,
      fecha,
      hora: evento.hora,
      importe: evento.importe,
      categoria: evento.categoria,
      estado: 'pendiente',
      recurrente: { ...evento.recurrente },
      referenciaTipo: evento.referenciaTipo,
      referenciaId: evento.referenciaId,
      referenciaNombre: evento.referenciaNombre,
      empleado: evento.empleado,
      activo: true
    });
    fecha = sumarFrecuencia(fecha, evento.recurrente.frecuencia);
    count += 1;
  }
  return ocurrencias;
};

const getCalendarItems = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = normalizarFecha(startDate || new Date().toISOString().slice(0, 10));
    const end = normalizarFecha(endDate || startDate || new Date().toISOString().slice(0, 10));
    end.setDate(end.getDate() + 1);

    const [eventos, ordenes, presupuestos, gastos] = await Promise.all([
      CalendarEvent.find({ activo: true, estado: { $ne: 'cancelado' }, fecha: { $gte: start, $lt: end } })
        .populate('empleado', 'nombre')
        .sort({ fecha: 1, hora: 1 }),
      PurchaseOrder.find({ estado: 'pendiente', fecha: { $gte: start, $lt: end } })
        .populate('proveedor', 'nombre'),
      Budget.find({ estado: 'pendiente', fecha: { $gte: start, $lt: end } }),
      Expense.find({ fecha: { $gte: start, $lt: end } })
    ]);

    const items = [];

    eventos.forEach(e => {
      items.push({
        id: e._id,
        origen: 'evento',
        tipo: e.tipo,
        titulo: e.titulo,
        descripcion: e.descripcion,
        fecha: e.fecha,
        hora: e.hora,
        importe: e.importe,
        categoria: e.categoria,
        estado: e.estado,
        recurrente: e.recurrente,
        referenciaTipo: e.referenciaTipo,
        referenciaId: e.referenciaId,
        referenciaNombre: e.referenciaNombre,
        empleado: e.empleado?.nombre
      });
    });

    ordenes.forEach(o => {
      items.push({
        id: o._id,
        origen: 'orden',
        tipo: 'orden',
        titulo: `${o.numero} · ${o.proveedor?.nombre || 'Sin proveedor'}`,
        descripcion: `${o.items?.length || 0} productos`,
        fecha: o.fecha,
        hora: null,
        importe: o.total,
        categoria: null,
        estado: 'pendiente',
        recurrente: null,
        referenciaTipo: 'ordenCompra',
        referenciaId: o._id,
        referenciaNombre: o.proveedor?.nombre,
        empleado: null
      });
    });

    presupuestos.forEach(b => {
      items.push({
        id: b._id,
        origen: 'presupuesto',
        tipo: 'presupuesto',
        titulo: `${b.numero} · ${b.clienteNombre || 'Sin cliente'}`,
        descripcion: `${b.items?.length || 0} productos`,
        fecha: b.fecha,
        hora: null,
        importe: b.total,
        categoria: null,
        estado: 'pendiente',
        recurrente: null,
        referenciaTipo: 'presupuesto',
        referenciaId: b._id,
        referenciaNombre: b.clienteNombre,
        empleado: null
      });
    });

    gastos.forEach(g => {
      items.push({
        id: g._id,
        origen: 'gasto',
        tipo: 'gasto',
        titulo: g.descripcion,
        descripcion: g.categoria || null,
        fecha: g.fecha,
        hora: null,
        importe: g.monto,
        categoria: g.categoria,
        estado: 'completado',
        recurrente: null,
        referenciaTipo: 'gasto',
        referenciaId: g._id,
        referenciaNombre: g.categoria,
        empleado: g.empleado?.nombre
      });
    });

    items.sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || (a.hora || '').localeCompare(b.hora || ''));
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el calendario' });
  }
};

const getEvents = async (req, res) => {
  try {
    const { startDate, endDate, tipo, estado } = req.query;
    const filter = { activo: true };
    if (tipo) filter.tipo = tipo;
    if (estado) filter.estado = estado;
    if (startDate || endDate) {
      const start = normalizarFecha(startDate || '2000-01-01');
      const end = normalizarFecha(endDate || '2100-01-01');
      end.setDate(end.getDate() + 1);
      filter.fecha = { $gte: start, $lt: end };
    }
    const eventos = await CalendarEvent.find(filter)
      .populate('empleado', 'nombre')
      .sort({ fecha: 1, hora: 1 });
    res.json(eventos);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener eventos' });
  }
};

const getEvent = async (req, res) => {
  try {
    const evento = await CalendarEvent.findById(req.params.id).populate('empleado', 'nombre');
    if (!evento) return res.status(404).json({ message: 'Evento no encontrado' });
    res.json(evento);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el evento' });
  }
};

const createEvent = async (req, res) => {
  try {
    const { titulo, descripcion, tipo, fecha, hora, importe, categoria, recurrente, referenciaTipo, referenciaId, referenciaNombre } = req.body;
    if (!titulo || !fecha) return res.status(400).json({ message: 'Título y fecha son obligatorios' });

    const serieId = recurrente?.activa ? generarSerieId() : null;
    const evento = await CalendarEvent.create({
      titulo,
      descripcion,
      tipo: tipo || 'tarea',
      fecha: normalizarFecha(fecha),
      hora: hora || null,
      importe: importe || undefined,
      categoria,
      recurrente: recurrente?.activa ? { activa: true, frecuencia: recurrente.frecuencia || 'semanal', serieId } : { activa: false },
      referenciaTipo: referenciaTipo || '',
      referenciaId: referenciaId || undefined,
      referenciaNombre,
      empleado: req.user._id
    });

    if (recurrente?.activa) {
      await CalendarEvent.insertMany(generarOcurrencias(evento));
    }

    res.status(201).json(evento);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear el evento' });
  }
};

const updateEvent = async (req, res) => {
  try {
    const evento = await CalendarEvent.findById(req.params.id);
    if (!evento) return res.status(404).json({ message: 'Evento no encontrado' });

    const { titulo, descripcion, tipo, fecha, hora, importe, categoria, recurrente, referenciaTipo, referenciaId, referenciaNombre, serie } = req.body;

    if (serie && evento.recurrente?.serieId) {
      const nuevaFecha = fecha !== undefined ? normalizarFecha(fecha) : null;
      const cambiaTemporal = (nuevaFecha && nuevaFecha.getTime() !== normalizarFecha(evento.fecha).getTime())
        || (recurrente?.activa === false)
        || (recurrente?.activa === true && recurrente.frecuencia && recurrente.frecuencia !== evento.recurrente.frecuencia);

      const updates = {};
      if (titulo !== undefined) updates.titulo = titulo;
      if (descripcion !== undefined) updates.descripcion = descripcion;
      if (tipo !== undefined) updates.tipo = tipo;
      if (importe !== undefined) updates.importe = importe;
      if (categoria !== undefined) updates.categoria = categoria;
      if (hora !== undefined) updates.hora = hora;
      if (referenciaTipo !== undefined) updates.referenciaTipo = referenciaTipo;
      if (referenciaId !== undefined) updates.referenciaId = referenciaId;
      if (referenciaNombre !== undefined) updates.referenciaNombre = referenciaNombre;

      if (cambiaTemporal) {
        if (nuevaFecha) updates.fecha = nuevaFecha;
        if (recurrente !== undefined) {
          updates.recurrente = recurrente.activa
            ? { activa: true, frecuencia: recurrente.frecuencia || evento.recurrente.frecuencia, serieId: evento.recurrente.serieId }
            : { activa: false };
        }
        await CalendarEvent.updateMany(
          { 'recurrente.serieId': evento.recurrente.serieId, _id: { $ne: evento._id }, fecha: { $gte: new Date() } },
          { activo: false }
        );
        await CalendarEvent.updateOne({ _id: evento._id }, updates);
        const sigueRecurrente = recurrente === undefined ? evento.recurrente.activa : recurrente.activa;
        if (sigueRecurrente) {
          const base = await CalendarEvent.findById(evento._id);
          await CalendarEvent.insertMany(generarOcurrencias(base));
        }
      } else {
        await CalendarEvent.updateMany({ 'recurrente.serieId': evento.recurrente.serieId, activo: true }, updates);
      }
    } else {
      if (titulo !== undefined) evento.titulo = titulo;
      if (descripcion !== undefined) evento.descripcion = descripcion;
      if (tipo !== undefined) evento.tipo = tipo;
      if (fecha !== undefined) evento.fecha = normalizarFecha(fecha);
      if (hora !== undefined) evento.hora = hora;
      if (importe !== undefined) evento.importe = importe;
      if (categoria !== undefined) evento.categoria = categoria;
      if (referenciaTipo !== undefined) evento.referenciaTipo = referenciaTipo;
      if (referenciaId !== undefined) evento.referenciaId = referenciaId;
      if (referenciaNombre !== undefined) evento.referenciaNombre = referenciaNombre;
      await evento.save();
    }

    const actualizado = await CalendarEvent.findById(evento._id).populate('empleado', 'nombre');
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el evento' });
  }
};

const updateEventStatus = async (req, res) => {
  try {
    const { estado } = req.body;
    if (!['pendiente', 'completado', 'cancelado'].includes(estado)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }
    const evento = await CalendarEvent.findById(req.params.id);
    if (!evento) return res.status(404).json({ message: 'Evento no encontrado' });

    if (req.body.serie && evento.recurrente?.serieId) {
      await CalendarEvent.updateMany({ 'recurrente.serieId': evento.recurrente.serieId, activo: true }, { estado });
    } else {
      evento.estado = estado;
      await evento.save();
    }
    res.json({ message: 'Estado actualizado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el estado' });
  }
};

const deleteEvent = async (req, res) => {
  try {
    const evento = await CalendarEvent.findById(req.params.id);
    if (!evento) return res.status(404).json({ message: 'Evento no encontrado' });

    if (req.body.serie && evento.recurrente?.serieId) {
      await CalendarEvent.updateMany({ 'recurrente.serieId': evento.recurrente.serieId }, { activo: false });
    } else {
      evento.activo = false;
      await evento.save();
    }
    res.json({ message: 'Evento eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar el evento' });
  }
};

module.exports = { getCalendarItems, getEvents, getEvent, createEvent, updateEvent, updateEventStatus, deleteEvent };