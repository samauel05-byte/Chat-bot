"use client";

import { useState } from "react";
import { Chat } from "@/app/components/Chat";
import { Splash } from "@/app/components/Splash";
import { AdminPanel } from "@/app/components/AdminPanel";
import { AccountPanel } from "@/app/components/AccountPanel";

type QuotaContext = { companyId: string | null; signature: string };

export function NalaWorkspace({ isOwner = false, quotaContext, accountName }: { isOwner?: boolean; quotaContext: QuotaContext; accountName: string }) {
  const [ready, setReady] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <>
      {!ready && <Splash onDone={() => setReady(true)} />}
      <Chat quotaContext={quotaContext} accountName={accountName} onOpenAccount={() => setAccountOpen(true)} onOpenAdmin={isOwner ? () => setAdminOpen(true) : undefined} />
      <AccountPanel open={accountOpen} onClose={() => setAccountOpen(false)} />
      {isOwner && <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />}
    </>
  );
}
