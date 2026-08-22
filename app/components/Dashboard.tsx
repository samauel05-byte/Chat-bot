"use client";

import { useEffect, useState } from "react";
import { useOrganization, useUser, UserButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

type OrgStats = { "606": number; "607": number; total: number };
type MonthlyStats = Record<string, OrgStats>;

const TIERS = [
  { label: "Básico", max: 100, color: "bg-slate-400", price: "RD$1,500/mes" },
  { label: "Estándar", max: 200, color: "bg-sky-500", price: "RD$2,800/mes" },
  { label: "Profesional", max: 500, color: "bg-indigo-500", price: "RD$5,000/mes" },
  { label: "Empresarial", max: Infinity, color: "bg-violet-600", price: "RD$9,000/mes" },
] as const;

function getTier(total: number) {
  return TIERS.find((t) => total <= t.max) ?? TIERS[TIERS.length - 1];
}

function formatPeriod(yyyymm: string) {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const y = yyyymm.slice(0, 4);
  const m = parseInt(yyyymm.slice(4, 6), 10) - 1;
  return `${months[m]} ${y}`;
}

export function Dashboard() {
  const { organization } = useOrganization();
  const { user } = useUser();
  const orgId = organization?.id ?? user?.id ?? "default";

  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/orgs/${orgId}/stats`)
      .then((r) => r.json())
      .then((data) => { setStats(data); setLoading(false); })
      .catch(() => { setError("No se pudieron cargar las estadísticas."); setLoading(false); });
  }, [orgId]);

  const periods = stats ? Object.keys(stats).sort() : [];
  const currentPeriod = periods[periods.length - 1];
  const currentStats = currentPeriod ? stats![currentPeriod] : { "606": 0, "607": 0, total: 0 };
  const tier = getTier(currentStats.total);
  const maxBarValue = Math.max(...periods.map((p) => stats![p].total), 1);

  return (
    <div className="flex h-dvh flex-col bg-slate-50 dark:bg-neutral-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center sm:h-14 sm:w-14">
            <Image src="/logo.png" alt="NALA" width={56} height={56} priority />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50 sm:text-base">
              Dashboard — NALA
            </h1>
            {organization && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                🏢 {organization.name}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-white/15 dark:text-neutral-300"
          >
            💬 Ir al Chat
          </Link>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-20 text-neutral-400">
              <span className="animate-pulse text-4xl">⏳</span>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              ⚠️ {error}
            </p>
          )}

          {!loading && !error && (
            <>
              {/* Current month summary */}
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="Compras (606)" value={currentStats["606"]} icon="🛒" color="sky" />
                <StatCard label="Ventas (607)" value={currentStats["607"]} icon="💰" color="emerald" />
                <StatCard label="Total este mes" value={currentStats.total} icon="📊" color="indigo" />
              </div>

              {/* Billing tier */}
              <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
                <h2 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  💳 Plan actual
                </h2>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold text-white ${tier.color}`}>
                      {tier.label}
                    </span>
                    <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {currentStats.total} facturas este mes
                      {tier.max !== Infinity && ` · límite ${tier.max}`}
                    </p>
                  </div>
                  <span className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
                    {tier.price}
                  </span>
                </div>

                {/* Tier progress bar */}
                <div className="mt-4 space-y-2">
                  {TIERS.map((t) => {
                    const prev = TIERS[TIERS.indexOf(t) - 1]?.max ?? 0;
                    const pct = t.max === Infinity
                      ? 100
                      : Math.min(100, ((currentStats.total - prev) / (t.max - prev)) * 100);
                    const isActive = t.label === tier.label;
                    return (
                      <div key={t.label} className="flex items-center gap-3 text-xs">
                        <span className={`w-24 shrink-0 ${isActive ? "font-semibold text-neutral-800 dark:text-neutral-100" : "text-neutral-400"}`}>
                          {t.label}
                        </span>
                        <div className="flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10" style={{ height: 6 }}>
                          <div
                            className={`h-full rounded-full transition-all ${isActive ? t.color : "bg-black/10 dark:bg-white/10"}`}
                            style={{ width: isActive ? `${Math.max(4, pct)}%` : "0%" }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right text-neutral-400">
                          {t.max === Infinity ? "500+" : `hasta ${t.max}`} · {t.price}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Monthly bar chart */}
              {periods.length > 0 && (
                <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-neutral-900">
                  <h2 className="mb-4 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                    📈 Facturas por mes
                  </h2>
                  <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ minHeight: 120 }}>
                    {periods.slice(-12).map((p) => {
                      const s = stats![p];
                      const h606 = (s["606"] / maxBarValue) * 100;
                      const h607 = (s["607"] / maxBarValue) * 100;
                      return (
                        <div key={p} className="flex shrink-0 flex-col items-center gap-1" style={{ minWidth: 48 }}>
                          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                            {s.total}
                          </span>
                          <div className="flex w-full items-end gap-0.5" style={{ height: 80 }}>
                            <div
                              className="flex-1 rounded-t bg-sky-400 dark:bg-sky-500"
                              style={{ height: `${Math.max(h606, h606 > 0 ? 4 : 0)}%` }}
                              title={`606: ${s["606"]}`}
                            />
                            <div
                              className="flex-1 rounded-t bg-emerald-400 dark:bg-emerald-500"
                              style={{ height: `${Math.max(h607, h607 > 0 ? 4 : 0)}%` }}
                              title={`607: ${s["607"]}`}
                            />
                          </div>
                          <span className="text-[10px] text-neutral-400">{formatPeriod(p)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-400" /> Compras 606
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Ventas 607
                    </span>
                  </div>
                </div>
              )}

              {periods.length === 0 && (
                <div className="rounded-2xl border border-black/5 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-neutral-900">
                  <p className="text-3xl">📭</p>
                  <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                    Todavía no hay facturas registradas para esta empresa.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: string;
  color: "sky" | "emerald" | "indigo";
}) {
  const bg = { sky: "bg-sky-50 dark:bg-sky-950/30", emerald: "bg-emerald-50 dark:bg-emerald-950/30", indigo: "bg-indigo-50 dark:bg-indigo-950/30" }[color];
  const text = { sky: "text-sky-700 dark:text-sky-300", emerald: "text-emerald-700 dark:text-emerald-300", indigo: "text-indigo-700 dark:text-indigo-300" }[color];
  return (
    <div className={`rounded-2xl border border-black/5 p-4 shadow-sm dark:border-white/10 ${bg}`}>
      <div className="mb-1 text-2xl">{icon}</div>
      <div className={`text-2xl font-bold ${text}`}>{value}</div>
      <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
    </div>
  );
}
