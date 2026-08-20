/**
 * Shared across 606 and 607. Source: "Tipo Id" / "Tipo Identificación" columns
 * in the official DGII "Herramienta de Envío" tools.
 */
export const TIPO_IDENTIFICACION = {
  "1": "RNC",
  "2": "CEDULA",
} as const;

export type TipoIdentificacion = keyof typeof TIPO_IDENTIFICACION;
