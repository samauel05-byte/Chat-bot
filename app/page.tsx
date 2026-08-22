"use client";

import { useState } from "react";
import { Chat } from "@/app/components/Chat";
import { Splash } from "@/app/components/Splash";

export default function Home() {
  const [ready, setReady] = useState(false);

  return (
    <>
      {!ready && <Splash onDone={() => setReady(true)} />}
      <Chat />
    </>
  );
}
