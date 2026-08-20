import { z } from "zod";

/**
 * Formato 606 — Compras de Bienes y Servicios.
 * Columnas y catálogos tomados tal cual de "Herramienta de Envio Formato 606.xls"
 * (DGII, hoja "Herramienta Formato 606", Version 2020.2).
 */

export const TIPO_BIENES_SERVICIOS_606 = {
  "01": "GASTOS DE PERSONAL",
  "02": "GASTOS POR TRABAJOS, SUMINISTROS Y SERVICIOS",
  "03": "ARRENDAMIENTOS",
  "04": "GASTOS DE ACTIVOS FIJO",
  "05": "GASTOS DE REPRESENTACIÓN",
  "06": "OTRAS DEDUCCIONES ADMITIDAS",
  "07": "GASTOS FINANCIEROS",
  "08": "GASTOS EXTRAORDINARIOS",
  "09": "COMPRAS Y GASTOS QUE FORMARAN PARTE DEL COSTO DE VENTA",
  "10": "ADQUISICIONES DE ACTIVOS",
  "11": "GASTOS DE SEGUROS",
} as const;

export const TIPO_RETENCION_ISR_606 = {
  "00": "NINGUNA",
  "01": "ALQUILERES",
  "02": "HONORARIOS POR SERVICIOS",
  "03": "OTRAS RENTAS",
  "04": "OTRAS RENTAS (RENTAS PRESUNTAS)",
  "05": "INTERESES PAGADOS A PERSONAS JURIDICAS RESIDENTES",
  "06": "INTERESES PAGADOS A PERSONAS FISICAS RESIDENTES",
  "07": "RETENCION POR PROVEEDORES DEL ESTADO",
  "08": "JUEGOS TELEFONICOS",
} as const;

export const FORMA_PAGO_606 = {
  "01": "EFECTIVO",
  "02": "CHEQUES/TRANSFERENCIAS/DEPÓSITO",
  "03": "TARJETA CRÉDITO/DÉBITO",
  "04": "COMPRA A CREDITO",
  "05": "PERMUTA",
  "06": "NOTA DE CREDITO",
  "07": "MIXTO",
} as const;

const tipoBienesServiciosCodes = Object.keys(TIPO_BIENES_SERVICIOS_606) as [
  string,
  ...string[],
];
const tipoRetencionIsrCodes = Object.keys(TIPO_RETENCION_ISR_606) as [string, ...string[]];
const formaPagoCodes = Object.keys(FORMA_PAGO_606) as [string, ...string[]];

export const invoice606Schema = z.object({
  rncCedula: z
    .string()
    .regex(/^\d{9}$|^\d{11}$/, "RNC (9 dígitos) o Cédula (11 dígitos) del proveedor"),
  tipoId: z.enum(["1", "2"]).describe("1 = RNC, 2 = Cédula"),
  tipoBienesServicios: z.enum(tipoBienesServiciosCodes),
  ncf: z.string().min(8).max(19),
  ncfModificado: z.string().max(19).optional(),
  fechaComprobante: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").optional(),
  montoFacturadoServicios: z.number().nonnegative().default(0),
  montoFacturadoBienes: z.number().nonnegative().default(0),
  totalMontoFacturado: z.number().nonnegative(),
  itbisFacturado: z.number().nonnegative().default(0),
  itbisRetenido: z.number().nonnegative().default(0),
  itbisProporcionalidad: z.number().nonnegative().default(0),
  itbisLlevadoCosto: z.number().nonnegative().default(0),
  itbisPorAdelantar: z.number().nonnegative().default(0),
  itbisPercibidoCompras: z.number().nonnegative().default(0),
  tipoRetencionIsr: z.enum(tipoRetencionIsrCodes).default("00"),
  montoRetencionRenta: z.number().nonnegative().default(0),
  isrPercibidoCompras: z.number().nonnegative().default(0),
  isc: z.number().nonnegative().default(0),
  otrosImpuestos: z.number().nonnegative().default(0),
  montoPropinaLegal: z.number().nonnegative().default(0),
  formaPago: z.enum(formaPagoCodes),
});

export type Invoice606 = z.infer<typeof invoice606Schema>;

/** Orden y encabezados oficiales de columna, tal cual el .xls de la DGII. */
export const COLUMNS_606: { key: keyof Invoice606 | "lineas" | "estatus"; header: string }[] = [
  { key: "lineas", header: "Líneas" },
  { key: "rncCedula", header: "RNC o Cédula" },
  { key: "tipoId", header: "Tipo Id" },
  { key: "tipoBienesServicios", header: "Tipo Bienes y Servicios Comprados" },
  { key: "ncf", header: "NCF" },
  { key: "ncfModificado", header: "NCF ó Documento Modificado" },
  { key: "fechaComprobante", header: "Fecha Comprobante" },
  { key: "fechaPago", header: "Fecha Pago" },
  { key: "montoFacturadoServicios", header: "Monto Facturado en Servicios" },
  { key: "montoFacturadoBienes", header: "Monto Facturado en Bienes" },
  { key: "totalMontoFacturado", header: "Total Monto Facturado" },
  { key: "itbisFacturado", header: "ITBIS Facturado" },
  { key: "itbisRetenido", header: "ITBIS Retenido" },
  { key: "itbisProporcionalidad", header: "ITBIS sujeto a Proporcionalidad (Art. 349)" },
  { key: "itbisLlevadoCosto", header: "ITBIS llevado al Costo" },
  { key: "itbisPorAdelantar", header: "ITBIS por Adelantar" },
  { key: "itbisPercibidoCompras", header: "ITBIS percibido en compras" },
  { key: "tipoRetencionIsr", header: "Tipo de Retención en ISR" },
  { key: "montoRetencionRenta", header: "Monto Retención Renta" },
  { key: "isrPercibidoCompras", header: "ISR Percibido en compras" },
  { key: "isc", header: "Impuesto Selectivo al Consumo" },
  { key: "otrosImpuestos", header: "Otros Impuesto/Tasas" },
  { key: "montoPropinaLegal", header: "Monto Propina Legal" },
  { key: "formaPago", header: "Forma de Pago" },
  { key: "estatus", header: "Estatus" },
];
