"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string; license_expires_at: string; license_status: string; monthly_invoice_limit: number | null };
type Profile = { id: string; full_name: string | null; username: string | null; company_id: string | null; companies?: { name: string } | { name: string }[] | null };
type Usage = { company_id: string; periodo: string; invoice_count: number };
const COST_PER_INVOICE_USD = 0.10;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [name, setName] = useState("");
  const [rnc, setRnc] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const period = new Date().toISOString().slice(0, 7).replace("-", "");
    const [companyResult, profileResult, usageResult] = await Promise.all([
      supabase.from("companies").select("id, name, license_expires_at, license_status, monthly_invoice_limit").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, username, company_id, companies(name)").eq("role", "client").order("created_at", { ascending: false }),
      supabase.from("invoice_usage_monthly").select("company_id, periodo, invoice_count").eq("periodo", period),
    ]);
    setCompanies((companyResult.data as Company[] | null) ?? []);
    setProfiles((profileResult.data as Profile[] | null) ?? []);
    setUsage((usageResult.data as Usage[] | null) ?? []);
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
    const parsedLimit = monthlyLimit ? Number(monthlyLimit) : null;
    if (parsedLimit !== null && (!Number.isInteger(parsedLimit) || parsedLimit < 1)) {
      setStatus("El límite mensual debe ser un número mayor que cero.");
      return;
    }
    const { error } = await supabase.from("companies").insert({ name, rnc: rnc || null, license_expires_at, monthly_invoice_limit: parsedLimit });
    setStatus(error ? "No se pudo crear la empresa." : "Empresa creada con 30 días de licencia.");
    if (!error) { setName(""); setRnc(""); setMonthlyLimit(""); await load(); }
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
  async function editMonthlyLimit(company: Company) {
    const response = window.prompt(
      "Límite mensual de facturas. Déjalo vacío para no limitar esta empresa.",
      company.monthly_invoice_limit?.toString() ?? ""
    );
    if (response === null) return;
    const value = response.trim();
    const limit = value ? Number(value) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      setStatus("El límite mensual debe ser un número mayor que cero.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("companies").update({ monthly_invoice_limit: limit }).eq("id", company.id);
    setStatus(error ? "No se pudo actualizar el límite." : "Límite mensual actualizado.");
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
    const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, email, companyId }) });
    const result = await response.json();
    setStatus(response.ok ? "Invitación enviada y usuario asignado a la empresa." : result.error);
    if (response.ok) { setUsername(""); setEmail(""); await load(); }
  }
  async function editUser(profile: Profile) {
    const nextUsername = window.prompt("Usuario", profile.username ?? "")?.trim().replace(/\s/g, "").toLowerCase();
    if (!nextUsername) return;
    const nextName = window.prompt("Nombre (opcional)", profile.full_name ?? "");
    if (nextName === null) return;
    const nextPassword = window.prompt("Nueva contraseña (déjala vacía para conservar la actual)", "");
    if (nextPassword === null) return;
    const response = await fetch(`/api/admin/users/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: nextUsername, fullName: nextName, password: nextPassword, companyId: profile.company_id }),
    });
    const result = await response.json();
    setStatus(response.ok ? "Usuario actualizado." : result.error ?? "No se pudo actualizar el usuario.");
    if (response.ok) await load();
  }
  async function moveUser(profile: Profile, nextCompanyId: string) {
    const response = await fetch(`/api/admin/users/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: nextCompanyId }),
    });
    const result = await response.json();
    setStatus(response.ok ? "Usuario asignado a la empresa seleccionada." : result.error ?? "No se pudo actualizar el usuario.");
    if (response.ok) await load();
  }
  async function deleteUser(profile: Profile) {
    if (!window.confirm(`¿Eliminar al usuario “${profile.username || profile.full_name || "sin nombre"}”? Esta acción no se puede deshacer.`)) return;
    const response = await fetch(`/api/admin/users/${profile.id}`, { method: "DELETE" });
    const result = await response.json();
    setStatus(response.ok ? "Usuario eliminado." : result.error ?? "No se pudo eliminar el usuario.");
    if (response.ok) await load();
  }

  return <>
    {open && <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm"><section className="mx-auto max-w-2xl rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Clientes y licencias</h2><button onClick={onClose}>Cerrar</button></div>
      <form onSubmit={createCompany} className="mt-5 grid gap-2 sm:grid-cols-4"><input required value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre de empresa" className="rounded border p-2"/><input value={rnc} onChange={e=>setRnc(e.target.value)} placeholder="RNC (opcional)" className="rounded border p-2"/><label className="relative"><input min="1" type="number" value={monthlyLimit} onChange={e=>setMonthlyLimit(e.target.value)} placeholder="Límite mensual" className="w-full rounded border p-2"/><span className="mt-1 block text-xs text-slate-500">Costo estimado: {usd.format((Number(monthlyLimit) || 0) * COST_PER_INVOICE_USD)}</span></label><button className="rounded bg-violet-600 px-3 py-2 font-semibold text-white">Crear empresa</button></form>
      <h3 className="mt-6 font-semibold">Crear usuario para una empresa</h3><p className="mt-1 text-sm text-slate-600">La persona recibirá un correo para activar su cuenta y crear su contraseña.</p><form onSubmit={createUser} className="mt-2 grid gap-2 sm:grid-cols-2"><input required minLength={3} value={username} onChange={e=>setUsername(e.target.value.replace(/\s/g,""))} placeholder="Usuario" className="rounded border p-2"/><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Correo" className="rounded border p-2"/><select required value={companyId} onChange={e=>setCompanyId(e.target.value)} className="rounded border p-2 sm:col-span-2"><option value="">Empresa…</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="rounded bg-slate-900 px-3 py-2 font-semibold text-white sm:col-span-2">Enviar invitación y activar usuario</button></form>
      {status && <p className="mt-3 text-sm text-violet-700">{status}</p>}
      <h3 className="mt-6 font-semibold">Cuentas pendientes</h3><div className="mt-2 space-y-2">{profiles.filter(p=>!p.company_id).map(p=><div key={p.id} className="flex flex-wrap gap-2 rounded border p-2 text-sm"><span className="flex-1">{p.full_name || "Cliente sin nombre"}</span><select defaultValue="" onChange={e=>e.target.value && void assign(p.id,e.target.value)} className="rounded border p-1"><option value="">Activar en empresa…</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>)}</div>
      <h3 className="mt-6 font-semibold">Usuarios creados</h3><div className="mt-2 space-y-2">{profiles.filter(p=>p.company_id).map(p=>{const company = Array.isArray(p.companies) ? p.companies[0] : p.companies; return <div key={p.id} className="flex flex-wrap items-center gap-2 rounded border p-3 text-sm"><span className="min-w-40 flex-1"><b>{p.username || "Sin usuario"}</b>{p.full_name && <span> · {p.full_name}</span>}<br/><span className="text-slate-600">Empresa: {company?.name || "Sin empresa"}</span></span><select value={p.company_id ?? ""} onChange={e=>e.target.value && void moveUser(p, e.target.value)} className="rounded border p-2"><option value="">Empresa…</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button onClick={()=>void editUser(p)} className="rounded bg-sky-600 px-3 py-2 font-semibold text-white">Editar</button><button onClick={()=>void deleteUser(p)} className="rounded bg-rose-600 px-3 py-2 font-semibold text-white">Eliminar</button></div>})}{profiles.filter(p=>p.company_id).length === 0 && <p className="text-sm text-slate-500">Aún no hay usuarios asignados a una empresa.</p>}</div>
      <h3 className="mt-6 font-semibold">Empresas</h3><div className="mt-2 space-y-2">{companies.map(c=>{const used = usage.find(u=>u.company_id === c.id)?.invoice_count ?? 0; const limitText = c.monthly_invoice_limit === null ? "Sin límite" : `${used.toLocaleString("es-DO")} / ${c.monthly_invoice_limit.toLocaleString("es-DO")} facturas este mes`; const projectedCost = c.monthly_invoice_limit === null ? null : c.monthly_invoice_limit * COST_PER_INVOICE_USD; return <div key={c.id} className="flex flex-wrap items-center gap-2 rounded border p-3 text-sm"><span className="min-w-40 flex-1"><b>{c.name}</b><br/>Vence: {new Intl.DateTimeFormat("es-DO", {dateStyle:"medium"}).format(new Date(c.license_expires_at))}<br/><span className="text-slate-600">Límite: {limitText}</span><br/><span className="font-medium text-emerald-700">Acumulado: {usd.format(used * COST_PER_INVOICE_USD)} ({used.toLocaleString("es-DO")} facturas)</span>{projectedCost !== null && <span className="text-slate-600"> · al límite: {usd.format(projectedCost)}</span>}</span><button onClick={()=>void editCompany(c)} className="rounded bg-sky-600 px-3 py-2 font-semibold text-white">Editar</button><button onClick={()=>void editMonthlyLimit(c)} className="rounded bg-violet-600 px-3 py-2 font-semibold text-white">Límite</button><button onClick={()=>void deleteCompany(c)} className="rounded bg-rose-600 px-3 py-2 font-semibold text-white">Eliminar</button><button onClick={()=>void renew(c.id)} className="rounded bg-emerald-600 px-3 py-2 font-semibold text-white">Marcar pagado · 30 días</button></div>})}</div>
    </section></div>}
  </>;
}
