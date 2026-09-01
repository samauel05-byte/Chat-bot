"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    if (!isNew) {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: email, password }) });
      const session = await response.json();
      if (!response.ok) { setLoading(false); setMessage("No fue posible acceder. Verifica el usuario/correo y la contraseña."); return; }
      const result = await supabase.auth.setSession(session);
      setLoading(false);
      if (result.error) { setMessage("No fue posible acceder. Intenta de nuevo."); return; }
      router.replace("/"); router.refresh(); return;
    }
    const result = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username }, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (result.error) {
      setMessage("No fue posible acceder. Verifica el correo y la contraseña.");
      return;
    }
    if (isNew && !result.data.session) {
      setMessage("Revisa tu correo para confirmar la cuenta antes de entrar.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-950 p-5 text-white">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur">
        <div className="mb-5 flex items-center gap-3">
          <Image src="/cami-logo.png" alt="CAMI" width={48} height={48} priority className="rounded-xl" />
          <div><p className="text-sm font-semibold tracking-[0.24em] text-cyan-300">CAMI</p><p className="text-xs text-slate-400">Análisis fiscal + Asistente IA</p></div>
        </div>
        <h1 className="text-2xl font-semibold">{isNew ? "Crear cuenta" : "Accede a tu cuenta"}</h1>
        <p className="mt-2 text-sm text-slate-300">Tus reportes y licencia están protegidos.</p>
        {isNew && <label className="mt-6 block text-sm">Usuario
          <input required minLength={3} value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-3 outline-none focus:border-violet-400" />
        </label>}
        <label className="mt-6 block text-sm">{isNew ? "Correo electrónico" : "Usuario o correo"}
          <input required type={isNew ? "email" : "text"} autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-3 outline-none focus:border-violet-400" />
        </label>
        <label className="mt-4 block text-sm">Contraseña
          <input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-3 outline-none focus:border-violet-400" />
        </label>
        {message && <p className="mt-4 rounded-lg bg-amber-400/10 p-3 text-sm text-amber-200">{message}</p>}
        <button disabled={loading} className="mt-6 w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold disabled:opacity-50">{loading ? "Procesando…" : isNew ? "Crear cuenta" : "Entrar"}</button>
        <button type="button" onClick={() => { setIsNew(!isNew); setMessage(null); }} className="mt-4 w-full text-sm text-violet-300 underline">
          {isNew ? "Ya tengo una cuenta" : "Solicitar una cuenta"}
        </button>
      </form>
    </main>
  );
}
