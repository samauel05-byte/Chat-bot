"use client";

import { useState } from "react";
import { useOrganization } from "@clerk/nextjs";
import { Chat } from "@/app/components/Chat";
import { Splash } from "@/app/components/Splash";
import Link from "next/link";

export default function Home() {
  const [ready, setReady] = useState(false);
  const { membership } = useOrganization();
  const isAdmin = membership?.role === "org:admin";

  return (
    <>
      {!ready && <Splash onDone={() => setReady(true)} />}
      <div className="relative flex h-dvh flex-col">
        {isAdmin && (
          <div className="absolute right-4 top-[72px] z-10 sm:right-8">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 shadow-sm transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-950"
            >
              📊 Ver Dashboard
            </Link>
          </div>
        )}
        <Chat />
      </div>
    </>
  );
}
