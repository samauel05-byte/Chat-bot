import { put } from "@vercel/blob";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { COLUMNS_606 } from "./schema606";
import { COLUMNS_607, TIPO_INGRESO_607 } from "./schema607";
import { COLUMNS_IR17 } from "./schemaIR17";
import {
  FORMA_PAGO_606,
  TIPO_BIENES_SERVICIOS_606,
  TIPO_IDENTIFICACION,
  TIPO_RETENCION_ISR_606,
} from "./catalogs";
import { EXPORTS_PREFIX, type Tipo } from "./store";

const COLUMNS: Record<Tipo, { key: string; header: string }[]> = {
  "606": COLUMNS_606,
  "607": COLUMNS_607,
  "IR17": COLUMNS_IR17,
};

export const EXCEL_AMOUNT_FORMAT = "#,##0.00";

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

/** Total que se muestra desde la apertura y que las fórmulas de Excel recalculan al editar. */
export function calculatedInvoiceTotal(tipo: Tipo, row: Record<string, unknown>): number {
  if (tipo === "606") {
    return numberValue(row.montoFacturadoServicios) + numberValue(row.montoFacturadoBienes);
  }
  return numberValue(row.montoFacturado ?? row.totalMontoFacturado);
}

type ExcelList = Record<string, string>;

/** Mantiene los códigos DGII como texto de dos dígitos, aun si fueron leídos como 2. */
export function normalizeDgiiCode(value: unknown, list: ExcelList): string {
  const raw = String(value ?? "").trim();
  const matched = raw.match(/^(\d{1,2})(?:\s*-\s*.*)?$/);
  if (!matched) return raw;

  const code = matched[1].padStart(2, "0");
  return code in list ? code : raw;
}

function dgiiListForColumn(tipo: Tipo, key: string): ExcelList | undefined {
  if (key === "tipoId") return TIPO_IDENTIFICACION;
  if (tipo === "607" && key === "tipoIngreso") return TIPO_INGRESO_607;
  if (tipo !== "606") return undefined;
  if (key === "tipoBienesServicios") return TIPO_BIENES_SERVICIOS_606;
  if (key === "tipoRetencionIsr") return TIPO_RETENCION_ISR_606;
  if (key === "formaPago") return FORMA_PAGO_606;
  return undefined;
}

export function has606Retention(row: Record<string, unknown>): boolean {
  return (
    normalizeDgiiCode(row.tipoRetencionIsr, TIPO_RETENCION_ISR_606) !== "00" ||
    numberValue(row.itbisRetenido) > 0 ||
    numberValue(row.montoRetencionRenta) > 0
  );
}

export function invoiceRowColor(moneda: unknown, rowIndex: number): string {
  if (String(moneda ?? "").toUpperCase() === "USD") return "FFC6EFCE";
  return rowIndex % 2 === 0 ? "FFDDEBF7" : "FFFFFFFF";
}

function displayValue(value: unknown, list?: ExcelList): string {
  const code = list ? normalizeDgiiCode(value, list) : String(value ?? "");
  return list && code in list ? `${code} - ${list[code]}` : code;
}

