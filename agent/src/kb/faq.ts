// "GMA, preguntas frecuentes". Prices, payment and cancellation policies are fictional, like the
// network. The CFDI 4.0 fields are the SAT's real requirements for an invoice.
export function renderFaq(): string {
  return [
    "# GMA, preguntas frecuentes",
    "Documento ficticio para una demostración. Grupo Médico Articular no existe.",
    "## Costo de la consulta",
    "La primera consulta de reumatología cuesta 1,800 pesos. Una consulta de seguimiento cuesta 1,400 pesos. Los análisis y estudios que pida el o la especialista no están incluidos y se pagan aparte.",
    "## Seguros de gastos médicos",
    "GMA no tiene pago directo con aseguradoras. Usted paga la consulta y le damos la factura y los documentos para pedir el reembolso a su aseguradora de gastos médicos mayores, por ejemplo GNP, AXA, MetLife, Seguros Monterrey o Allianz, entre otras. La cobertura depende de su póliza; confírmela con su aseguradora.",
    "## Formas de pago",
    "Aceptamos efectivo, tarjeta de débito, tarjeta de crédito y transferencia. No aceptamos cheques.",
    "## Factura",
    "Emitimos factura CFDI 4.0 el mismo día. Para hacerla necesitamos su nombre o razón social, su RFC, su código postal y su régimen fiscal, tal como aparecen en su constancia de situación fiscal.",
    "## Cancelar o cambiar la cita",
    "Puede cancelar o cambiar su cita sin costo si avisa con al menos 24 horas de anticipación. Puede hacerlo en la sucursal, con el enlace del correo de confirmación o llamando de nuevo a este asistente.",
    "## El enlace del correo de confirmación",
    "El correo de confirmación trae un enlace personal a una página donde la persona ve su cita y completa los datos que faltan en su expediente: correo electrónico, domicilio, código postal, un contacto de emergencia, y su aseguradora y número de póliza si tiene seguro. Así la recepción no se los pide el día de la cita. La página no pide datos de pago ni preguntas médicas.",
    "## Llegar tarde",
    "Si llega más de quince minutos tarde, es posible que haya que cambiar la cita a otro horario.",
    "## A quién atendemos",
    "Atendemos solo a personas adultas. La primera consulta es presencial; no se puede hacer por videollamada.",
    "## Urgencias",
    "Las sucursales no atienden urgencias. Ante una emergencia, llame al 911 o vaya a urgencias de un hospital.",
  ].join("\n\n");
}
