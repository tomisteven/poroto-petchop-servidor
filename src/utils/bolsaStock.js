const GRAMOS_POR_KILO = 1000;

const round = (n) => Math.round(n);

const fullGramos = (kilosPorBolsa) => (kilosPorBolsa > 0 ? kilosPorBolsa * GRAMOS_POR_KILO : 0);

const estadoInicial = (producto) => ({
  stock: producto.stock || 0,
  gramos: Number(producto.gramosBolsaAbierta) || 0,
});

function consumirKilos(state, kilos) {
  const full = fullGramos(state.kilosPorBolsa);
  let s = state.stock;
  let g = round(state.gramos || 0);
  let rest = round((kilos || 0) * GRAMOS_POR_KILO);
  const bolsasConsumidas = [];

  // Sin tamaño de bolsa configurado no hay forma de abrir/reponer: no consumir.
  if (full <= 0) return { stock: s, gramos: g, bolsasConsumidas };

  while (rest > 0) {
    if (g <= 0) {
      const stockAnterior = s;
      s -= 1;
      g = full;
      bolsasConsumidas.push({ stockAnterior, stockNuevo: s });
    }
    const take = Math.min(rest, g);
    g -= take;
    rest -= take;
  }

  return { stock: s, gramos: g, bolsasConsumidas };
}

function devolverKilos(state, kilos) {
  const full = fullGramos(state.kilosPorBolsa);
  const total = round(state.gramos || 0) + round((kilos || 0) * GRAMOS_POR_KILO);
  if (full <= 0) return { stock: state.stock, gramos: total, bolsasDevueltas: 0 };
  const bolsasDevueltas = Math.floor(total / full);
  return {
    stock: state.stock + bolsasDevueltas,
    gramos: total % full,
    bolsasDevueltas,
  };
}

module.exports = { consumirKilos, devolverKilos, estadoInicial, GRAMOS_POR_KILO };