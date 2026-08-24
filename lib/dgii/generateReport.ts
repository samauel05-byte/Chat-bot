import { put } from "@vercel/blob";
import ExcelJS from "exceljs";
import { COLUMNS_606 } from "./schema606";
import { COLUMNS_607 } from "./schema607";
import { COLUMNS_IR17 } from "./schemaIR17";
import { EXPORTS_PREFIX, type Tipo } from "./store";

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
 * Genera .xlsx y .txt desde una lista de filas en memoria (sin leer del Blob).
 * Cada sesión pasa sus propios datos, garantizando aislamiento total entre usuarios.
 */
export async function generateReport(
  tipo: Tipo,
  periodo: string,
  rows: Record<string, unknown>[]
): Promise<GenerateReportResult> {
  if (!/^\d{6}$/.test(periodo)) {
    throw new Error("El período debe tener formato YYYYMM, ej. 202507");
  }

  const columns = COLUMNS[tipo];

  function cellValue(row: Record<string, unknown>, header: string): string {
    // Find the column key by header
    const col = columns.find((c) => c.header === header);
    if (!col) return "";
    const v = row[col.key as string];
    if (v === undefined || v === null || v === "") return "";
    if (typeof v === "number") return v.toFixed(2);
    return String(v);
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Formato ${tipo}`);

  // Header row
  const headerRow = sheet.addRow(columns.map((c) => c.header));
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6600" } };
  headerRow.alignment = { horizontal: "center" };

  // Data rows (add line numbers)
  rows.forEach((row, idx) => {
    sheet.addRow(
      columns.map((c) => {
        if (c.key === "lineas") return String(idx + 1);
        if (c.key === "estatus") return "";
        return cellValue(row, c.header);
      })
    );
  });

  // Totals row for IR17
  if (tipo === "IR17" && rows.length > 0) {
    const numericKeys = new Set(["baseImponible", "retencionISR", "itbis", "totalFacturado", "aPagar"]);
    const totalsRow = sheet.addRow(
      columns.map((c) => {
        if (c.key === "rncCedula") return "TOTALES";
        if (numericKeys.has(c.key as string)) {
          const sum = rows.reduce((acc, r) => {
            const v = r[c.key as string];
            return acc + (typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0);
          }, 0);
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
    sheet.getColumn(idx + 1).width = 20;
  });

  const xlsxBuffer = await workbook.xlsx.writeBuffer();

  // TXT: excluir columnas auxiliares
  const skipKeys = new Set(["lineas", "estatus", "proveedor", "cliente", "nombre"]);
  const txtColumns = columns.filter((c) => !skipKeys.has(c.key as string));
  const txtLines = rows.map((row) =>
    txtColumns.map((c) => cellValue(row, c.header)).join("|")
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