export function addExcelDropdown(
  sheet: ExcelJS.Worksheet,
  column: number,
  listColumn: number,
  values: ExcelList,
  firstDataRow: number,
  lastDataRow: number
) {
  const listSheet = sheet.workbook.getWorksheet("Listas DGII");
  if (!listSheet) return;

  const labels = Object.entries(values).map(([code, label]) => `${code} - ${label}`);
  listSheet.getCell(1, listColumn).value = "Opciones";
  labels.forEach((label, index) => {
    listSheet.getCell(index + 2, listColumn).value = label;
  });

  // Excel no permite usar directamente otra hoja como origen de validación.
  // Un nombre definido conserva el menú desplegable en el archivo descargado.
  const sourceRange = `'Listas DGII'!$${columnLetter(listColumn)}$2:$${columnLetter(listColumn)}$${labels.length + 1}`;
  const sourceName = `DGII_LISTA_${listColumn}`;
  sheet.workbook.definedNames.add(sourceRange, sourceName);
  // El menú debe estar disponible desde la primera factura y en las filas
  // siguientes para que se puedan corregir o agregar facturas manualmente.
  const finalRow = Math.max(lastDataRow + 500, firstDataRow + 999);
  sheet.getColumn(column).numFmt = "@";
  for (let row = firstDataRow; row <= finalRow; row += 1) {
    sheet.getCell(row, column).dataValidation = {
      type: "list",
      allowBlank: true,
      showInputMessage: true,
      promptTitle: "Opciones DGII",
      prompt: "Selecciona una opción del menú para esta casilla.",
      // El listado ayuda a corregir, pero nunca debe bloquear que el usuario
      // pueda escribir o pegar un valor cuando esté revisando una factura.
      showErrorMessage: false,
      formulae: [sourceName],
    };
  }
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
      ? has606Retention(normalized)
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

  function cellValue(row: Record<string, unknown>, header: string, blankZero = false): string {
    // Find the column key by header
    const col = columns.find((c) => c.header === header);
    if (!col) return "";
    const v = row[col.key as string];
    if (v === undefined || v === null || v === "") return "";
    if (
      tipo === "606" &&
      col.key === "tipoRetencionIsr" &&
      !has606Retention(row)
    ) {
      return "";
    }
    const list = dgiiListForColumn(tipo, col.key as string);
    if (list) return normalizeDgiiCode(v, list);
    if (typeof v === "number") return blankZero && v === 0 ? "" : v.toFixed(2);
    return String(v);
  }

  function excelCellValue(row: Record<string, unknown>, key: string, header: string): string | number {
    const rawValue = row[key];
    if (
      tipo === "606" &&
      key === "tipoRetencionIsr" &&
      !has606Retention(row)
    ) {
      return "";
    }
    const list = dgiiListForColumn(tipo, key);
    if (list) return normalizeDgiiCode(rawValue, list);
    // Los montos no aplicables se muestran vacíos en los reportes descargados.
    if (typeof rawValue === "number" && rawValue === 0) return "";
    // Los montos deben ser números de Excel, no texto: así sus fórmulas y
    // sumatorias se recalculan correctamente cuando se corrige una fila.
    if (typeof rawValue === "number") return rawValue;
    return cellValue(row, header, true);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet(tipo === "606" ? "DIGITAR" : `Formato ${tipo}`);
  const listSheet = workbook.addWorksheet("Listas DGII", { state: "hidden" });
  const totalAmountColumn =
    columns.findIndex((column) => column.key === "totalMontoFacturado") + 1 ||
    columns.findIndex((column) => column.key === "montoFacturado") + 1;
  const servicesColumn = columns.findIndex((column) => column.key === "montoFacturadoServicios") + 1;
  const goodsColumn = columns.findIndex((column) => column.key === "montoFacturadoBienes") + 1;
  const sumColumn = columns.length + 1;
  const firstDataRow = tipo === "606" ? 10 : 2;
  const amountColumns = new Set<number>();
  normalizedRows.forEach((row) => {
    columns.forEach((column, index) => {
      if (typeof row[column.key] === "number") amountColumns.add(index + 1);
    });
  });
  // El formato se aplica a la columna completa para que un monto editado
  // manualmente conserve separador de miles y dos decimales.
  amountColumns.forEach((column) => {
    sheet.getColumn(column).numFmt = EXCEL_AMOUNT_FORMAT;
  });
  sheet.getColumn(sumColumn).numFmt = EXCEL_AMOUNT_FORMAT;

  // El 606 replica la disposición de la hoja DIGITAR de la herramienta DGII.
  let headerRow: ExcelJS.Row;
  if (tipo === "606") {
    sheet.mergeCells("C2:H2");
    sheet.getCell("C2").value = "HERRAMIENTA DE ENVÍO — FORMATO 606";
    sheet.getCell("C2").font = { bold: true, size: 14, color: { argb: "FF17365D" } };
    sheet.getCell("C3").value = "PERÍODO";
    sheet.getCell("D3").value = periodo;
    sheet.getCell("C4").value = "FACTURAS";
    sheet.getCell("D4").value = normalizedRows.length;
    sheet.getCell("C3").font = sheet.getCell("C4").font = { bold: true };
    headerRow = sheet.getRow(firstDataRow - 1);
    headerRow.values = [...columns.map((c) => c.header), "Sumatoria"];
    sheet.views = [{ state: "frozen", ySplit: firstDataRow - 1 }];
  } else {
    headerRow = sheet.addRow([...columns.map((c) => c.header), "Sumatoria"]);
  }
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: tipo === "606" ? "FF17365D" : "FFFF6600" },
  };
  headerRow.font = { bold: true, color: { argb: tipo === "606" ? "FFFFFFFF" : "FF000000" } };
  headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  headerRow.height = tipo === "606" ? 52 : 30;

  // Data rows (add line numbers)
  const invoiceTotals: number[] = [];
  normalizedRows.forEach((row, idx) => {
    const invoiceTotal = calculatedInvoiceTotal(tipo, row);
    invoiceTotals.push(invoiceTotal);
    const dataRow = sheet.addRow(
      columns.map((c) => {
        if (c.key === "lineas") return String(idx + 1);
        if (c.key === "estatus") return "";
        const value = excelCellValue(row, c.key as string, c.header);
        const list = dgiiListForColumn(tipo, c.key as string);
        if (list) return displayValue(value, list);
        return value;
      })
    );
    if (tipo === "606" && totalAmountColumn > 0) {
      if (servicesColumn > 0 && goodsColumn > 0) {
        const servicesAddress = dataRow.getCell(servicesColumn).address;
        const goodsAddress = dataRow.getCell(goodsColumn).address;
        const totalCell = dataRow.getCell(totalAmountColumn);
        totalCell.value = {
          formula: `IF(SUM(${servicesAddress}:${goodsAddress})=0,"",SUM(${servicesAddress}:${goodsAddress}))`,
          result: invoiceTotal === 0 ? "" : invoiceTotal,
        };
        totalCell.numFmt = EXCEL_AMOUNT_FORMAT;
      }
    }
    if (totalAmountColumn > 0) {
      const sumatoriaFormula =
        tipo === "606" && servicesColumn > 0 && goodsColumn > 0
          ? `IF(SUM(${dataRow.getCell(servicesColumn).address}:${dataRow.getCell(goodsColumn).address})=0,"",SUM(${dataRow.getCell(servicesColumn).address}:${dataRow.getCell(goodsColumn).address}))`
          : `IF(${dataRow.getCell(totalAmountColumn).address}=0,"",${dataRow.getCell(totalAmountColumn).address})`;
      dataRow.getCell(sumColumn).value = {
        // En 606 suma directamente Servicios + Bienes, de modo que la casilla
        // verde no dependa de un total anterior si el usuario corrige los montos.
        formula: sumatoriaFormula,
        result: invoiceTotal === 0 ? "" : invoiceTotal,
      };
      dataRow.getCell(sumColumn).numFmt = EXCEL_AMOUNT_FORMAT;
    }
    if (tipo === "606" || tipo === "607") {
      // Las facturas en dólares se destacan para que se revisen antes de la
      // declaración, sin agregar columnas fuera del formato oficial DGII.
      const color = invoiceRowColor(row.moneda, idx);
      for (let column = 1; column <= sumColumn; column += 1) {
        dataRow.getCell(column).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: color },
        };
      }
    }
  });

  // Columna auxiliar visible en Excel: facilita revisar cada total de factura y
  // una suma final del lote sin modificar las columnas oficiales de la DGII.
  if (tipo !== "IR17" && normalizedRows.length > 0 && totalAmountColumn > 0) {
    const batchTotal = invoiceTotals.reduce((sum, invoiceTotal) => sum + invoiceTotal, 0);
    const totalRow = sheet.addRow(columns.map(() => ""));
    totalRow.getCell(Math.max(1, sumColumn - 1)).value = "TOTAL FACTURAS";
    totalRow.getCell(sumColumn).value = {
      formula: `IF(SUM(${columnLetter(sumColumn)}${firstDataRow}:${columnLetter(sumColumn)}${totalRow.number - 1})=0,"",SUM(${columnLetter(sumColumn)}${firstDataRow}:${columnLetter(sumColumn)}${totalRow.number - 1}))`,
      result: batchTotal === 0 ? "" : batchTotal,
    };
    totalRow.getCell(sumColumn).numFmt = EXCEL_AMOUNT_FORMAT;
    totalRow.font = { bold: true };
    totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F2FE" } };
  }

  // Cada casilla con catálogos oficiales tiene su propio menú desplegable.
  // La hoja auxiliar queda oculta y nunca altera el TXT de la DGII.
  const dropdowns: Array<[string, ExcelList]> =
    tipo === "606"
      ? [
      ["tipoBienesServicios", TIPO_BIENES_SERVICIOS_606],
      [
        "tipoRetencionIsr",
        Object.fromEntries(
          Object.entries(TIPO_RETENCION_ISR_606).filter(([code]) => code !== "00")
        ),
      ],
      ["formaPago", FORMA_PAGO_606],
      ]
      : tipo === "607"
        ? [
          ["tipoIngreso", TIPO_INGRESO_607],
        ]
        : [];
  if (dropdowns.length > 0) {
    dropdowns.forEach(([key, values], index) => {
      const column = columns.findIndex((item) => item.key === key) + 1;
      if (column > 0) {
        addExcelDropdown(
          sheet,
          column,
          index + 1,
          values,
          firstDataRow,
          firstDataRow + normalizedRows.length - 1
        );
      }
    });
    listSheet.state = "veryHidden";
  } else {
    workbook.removeWorksheet(listSheet.id);
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
          return sum;
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
    txtColumns.map((c) => cellValue(row, c.header, true)).join("|")
  );
  const txtContent = txtLines.join("\r\n") + (txtLines.length ? "\r\n" : "");

  // A unique suffix prevents simultaneous users from overwriting each other's
  // exports for the same form and period.
  const reportId = randomUUID().replaceAll("-", "").slice(0, 12);
  // El identificador interno evita choques entre usuarios, mientras que la
  // descarga muestra un nombre simple y profesional: ModeloExcel_YYYYMM.xlsx.
  const xlsxPathname = `${EXPORTS_PREFIX}ModeloExcel_${periodo}_${reportId}.xlsx`;
  const txtPathname = `${EXPORTS_PREFIX}${tipo}_${periodo}_${reportId}.txt`;

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
