import { put } from "@vercel/blob";
import ExcelJS from "exceljs";
import { COLUMNS_606 } from "./schema606";
import { COLUMNS_607 } from "./schema607";
import { listInvoices, type Tipo } from "./store";
import { getOrgId } from "@/lib/orgContext";

const COLUMNS: Record<Tipo, { key: string; header: string }[]> = {
  "606": COLUMNS_606,
  "607": COLUMNS_607,
};

export type GenerateReportResult = {
  periodo: string;
  tipo: Tipo;
  recordCount: number;
  xlsxPathname: string;
  txtPathname: string;
};

export function exportPathname(orgId: string, tipo: Tipo, periodo: string, ext: "xlsx" | "txt") {
  return `exports/${orgId}/${tipo}_${periodo}.${ext}`;
}

export async function generateReport(tipo: Tipo, periodo: string, orgId?: string): Promise<GenerateReportResult> {
  if (!/^\d{6}$/.test(periodo)) {
    throw new Error("El período debe tener formato YYYYMM, ej. 202507");
  }

  const id = orgId ?? getOrgId();
  const rows = await listInvoices(tipo, periodo, id);
  const columns = COLUMNS[tipo];

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Formato ${tipo}`);
  sheet.addRow(columns.map((c) => c.header));
  for (const row of rows) {
    sheet.addRow(columns.map((c) => row[c.header] ?? ""));
  }
  sheet.getRow(1).font = { bold: true };
  const xlsxBuffer = await workbook.xlsx.writeBuffer();

  const skipHeaders = new Set(["Líneas", "No", "Proveedor", "Cliente", "Estatus"]);
  const txtColumns = columns.filter((c) => !skipHeaders.has(c.header));
  const txtLines = rows.map((row) => txtColumns.map((c) => row[c.header] ?? "").join("|"));
  const txtContent = txtLines.join("\r\n") + (txtLines.length ? "\r\n" : "");

  const xlsxPath = exportPathname(id, tipo, periodo, "xlsx");
  const txtPath = exportPathname(id, tipo, periodo, "txt");

  await put(xlsxPath, xlsxBuffer, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await put(txtPath, txtContent, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "text/plain; charset=utf-8",
  });

  return { periodo, tipo, recordCount: rows.length, xlsxPathname: xlsxPath, txtPathname: txtPath };
}
