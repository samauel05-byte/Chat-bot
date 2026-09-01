"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function ActivateAccountPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [hasInvitationSession, setHasInvitationSession] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data }) => {
      setHasInvitationSession(Boolean(data.session));
      if (!data.session) setMessage("El enlace no es válido o ya expiró. Solicita una nueva invitación.");
      setReady(true);
    });
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) { setMessage("La contraseña debe tener al menos 8 caracteres."); return; }
    if (password !== confirmPassword) { setMessage("Las contraseñas no coinciden."); return; }
    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify({ password }) });
    setLoading(false);
    if (!response.ok) { setMessage("No se pudo crear la contraseña. Solicita una nueva invitación."); return; }
    router.replace("/");
    router.refresh();
  }

  return <main className="grid min-h-dvh place-items-center bg-slate-950 p-5 text-white"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur"><div className="mb-5 flex items-center gap-3"><Image src="/cami-logo.png" alt="CAMI" width={48} height={48} priority className="rounded-xl"/><p className="text-sm font-semibold tracking-[0.24em] text-cyan-300">CAMI</p></div><h1 className="text-2xl font-semibold">Activa tu cuenta</h1><p className="mt-2 text-sm text-slate-300">Crea tu contraseña para comenzar a usar CAMI.</p>{ready && <><label className="mt-6 block text-sm">Contraseña nueva<input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-3 outline-none focus:border-violet-400"/></label><label className="mt-4 block text-sm">Confirmar contraseña<input required minLength={8} type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-3 outline-none focus:border-violet-400"/></label></>}{message && <p className="mt-4 rounded-lg bg-amber-400/10 p-3 text-sm text-amber-200">{message}</p>}<button disabled={!ready || !hasInvitationSession || loading} className="mt-6 w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold disabled:opacity-50">{loading ? "Guardando…" : "Activar cuenta"}</button></form></main>;
}
