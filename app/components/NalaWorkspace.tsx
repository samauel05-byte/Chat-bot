"use client";

import { useState } from "react";
import { Chat } from "@/app/components/Chat";
import { Splash } from "@/app/components/Splash";
import { AdminPanel } from "@/app/components/AdminPanel";

type QuotaContext = { companyId: string | null; signature: string };

export function NalaWorkspace({ isOwner = false, quotaContext }: { isOwner?: boolean; quotaContext: QuotaContext }) {
  const [ready, setReady] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  return (
    <>
      {!ready && <Splash onDone={() => setReady(true)} />}
      <Chat quotaContext={quotaContext} />
      {isOwner && <>
        <button onClick={() => setAdminOpen(true)} className="fixed right-4 top-4 z-40 rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-lg">☰ Administración</button>
        <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
      </>}
    </>
  );
}
