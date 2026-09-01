"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AccountPanel } from "@/app/components/AccountPanel";
import { AdminPanel } from "@/app/components/AdminPanel";

const ANALYSIS_URL = process.env.NEXT_PUBLIC_CAMI_ANALYSIS_URL ?? "https://analisis-itbis.vercel.app";

export function AnalysisWorkspace({
  isOwner = false,
  accountName,
  mustChangePassword = false,
}: {
  isOwner?: boolean;
  accountName: string;
  mustChangePassword?: boolean;
}) {
  const [adminOpen, setAdminOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(mustChangePassword);

  return (
    <div className="flex h-dvh flex-col bg-slate-100 dark:bg-neutral-950">
      <header className="flex flex-col gap-3 border-b border-black/10 bg-white px-3 py-3 shadow-sm dark:border-white/10 dark:bg-neutral-900 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/cami-logo.png" alt="CAMI" width={48} height={48} priority className="h-11 w-11 rounded-xl" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-slate-900 dark:text-white">CAMI · Análisis fiscal</h1>
            <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">606 · 607 · CardNET · Azul · IT-1 · IR-2</p>
          </div>
        </div>
        <nav className="flex w-full flex-wrap items-center gap-2 sm:w-auto" aria-label="Módulos principales">
          <span className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white sm:text-sm">📊 Análisis fiscal</span>
          <Link href="/" className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-500/40 dark:text-violet-300 sm:text-sm">🤖 Asistente fiscal IA</Link>
          {isOwner && <button type="button" onClick={() => setAdminOpen(true)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-white/15 dark:text-slate-200 sm:text-sm">Administración</button>}
          <button type="button" onClick={() => setAccountOpen(true)} className="max-w-44 truncate rounded-lg border border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:border-white/15 dark:text-slate-200 sm:text-sm">👤 {accountName}</button>
        </nav>
      </header>

      <main className="min-h-0 flex-1 p-2 sm:p-3">
        <iframe
          title="CAMI · Control y Análisis de Movimientos e Impuestos"
          src={ANALYSIS_URL}
          className="h-full w-full rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10"
          allow="clipboard-read; clipboard-write"
        />
      </main>

      <AccountPanel open={accountOpen || passwordRequired} required={passwordRequired} onClose={() => setAccountOpen(false)} onChanged={() => setPasswordRequired(false)} />
      {isOwner && <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />}
    </div>
  );
}
