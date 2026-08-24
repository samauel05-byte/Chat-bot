import { put } from "@vercel/blob";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { COLUMNS_606 } from "./schema606";
import { COLUMNS_607 } from "./schema607";
import { COLUMNS_IR17 } from "./schemaIR17";
import { EXPORTS_PREFIX, type Tipo } from "./store";

const COLUMNS: Record<Tipo, { key: string; header: string }[]> = {
  "606": COLUMNS_606,
  "607": COLUMNS_607,
  "IR17": COLUMNS_IR17,
};

function columnLetter(columnNumber: number): string {
  let value = columnNumber;
  let letters = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

export type GenerateReportResult = {
  periodo: string;
  tipo: Tipo;
  recordCount: number;
  xlsxPathname: string;
  txtPathname: string;
};

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number.parseFloat(String(value ?? "0")) || 0;
}

/**
 * Las fechas secundarias de la herramienta DGII solo corresponden a una
 * retención. Se eliminan antes de generar ambos archivos para que nunca se
 * rellenen por accidente en facturas sin retención.
 */
function normalizeRetentionDates(tipo: Tipo, row: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...row };
  const hasRetention =
    tipo === "606"
      ? normalized.tipoRetencionIsr !== "00" ||
        numberValue(normalized.itbisRetenido) > 0 ||
        numberValue(normalized.montoRetencionRenta) > 0
      : tipo === "607"
        ? numberValue(normalized.itbisRetenidoTerceros) > 0 ||
          numberValue(normalized.retencionRentaTerceros) > 0
        : true;

  if (!hasRetention && tipo === "606") {
    delete normalized.fechaPago;
    delete normalized.diaPago;
  }
  if (!hasRetention && tipo === "607") {
    delete normalized.fechaRetencion;
    delete normalized.diaRetencion;
  }

  return normalized;
}

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
  const normalizedRows = rows.map((row) => normalizeRetentionDates(tipo, row));

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
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet(`Formato ${tipo}`);
  const totalAmountColumn =
    columns.findIndex((column) => column.key === "totalMontoFacturado") + 1 ||
    columns.findIndex((column) => column.key === "montoFacturado") + 1;
  const sumColumn = columns.length + 1;

  // Header row
  const headerRow = sheet.addRow([...columns.map((c) => c.header), "Sumatoria"]);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6600" } };
  headerRow.alignment = { horizontal: "center" };

  // Data rows (add line numbers)
  normalizedRows.forEach((row, idx) => {
    const dataRow = sheet.addRow(
      columns.map((c) => {
        if (c.key === "lineas") return String(idx + 1);
        if (c.key === "estatus") return "";
        return cellValue(row, c.header);
      })
    );
    if (totalAmountColumn > 0) {
      dataRow.getCell(sumColumn).value = {
        formula: dataRow.getCell(totalAmountColumn).address,
      };
      dataRow.getCell(sumColumn).numFmt = "#,##0.00";
    }
  });

  // Columna auxiliar visible en Excel: facilita revisar cada total de factura y
  // una suma final del lote sin modificar las columnas oficiales de la DGII.
  if (tipo !== "IR17" && normalizedRows.length > 0 && totalAmountColumn > 0) {
    const totalRow = sheet.addRow(columns.map(() => ""));
    totalRow.getCell(Math.max(1, sumColumn - 1)).value = "TOTAL FACTURAS";
    totalRow.getCell(sumColumn).value = {
      formula: `SUM(${columnLetter(sumColumn)}2:${columnLetter(sumColumn)}${totalRow.number - 1})`,
    };
    totalRow.getCell(sumColumn).numFmt = "#,##0.00";
    totalRow.font = { bold: true };
    totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F2FE" } };
  }

  // Totals row for IR17
  if (tipo === "IR17" && normalizedRows.length > 0) {
    const numericKeys = new Set(["baseImponible", "retencionISR", "itbis", "totalFacturado", "aPagar"]);
    const totalsRow = sheet.addRow(
      columns.map((c) => {
        if (c.key === "rncCedula") return "TOTALES";
        if (numericKeys.has(c.key as string)) {
          const sum = normalizedRows.reduce((acc, r) => {
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
  [...columns, { key: "sumatoria", header: "Sumatoria" }].forEach((_, idx) => {
    sheet.getColumn(idx + 1).width = 20;
  });

  const xlsxBuffer = await workbook.xlsx.writeBuffer();

  // TXT: excluir columnas auxiliares
  const skipKeys = new Set(["lineas", "estatus", "proveedor", "cliente", "nombre"]);
  const txtColumns = columns.filter((c) => !skipKeys.has(c.key as string));
  const txtLines = normalizedRows.map((row) =>
    txtColumns.map((c) => cellValue(row, c.header)).join("|")
  );
  const txtContent = txtLines.join("\r\n") + (txtLines.length ? "\r\n" : "");

  // A unique suffix prevents simultaneous users from overwriting each other's
  // exports for the same form and period.
  const reportId = randomUUID().replaceAll("-", "").slice(0, 12);
  const basename = `${tipo}_${periodo}_${reportId}`;
  const xlsxPathname = `${EXPORTS_PREFIX}${basename}.xlsx`;
  const txtPathname = `${EXPORTS_PREFIX}${basename}.txt`;

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
