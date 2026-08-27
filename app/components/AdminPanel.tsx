"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string; license_expires_at: string; license_status: string };
type Profile = { id: string; full_name: string | null; username: string | null; company_id: string | null; companies?: { name: string } | { name: string }[] | null };

export function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState("");
  const [rnc, setRnc] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const [companyResult, profileResult] = await Promise.all([
      supabase.from("companies").select("id, name, license_expires_at, license_status").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, username, company_id, companies(name)").eq("role", "client").order("created_at", { ascending: false }),
    ]);
    setCompanies((companyResult.data as Company[] | null) ?? []);
    setProfiles((profileResult.data as Profile[] | null) ?? []);
  }
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  async function createCompany(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    const license_expires_at = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const { error } = await supabase.from("companies").insert({ name, rnc: rnc || null, license_expires_at });
    setStatus(error ? "No se pudo crear la empresa." : "Empresa creada con 30 días de licencia.");
    if (!error) { setName(""); setRnc(""); await load(); }
  }
  async function renew(id: string) {
    const supabase = createClient();
    const renewalDate = new Date();
    renewalDate.setDate(renewalDate.getDate() + 30);
    const { error } = await supabase.from("companies").update({ license_status: "active", license_expires_at: renewalDate.toISOString() }).eq("id", id);
    setStatus(error ? "No se pudo renovar la licencia." : "Licencia renovada por 30 días.");
    await load();
  }
  async function editCompany(company: Company) {
    const name = window.prompt("Nombre de la empresa", company.name)?.trim();
    if (!name || name === company.name) return;
    const supabase = createClient();
    const { error } = await supabase.from("companies").update({ name }).eq("id", company.id);
    setStatus(error ? "No se pudo editar la empresa." : "Empresa actualizada.");
    await load();
  }
  async function deleteCompany(company: Company) {
    if (!window.confirm(`¿Eliminar “${company.name}”? Sus usuarios quedarán sin empresa y perderán acceso hasta ser reasignados.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("companies").delete().eq("id", company.id);
    setStatus(error ? "No se pudo eliminar la empresa." : "Empresa eliminada.");
    await load();
  }
  async function assign(profileId: string, companyId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ company_id: companyId }).eq("id", profileId);
    setStatus(error ? "No se pudo activar la cuenta." : "Cuenta activada para la empresa seleccionada.");
    await load();
  }
  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, email, password, companyId }) });
    const result = await response.json();
    setStatus(response.ok ? "Usuario creado y asignado a la empresa." : result.error);
    if (response.ok) { setUsername(""); setEmail(""); setPassword(""); await load(); }
  }

  return <>
    {open && <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm"><section className="mx-auto max-w-2xl rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Clientes y licencias</h2><button onClick={onClose}>Cerrar</button></div>
      <form onSubmit={createCompany} className="mt-5 grid gap-2 sm:grid-cols-3"><input required value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre de empresa" className="rounded border p-2"/><input value={rnc} onChange={e=>setRnc(e.target.value)} placeholder="RNC (opcional)" className="rounded border p-2"/><button className="rounded bg-violet-600 px-3 py-2 font-semibold text-white">Crear empresa</button></form>
      <h3 className="mt-6 font-semibold">Crear usuario para una empresa</h3><form onSubmit={createUser} className="mt-2 grid gap-2 sm:grid-cols-2"><input required minLength={3} value={username} onChange={e=>setUsername(e.target.value.replace(/\s/g,""))} placeholder="Usuario" className="rounded border p-2"/><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Correo" className="rounded border p-2"/><input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Contraseña inicial" className="rounded border p-2"/><select required value={companyId} onChange={e=>setCompanyId(e.target.value)} className="rounded border p-2"><option value="">Empresa…</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="rounded bg-slate-900 px-3 py-2 font-semibold text-white sm:col-span-2">Crear y activar usuario</button></form>
      {status && <p className="mt-3 text-sm text-violet-700">{status}</p>}
      <h3 className="mt-6 font-semibold">Cuentas pendientes</h3><div className="mt-2 space-y-2">{profiles.filter(p=>!p.company_id).map(p=><div key={p.id} className="flex flex-wrap gap-2 rounded border p-2 text-sm"><span className="flex-1">{p.full_name || "Cliente sin nombre"}</span><select defaultValue="" onChange={e=>e.target.value && void assign(p.id,e.target.value)} className="rounded border p-1"><option value="">Activar en empresa…</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>)}</div>
      <h3 className="mt-6 font-semibold">Usuarios creados</h3><div className="mt-2 space-y-2">{profiles.filter(p=>p.company_id).map(p=>{const company = Array.isArray(p.companies) ? p.companies[0] : p.companies; return <div key={p.id} className="rounded border p-3 text-sm"><b>{p.username || "Sin usuario"}</b>{p.full_name && <span> · {p.full_name}</span>}<br/><span className="text-slate-600">Empresa: {company?.name || "Sin empresa"}</span></div>})}{profiles.filter(p=>p.company_id).length === 0 && <p className="text-sm text-slate-500">Aún no hay usuarios asignados a una empresa.</p>}</div>
      <h3 className="mt-6 font-semibold">Empresas</h3><div className="mt-2 space-y-2">{companies.map(c=><div key={c.id} className="flex flex-wrap items-center gap-2 rounded border p-3 text-sm"><span className="min-w-40 flex-1"><b>{c.name}</b><br/>Vence: {new Intl.DateTimeFormat("es-DO", {dateStyle:"medium"}).format(new Date(c.license_expires_at))}</span><button onClick={()=>void editCompany(c)} className="rounded bg-sky-600 px-3 py-2 font-semibold text-white">Editar</button><button onClick={()=>void deleteCompany(c)} className="rounded bg-rose-600 px-3 py-2 font-semibold text-white">Eliminar</button><button onClick={()=>void renew(c.id)} className="rounded bg-emerald-600 px-3 py-2 font-semibold text-white">Marcar pagado · 30 días</button></div>)}</div>
    </section></div>}
  </>;
}
