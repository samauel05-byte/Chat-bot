"use client";

import { useState } from "react";
import { Chat } from "@/app/components/Chat";
import { Splash } from "@/app/components/Splash";
import { AdminPanel } from "@/app/components/AdminPanel";
import { AccountPanel } from "@/app/components/AccountPanel";

type QuotaContext = { companyId: string | null; signature: string };

export function NalaWorkspace({ isOwner = false, quotaContext, accountName, mustChangePassword = false }: { isOwner?: boolean; quotaContext: QuotaContext; accountName: string; mustChangePassword?: boolean }) {
  const [ready, setReady] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(mustChangePassword);
  return (
    <>
      {!ready && <Splash onDone={() => setReady(true)} />}
      <Chat quotaContext={quotaContext} accountName={accountName} onOpenAccount={() => setAccountOpen(true)} onOpenAdmin={isOwner ? () => setAdminOpen(true) : undefined} />
      <AccountPanel open={accountOpen || passwordRequired} required={passwordRequired} onClose={() => setAccountOpen(false)} onChanged={() => setPasswordRequired(false)} />
      {isOwner && <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />}
    </>
  );
}
