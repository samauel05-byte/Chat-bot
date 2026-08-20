import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { COLUMNS_606, type Invoice606 } from "./schema606";
import { COLUMNS_607, type Invoice607 } from "./schema607";

export type Tipo = "606" | "607";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const EXPORTS_DIR = path.join(DATA_DIR, "exports");

function csvPath(tipo: Tipo): string {
  return tipo === "606" ? path.join(DATA_DIR, "606.csv") : path.join(DATA_DIR, "607.csv");
}

const COLUMNS: Record<Tipo, { key: string; header: string }[]> = {
  "606": COLUMNS_606,
  "607": COLUMNS_607,
};

export type CompanyConfig = { rnc: string; nombre: string };

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function getCompanyConfig(): CompanyConfig | null {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_PATH)) return null;
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

export function setCompanyConfig(config: CompanyConfig): void {
  ensureDataDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/** Lee el CSV de trabajo de un formato como filas planas { header: valorTexto }. */
export function readRows(tipo: Tipo): Record<string, string>[] {
  const filePath = csvPath(tipo);
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data;
}

/** Filtra filas por período (YYYYMM) comparando contra "Fecha Comprobante". */
export function listInvoices(tipo: Tipo, periodo?: string): Record<string, string>[] {
  const rows = readRows(tipo);
  if (!periodo) return rows;
  return rows.filter((r) => (r["Fecha Comprobante"] ?? "").replace(/-/g, "").startsWith(periodo));
}

function appendRow(tipo: Tipo, record: Record<string, unknown>): number {
  ensureDataDir();
  const filePath = csvPath(tipo);
  const columns = COLUMNS[tipo];
  const exists = fs.existsSync(filePath);
  const lineas = exists ? readRows(tipo).length + 1 : 1;
  const row: Record<string, unknown> = { ...record, lineas, estatus: "" };

  const values = columns.map(({ key }) => {
    const v = row[key];
    if (v === undefined || v === null || v === "") return "";
    if (typeof v === "number") return v.toFixed(2);
    return String(v);
  });

  const csvLine = Papa.unparse([values], { header: false });
  if (!exists) {
    const headerLine = Papa.unparse([columns.map((c) => c.header)], { header: false });
    fs.writeFileSync(filePath, headerLine + "\n" + csvLine + "\n");
  } else {
    fs.appendFileSync(filePath, csvLine + "\n");
  }
  return lineas;
}

export function appendInvoice606(record: Invoice606): number {
  return appendRow("606", record);
}

export function appendInvoice607(record: Invoice607): number {
  return appendRow("607", record);
}

export function ensureExportsDir() {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}
