import { get, put } from "@vercel/blob";
import Papa from "papaparse";
import { COLUMNS_606, type Invoice606 } from "./schema606";
import { COLUMNS_607, type Invoice607 } from "./schema607";
import { COLUMNS_IR17, type InvoiceIR17 } from "./schemaIR17";

export type Tipo = "606" | "607" | "IR17";

const CONFIG_PATHNAME = "config.json";
export const EXPORTS_PREFIX = "exports/";

function csvPathname(tipo: Tipo): string {
  if (tipo === "606") return "606.csv";
  if (tipo === "607") return "607.csv";
  return "IR17.csv";
}

const COLUMNS: Record<Tipo, { key: string; header: string }[]> = {
  "606": COLUMNS_606,
  "607": COLUMNS_607,
  "IR17": COLUMNS_IR17,
};

export type CompanyConfig = { rnc: string; nombre: string };

/**
 * Serializa las escrituras por tipo (606/607) dentro de este proceso: appendRow hace
 * leer-todo -> agregar -> reescribir-todo, así que llamadas concurrentes (ej. confirmar
 * un lote de ~20 facturas de una vez, que puede disparar varias tool calls en paralelo)
 * se pisarían entre sí sin este lock y se perderían filas.
 */
const writeLocks: Record<Tipo, Promise<unknown>> = {
  "606": Promise.resolve(),
  "607": Promise.resolve(),
  "IR17": Promise.resolve(),
};

function withWriteLock<T>(tipo: Tipo, fn: () => Promise<T>): Promise<T> {
  const result = writeLocks[tipo].then(fn, fn);
  writeLocks[tipo] = result.catch(() => undefined);
  return result;
}

/** Lee el contenido de texto de un blob privado, o null si no existe. */
async function readBlobText(pathname: string): Promise<string | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || !result.stream) return null;
  return new Response(result.stream).text();
}

async function writeBlobText(pathname: string, content: string, contentType: string) {
  await put(pathname, content, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  });
}

export async function getCompanyConfig(): Promise<CompanyConfig | null> {
  const text = await readBlobText(CONFIG_PATHNAME);
  return text ? JSON.parse(text) : null;
}

export async function setCompanyConfig(config: CompanyConfig): Promise<void> {
  await writeBlobText(CONFIG_PATHNAME, JSON.stringify(config, null, 2), "application/json");
}

/** Lee el CSV de trabajo de un formato como filas planas { header: valorTexto }. */
export async function readRows(tipo: Tipo): Promise<Record<string, string>[]> {
  const content = await readBlobText(csvPathname(tipo));
  if (!content) return [];
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data;
}

/** Filtra filas por período (YYYYMM) comparando contra "Fecha Comprobante". */
export async function listInvoices(
  tipo: Tipo,
  periodo?: string
): Promise<Record<string, string>[]> {
  const rows = await readRows(tipo);
  if (!periodo) return rows;
  if (tipo === "IR17") {
    return rows.filter((r) => (r["Período"] ?? "").replace(/-/g, "").startsWith(periodo));
  }
  return rows.filter((r) => (r["Fecha Comprobante"] ?? "").replace(/-/g, "").startsWith(periodo));
}

async function appendRow(tipo: Tipo, record: Record<string, unknown>): Promise<number> {
  return withWriteLock(tipo, async () => {
    const columns = COLUMNS[tipo];
    const existingRows = await readRows(tipo);
    const lineas = existingRows.length + 1;
    const row: Record<string, unknown> = { ...record, lineas, estatus: "" };

    const values = columns.map(({ key }) => {
      const v = row[key];
      if (v === undefined || v === null || v === "") return "";
      if (typeof v === "number") return v.toFixed(2);
      return String(v);
    });

    const headerLine = Papa.unparse([columns.map((c) => c.header)], { header: false });
    const dataLines = existingRows.map((existing) =>
      Papa.unparse([columns.map((c) => existing[c.header] ?? "")], { header: false })
    );
    const newLine = Papa.unparse([values], { header: false });
    const fullContent = [headerLine, ...dataLines, newLine].join("\n") + "\n";

    await writeBlobText(csvPathname(tipo), fullContent, "text/csv");
    return lineas;
  });
}

export async function appendInvoice606(record: Invoice606): Promise<number> {
  return appendRow("606", record);
}

export async function appendInvoice607(record: Invoice607): Promise<number> {
  return appendRow("607", record);
}

export async function appendInvoiceIR17(record: InvoiceIR17): Promise<number> {
  return appendRow("IR17", record);
}
