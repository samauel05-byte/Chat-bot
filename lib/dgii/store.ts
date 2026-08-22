import { get, put, list } from "@vercel/blob";
import Papa from "papaparse";
import { COLUMNS_606, type Invoice606 } from "./schema606";
import { COLUMNS_607, type Invoice607 } from "./schema607";
import { getOrgId } from "@/lib/orgContext";

export type Tipo = "606" | "607";

export const EXPORTS_PREFIX = "exports/";

function orgPrefix(orgId: string) {
  return `orgs/${orgId}/`;
}

function csvPathname(tipo: Tipo, orgId: string): string {
  return `${orgPrefix(orgId)}${tipo}.csv`;
}

function configPathname(orgId: string): string {
  return `${orgPrefix(orgId)}config.json`;
}

function statsPathname(orgId: string, periodo: string): string {
  return `${orgPrefix(orgId)}stats/${periodo}.json`;
}

const COLUMNS: Record<Tipo, { key: string; header: string }[]> = {
  "606": COLUMNS_606,
  "607": COLUMNS_607,
};

export type CompanyConfig = { rnc: string; nombre: string };
export type OrgStats = { "606": number; "607": number; total: number };

/** Per-type write locks to avoid concurrent CSV overwrites. */
const writeLocks: Record<string, Record<Tipo, Promise<unknown>>> = {};

function getLock(orgId: string): Record<Tipo, Promise<unknown>> {
  if (!writeLocks[orgId]) {
    writeLocks[orgId] = { "606": Promise.resolve(), "607": Promise.resolve() };
  }
  return writeLocks[orgId];
}

function withWriteLock<T>(orgId: string, tipo: Tipo, fn: () => Promise<T>): Promise<T> {
  const locks = getLock(orgId);
  const result = locks[tipo].then(fn, fn);
  locks[tipo] = result.catch(() => undefined);
  return result;
}

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

export async function getCompanyConfig(orgId?: string): Promise<CompanyConfig | null> {
  const id = orgId ?? getOrgId();
  const text = await readBlobText(configPathname(id));
  return text ? JSON.parse(text) : null;
}

export async function setCompanyConfig(config: CompanyConfig, orgId?: string): Promise<void> {
  const id = orgId ?? getOrgId();
  await writeBlobText(configPathname(id), JSON.stringify(config, null, 2), "application/json");
}

export async function readRows(tipo: Tipo, orgId?: string): Promise<Record<string, string>[]> {
  const id = orgId ?? getOrgId();
  const content = await readBlobText(csvPathname(tipo, id));
  if (!content) return [];
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data;
}

export async function listInvoices(
  tipo: Tipo,
  periodo?: string,
  orgId?: string
): Promise<Record<string, string>[]> {
  const rows = await readRows(tipo, orgId);
  if (!periodo) return rows;
  return rows.filter((r) => (r["Fecha Comprobante"] ?? "").replace(/-/g, "").startsWith(periodo));
}

async function appendRow(tipo: Tipo, record: Record<string, unknown>, orgId: string): Promise<number> {
  return withWriteLock(orgId, tipo, async () => {
    const columns = COLUMNS[tipo];
    const existingRows = await readRows(tipo, orgId);
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

    await writeBlobText(csvPathname(tipo, orgId), fullContent, "text/csv");
    await incrementStats(orgId, tipo);
    return lineas;
  });
}

export async function appendInvoice606(record: Invoice606, orgId?: string): Promise<number> {
  const id = orgId ?? getOrgId();
  return appendRow("606", record, id);
}

export async function appendInvoice607(record: Invoice607, orgId?: string): Promise<number> {
  const id = orgId ?? getOrgId();
  return appendRow("607", record, id);
}

/** Returns invoice counts per type for all available periods for an org. */
export async function getOrgMonthlyStats(orgId: string): Promise<Record<string, OrgStats>> {
  const [rows606, rows607] = await Promise.all([readRows("606", orgId), readRows("607", orgId)]);

  const byPeriod: Record<string, OrgStats> = {};
  const ensurePeriod = (p: string) => {
    if (!byPeriod[p]) byPeriod[p] = { "606": 0, "607": 0, total: 0 };
  };

  for (const r of rows606) {
    const p = (r["Fecha Comprobante"] ?? "").replace(/-/g, "").slice(0, 6);
    if (p.length === 6) { ensurePeriod(p); byPeriod[p]["606"]++; byPeriod[p].total++; }
  }
  for (const r of rows607) {
    const p = (r["Fecha Comprobante"] ?? "").replace(/-/g, "").slice(0, 6);
    if (p.length === 6) { ensurePeriod(p); byPeriod[p]["607"]++; byPeriod[p].total++; }
  }

  return byPeriod;
}

async function incrementStats(orgId: string, tipo: Tipo) {
  const now = new Date();
  const periodo = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const path = statsPathname(orgId, periodo);
  const existing = await readBlobText(path);
  const stats: OrgStats = existing ? JSON.parse(existing) : { "606": 0, "607": 0, total: 0 };
  stats[tipo]++;
  stats.total++;
  await writeBlobText(path, JSON.stringify(stats), "application/json");
}

/** Lists all org IDs that have data (for super-admin view). */
export async function listOrgs(): Promise<string[]> {
  const result = await list({ prefix: "orgs/", mode: "folded", access: "private" });
  return result.folders?.map((f) => f.replace("orgs/", "").replace("/", "")) ?? [];
}
