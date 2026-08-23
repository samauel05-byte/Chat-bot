import { put } from "@vercel/blob";
import ExcelJS from "exceljs";
import { COLUMNS_606 } from "./schema606";
import { COLUMNS_607 } from "./schema607";
import { COLUMNS_IR17 } from "./schemaIR17";
import { listInvoices, EXPORTS_PREFIX, type Tipo } from "./store";

const COLUMNS: Record<Tipo, { key: string; header: string }[]> = {
  "606": COLUMNS_606,
  "607": COLUMNS_607,
  "IR17": COLUMNS_IR17,
};

export type GenerateReportResult = {
  periodo: string;
  tipo: Tipo;
  recordCount: number;
  xlsxPathname: string;
  txtPathname: string;
};

/**
 * Genera, para un período (YYYYMM) y tipo (606/607):
 * - un .xlsx de revisión con las mismas columnas/orden de la plantilla oficial de la DGII
 * - el .txt delimitado por "|" en el formato que acepta la Oficina Virtual (sin encabezado,
 *   sin las columnas auxiliares "Líneas"/"Estatus" que sólo existen en la herramienta Excel)
 * Ambos se guardan como blobs privados (requieren proxy autenticado para descargarse).
 */
export async function generateReport(tipo: Tipo, periodo: string): Promise<GenerateReportResult> {
  if (!/^\d{6}$/.test(periodo)) {
    throw new Error("El período debe tener formato YYYYMM, ej. 202507");
  }

  const rows = await listInvoices(tipo, periodo);
  const columns = COLUMNS[tipo];

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Formato ${tipo}`);

  // Header row
  const headerRow = sheet.addRow(columns.map((c) => c.header));
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6600" } };
  headerRow.alignment = { horizontal: "center" };

  // Data rows
  for (const row of rows) {
    sheet.addRow(columns.map((c) => row[c.header] ?? ""));
  }

  // Totals row for IR17 (yellow, bold, with column sums)
  if (tipo === "IR17" && rows.length > 0) {
    const numericHeaders = new Set(["Base", "3%", "18%", "TOTAL", "A pagar"]);
    const totalsRow = sheet.addRow(
      columns.map((c) => {
        if (c.header === "CEDULA/PASS") return "TOTALES";
        if (numericHeaders.has(c.header)) {
          const sum = rows.reduce((acc, r) => acc + parseFloat(r[c.header] ?? "0") || 0, 0);
          return sum.toFixed(2);
        }
        return "";
      })
    );
    totalsRow.font = { bold: true };
    totalsRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
  }

  // Column widths
  columns.forEach((_, idx) => {
    sheet.getColumn(idx + 1).width = 18;
  });
  const xlsxBuffer = await workbook.xlsx.writeBuffer();

  // TXT: excluir columnas auxiliares que no van en el formato oficial
  const skipHeaders = new Set(["Líneas", "No", "Proveedor", "Cliente", "Estatus"]);
  const txtColumns = columns.filter((c) => !skipHeaders.has(c.header));
  const txtLines = rows.map((row) =>
    txtColumns.map((c) => row[c.header] ?? "").join("|")
  );
  const txtContent = txtLines.join("\r\n") + (txtLines.length ? "\r\n" : "");

  const xlsxPathname = `${EXPORTS_PREFIX}${tipo}_${periodo}.xlsx`;
  const txtPathname = `${EXPORTS_PREFIX}${tipo}_${periodo}.txt`;

  await put(xlsxPathname, xlsxBuffer, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await put(txtPathname, txtContent, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "text/plain; charset=utf-8",
  });

  return { periodo, tipo, recordCount: rows.length, xlsxPathname, txtPathname };
}
