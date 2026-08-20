import { z } from "zod";

/**
 * Formato 607 — Ventas de Bienes y Servicios.
 * Columnas y catálogos tomados tal cual de "Herramienta de Envio Formato 607.xls"
 * (DGII, hoja "Herramienta Formato 607", Version 2023.1.1).
 */

export const TIPO_INGRESO_607 = {
  "01": "INGRESOS POR OPERACIONES (NO FINANCIEROS)",
  "02": "INGRESOS FINANCIEROS",
  "03": "INGRESOS EXTRAORDINARIOS",
  "04": "INGRESOS POR ARRENDAMIENTOS",
  "05": "INGRESOS POR VENTA DE ACTIVO DEPRECIABLE",
  "06": "OTROS INGRESOS",
} as const;

const tipoIngresoCodes = Object.keys(TIPO_INGRESO_607) as [string, ...string[]];

export const invoice607Schema = z.object({
  rncCedulaPasaporte: z
    .string()
    .regex(/^\d{9}$|^\d{11}$/, "RNC (9 dígitos) o Cédula (11 dígitos) del cliente")
    .optional(),
  tipoId: z.enum(["1", "2"]).describe("1 = RNC, 2 = Cédula").optional(),
  ncf: z.string().min(8).max(19),
  ncfModificado: z.string().max(19).optional(),
  tipoIngreso: z.enum(tipoIngresoCodes),
  fechaComprobante: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  fechaRetencion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").optional(),
  montoFacturado: z.number().nonnegative(),
  itbisFacturado: z.number().nonnegative().default(0),
  itbisRetenidoTerceros: z.number().nonnegative().default(0),
  itbisPercibido: z.number().nonnegative().default(0),
  retencionRentaTerceros: z.number().nonnegative().default(0),
  isrPercibido: z.number().nonnegative().default(0),
  isc: z.number().nonnegative().default(0),
  otrosImpuestos: z.number().nonnegative().default(0),
  montoPropinaLegal: z.number().nonnegative().default(0),
  efectivo: z.number().nonnegative().default(0),
  chequeTransferenciaDeposito: z.number().nonnegative().default(0),
  tarjetaDebitoCredito: z.number().nonnegative().default(0),
  ventaCredito: z.number().nonnegative().default(0),
  bonosCertificadosRegalo: z.number().nonnegative().default(0),
  permuta: z.number().nonnegative().default(0),
  otrasFormasVentas: z.number().nonnegative().default(0),
});

export type Invoice607 = z.infer<typeof invoice607Schema>;

/** Orden y encabezados oficiales de columna, tal cual el .xls de la DGII. */
export const COLUMNS_607: { key: keyof Invoice607 | "lineas" | "estatus"; header: string }[] = [
  { key: "lineas", header: "No" },
  { key: "rncCedulaPasaporte", header: "RNC/Cédula o Pasaporte" },
  { key: "tipoId", header: "Tipo Identificación" },
  { key: "ncf", header: "Número Comprobante Fiscal" },
  { key: "ncfModificado", header: "Número Comprobante Fiscal Modificado" },
  { key: "tipoIngreso", header: "Tipo de Ingreso" },
  { key: "fechaComprobante", header: "Fecha Comprobante" },
  { key: "fechaRetencion", header: "Fecha de Retención" },
  { key: "montoFacturado", header: "Monto Facturado" },
  { key: "itbisFacturado", header: "ITBIS Facturado" },
  { key: "itbisRetenidoTerceros", header: "ITBIS Retenido por Terceros" },
  { key: "itbisPercibido", header: "ITBIS Percibido" },
  { key: "retencionRentaTerceros", header: "Retención Renta por Terceros" },
  { key: "isrPercibido", header: "ISR Percibido" },
  { key: "isc", header: "Impuesto Selectivo al Consumo" },
  { key: "otrosImpuestos", header: "Otros Impuestos/Tasas" },
  { key: "montoPropinaLegal", header: "Monto Propina Legal" },
  { key: "efectivo", header: "Efectivo" },
  { key: "chequeTransferenciaDeposito", header: "Cheque/ Transferencia/ Depósito" },
  { key: "tarjetaDebitoCredito", header: "Tarjeta Débito/Crédito" },
  { key: "ventaCredito", header: "Venta a Crédito" },
  { key: "bonosCertificadosRegalo", header: "Bonos o Certificados de Regalo" },
  { key: "permuta", header: "Permuta" },
  { key: "otrasFormasVentas", header: "Otras Formas de Ventas" },
  { key: "estatus", header: "Estatus" },
];
