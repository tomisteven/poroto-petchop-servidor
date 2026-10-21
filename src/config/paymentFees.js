// Alícuotas (%) que el comercio absorbe segun el medio de pago.
// El precio para el cliente NO cambia: estas deducciones salen de la ganancia.
//
// - tarjeta_debito: Retencion IIBB 2,5% + Comision Mercado Pago 2%
// - tarjeta (credito): Retencion IIBB 2,5% + Comision Mercado Pago 6,29%
// - efectivo / transferencia: sin deducciones
const PAYMENT_FEES = {
  tarjeta_debito: { retencionIIBB: 2.5, comisionMP: 2 },
  tarjeta: { retencionIIBB: 2.5, comisionMP: 6.29 },
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const calcularDeduccionesPago = (metodoPago, totalFinal) => {
  const total = Number(totalFinal) || 0;
  const fees = PAYMENT_FEES[metodoPago];

  if (!fees) {
    return { retencionIIBB: 0, comisionMP: 0, impuestosPago: 0, totalNeto: round2(total) };
  }

  const retencionIIBB = round2((total * fees.retencionIIBB) / 100);
  const comisionMP = round2((total * fees.comisionMP) / 100);
  const impuestosPago = round2(retencionIIBB + comisionMP);

  return {
    retencionIIBB,
    comisionMP,
    impuestosPago,
    totalNeto: round2(total - impuestosPago),
  };
};

module.exports = { PAYMENT_FEES, calcularDeduccionesPago };
