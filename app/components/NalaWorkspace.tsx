"use client";

import { useState } from "react";
import { Chat } from "@/app/components/Chat";
import { Splash } from "@/app/components/Splash";
import { AdminPanel } from "@/app/components/AdminPanel";

export function NalaWorkspace({ isOwner = false }: { isOwner?: boolean }) {
  const [ready, setReady] = useState(false);
  return (
    <>
      {!ready && <Splash onDone={() => setReady(true)} />}
      <Chat />
      {isOwner && <AdminPanel />}
    </>
  );
}
