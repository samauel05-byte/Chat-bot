import { put } from "@vercel/blob";
import ExcelJS from "exceljs";
import { COLUMNS_606 } from "./schema606";
import { COLUMNS_607 } from "./schema607";
import { listInvoices, EXPORTS_PREFIX, type Tipo } from "./store";

const COLUMNS: Record<Tipo, { key: string; header: string }[]> = {
  "606": COLUMNS_606,
  "607": COLUMNS_607,
};

const DATE_HEADERS = new Set(["Fecha Comprobante", "Fecha Pago", "Fecha de Retención"]);

function toDgiiDate(value: string): string {
  return value ? value.replace(/-/g, "") : "";
}

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
  sheet.addRow(columns.map((c) => c.header));
  for (const row of rows) {
    sheet.addRow(columns.map((c) => row[c.header] ?? ""));
  }
  sheet.getRow(1).font = { bold: true };
  const xlsxBuffer = await workbook.xlsx.writeBuffer();

  const txtColumns = columns.filter((c) => c.key !== "lineas" && c.key !== "estatus");
  const txtLines = rows.map((row) =>
    txtColumns
      .map((c) => {
        const raw = row[c.header] ?? "";
        return DATE_HEADERS.has(c.header) ? toDgiiDate(raw) : raw;
      })
      .join("|")
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
