import { z } from "zod";

export const invoiceIR17Schema = z.object({
  nombre: z.string().describe("Nombre o razón social del contratista/proveedor; vacío si no aparece"),
  rncCedula: z
    .string()
    .regex(/^\d{9}$|^\d{11}$/, "RNC (9 dígitos) o Cédula (11 dígitos) del contratista"),
  tipoId: z.enum(["1", "2"]).describe("1 = RNC (empresa), 2 = Cédula (persona física)"),
  ncf: z.string().describe("NCF del comprobante fiscal o vacío si no aplica"),
  periodo: z
    .string()
    .regex(/^\d{6}$/, "YYYYMM — año y mes del período, ej: 202607"),
  baseImponible: z
    .number()
    .nonnegative()
    .describe("Monto base / subtotal del servicio (antes de ITBIS e ISR)"),
  retencionISR: z
    .number()
    .nonnegative()
    .describe("Monto retenido de ISR (generalmente 3% de la base)"),
  itbis: z
    .number()
    .nonnegative()
    .describe("ITBIS calculado (generalmente 18% de la base)"),
  totalFacturado: z
    .number()
    .nonnegative()
    .describe("Total de la factura (base + ITBIS)"),
  aPagar: z
    .number()
    .nonnegative()
    .describe("Monto a pagar al proveedor (totalFacturado - retencionISR - retencionITBIS si aplica)"),
});

export type InvoiceIR17 = z.infer<typeof invoiceIR17Schema>;

export const COLUMNS_IR17: { key: keyof InvoiceIR17 | "lineas" | "estatus"; header: string }[] = [
  { key: "lineas", header: "Líneas" },
  { key: "nombre", header: "Nombre o Razón Social" },
  { key: "rncCedula", header: "CEDULA/PASS" },
  { key: "ncf", header: "NCF" },
  { key: "baseImponible", header: "Base" },
  { key: "retencionISR", header: "3%" },
  { key: "itbis", header: "18%" },
  { key: "totalFacturado", header: "TOTAL" },
  { key: "aPagar", header: "A pagar" },
  { key: "estatus", header: "Estatus" },
];
