import { z } from "zod";
import {
  FORMA_PAGO_606,
  TIPO_BIENES_SERVICIOS_606,
  TIPO_RETENCION_ISR_606,
} from "./catalogs";

export {
  FORMA_PAGO_606,
  TIPO_BIENES_SERVICIOS_606,
  TIPO_RETENCION_ISR_606,
} from "./catalogs";

/**
 * Formato 606 — Compras de Bienes y Servicios.
 * Columnas y catálogos tomados tal cual de "Herramienta de Envio Formato 606.xls"
 * (DGII, hoja "Herramienta Formato 606", Version 2020.2).
 */

const tipoBienesServiciosCodes = Object.keys(TIPO_BIENES_SERVICIOS_606) as [
  string,
  ...string[],
];
const tipoRetencionIsrCodes = Object.keys(TIPO_RETENCION_ISR_606) as [string, ...string[]];
const formaPagoCodes = Object.keys(FORMA_PAGO_606) as [string, ...string[]];

export const invoice606Schema = z.object({
  proveedor: z.string().describe("Nombre del proveedor/emisor de la factura; vacío si no aparece"),
  rncCedula: z
    .string()
    .regex(/^\d{9}$|^\d{11}$/, "RNC (9 dígitos) o Cédula (11 dígitos) del proveedor"),
  tipoId: z.enum(["1", "2"]).describe("1 = RNC, 2 = Cédula"),
  tipoBienesServicios: z.enum(tipoBienesServiciosCodes),
  ncf: z.string().min(8).max(19),
  ncfModificado: z.string().max(19).describe("NCF modificado o vacío si no aplica"),
  fechaComprobante: z.string().regex(/^\d{6}$/, "YYYYMM — solo año y mes, ej: 202604"),
  diaComprobante: z.string().regex(/^\d{2}$/, "DD — solo el día, ej: 14"),
  fechaPago: z
    .string()
    .regex(/^\d{6}$|^$/, "YYYYMM o vacío")
    .describe("Fecha de pago/retención. Solo se completa si la factura tiene retención de ITBIS o ISR."),
  diaPago: z
    .string()
    .regex(/^\d{2}$|^$/, "DD o vacío")
    .describe("Día de pago/retención. Solo se completa si la factura tiene retención de ITBIS o ISR."),
  montoFacturadoServicios: z.number().nonnegative(),
  montoFacturadoBienes: z.number().nonnegative(),
  totalMontoFacturado: z.number().nonnegative(),
  itbisFacturado: z.number().nonnegative(),
  itbisRetenido: z.number().nonnegative(),
  itbisProporcionalidad: z.number().nonnegative(),
  itbisLlevadoCosto: z.number().nonnegative(),
  itbisPorAdelantar: z.number().nonnegative(),
  itbisPercibidoCompras: z.number().nonnegative(),
  tipoRetencionIsr: z.enum(tipoRetencionIsrCodes),
  montoRetencionRenta: z.number().nonnegative(),
  isrPercibidoCompras: z.number().nonnegative(),
  isc: z.number().nonnegative(),
  otrosImpuestos: z.number().nonnegative(),
  montoPropinaLegal: z.number().nonnegative(),
  formaPago: z.enum(formaPagoCodes),
});

export type Invoice606 = z.infer<typeof invoice606Schema>;

/** Orden y encabezados oficiales de columna, tal cual el .xls de la DGII. */
export const COLUMNS_606: { key: keyof Invoice606 | "lineas" | "estatus"; header: string }[] = [
  { key: "lineas", header: "Líneas" },
  { key: "proveedor", header: "Proveedor" },
  { key: "rncCedula", header: "RNC o Cédula" },
  { key: "tipoId", header: "Tipo Id" },
  { key: "tipoBienesServicios", header: "Tipo Bienes y Servicios Comprados" },
  { key: "ncf", header: "NCF" },
  { key: "ncfModificado", header: "NCF ó Documento Modificado" },
  { key: "fechaComprobante", header: "Fecha Comprobante" },
  { key: "diaComprobante", header: "Dia Comprobante" },
  { key: "fechaPago", header: "Fecha Pago" },
  { key: "diaPago", header: "Dia Pago" },
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
