"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function AccountPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (password.length < 8) { setMessage("La contraseña debe tener al menos 8 caracteres."); return; }
    if (password !== confirmation) { setMessage("Las contraseñas no coinciden."); return; }

    setSaving(true);
    const { error } = await createClient().auth.updateUser({ password });
    setSaving(false);
    if (error) { setMessage("No se pudo cambiar la contraseña. Intenta nuevamente."); return; }
    setPassword("");
    setConfirmation("");
    setMessage("Tu contraseña fue actualizada correctamente.");
  }

  if (!open) return null;
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
    <form onSubmit={changePassword} className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
      <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-bold">Cambiar contraseña</h2><button type="button" onClick={onClose} className="text-sm underline">Cerrar</button></div>
      <p className="mt-2 text-sm text-slate-600">Elige una contraseña nueva de al menos 8 caracteres.</p>
      <label className="mt-5 block text-sm font-medium">Contraseña nueva<input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border p-3" /></label>
      <label className="mt-4 block text-sm font-medium">Confirmar contraseña<input required minLength={8} type="password" value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-1 w-full rounded-lg border p-3" /></label>
      {message && <p className="mt-4 rounded-lg bg-violet-50 p-3 text-sm text-violet-800">{message}</p>}
      <button disabled={saving} className="mt-5 w-full rounded-lg bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar contraseña"}</button>
    </form>
  </div>;
}
