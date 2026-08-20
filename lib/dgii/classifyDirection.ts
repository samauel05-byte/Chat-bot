/**
 * Determina si una factura es una compra (606) o una venta (607) comparando
 * el RNC propio de la empresa contra el RNC emisor/receptor de la factura.
 */
export function classifyDirection(
  companyRnc: string,
  emisorRnc: string | undefined,
  receptorRnc: string | undefined
): "606" | "607" | "ambiguous" {
  const norm = (s: string | undefined) => (s ?? "").replace(/\D/g, "");
  const company = norm(companyRnc);
  if (!company) return "ambiguous";
  if (norm(receptorRnc) === company) return "606";
  if (norm(emisorRnc) === company) return "607";
  return "ambiguous";
}
