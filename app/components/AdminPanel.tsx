"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string; license_expires_at: string; license_status: string; monthly_invoice_limit: number | null; is_trial: boolean; trial_invoice_limit: number | null };
type Profile = { id: string; full_name: string | null; username: string | null; role: "owner" | "client"; company_id: string | null; companies?: { name: string } | { name: string }[] | null };
type Usage = { company_id: string; periodo: string; invoice_count: number };
const COST_PER_INVOICE_USD = 0.15;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function AdminPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [name, setName] = useState("");
  const [rnc, setRnc] = useState("");
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [trialCompanyName, setTrialCompanyName] = useState("");
  const [trialUsername, setTrialUsername] = useState("");
  const [trialFirstName, setTrialFirstName] = useState("");
  const [trialLastName, setTrialLastName] = useState("");
  const [trialEmail, setTrialEmail] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isCreatingTrial, setIsCreatingTrial] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [activeSection, setActiveSection] = useState<"resumen" | "usuarios" | "empresas">("resumen");
  const activeTrialCount = companies.filter((company) => company.is_trial).length;
  const thisMonth = new Date().toISOString().slice(0, 7).replace("-", "");
  const invoicesThisMonth = usage
    .filter((item) => item.periodo === thisMonth)
    .reduce((total, item) => total + item.invoice_count, 0);
  const costThisMonth = invoicesThisMonth * COST_PER_INVOICE_USD;
  const activeClients = companies.filter((company) => !company.is_trial).length;
  const pendingAccounts = profiles.filter((profile) => profile.role === "client" && !profile.company_id).length;

  async function load() {
    const supabase = createClient();
    const [companyResult, profileResult, usageResult] = await Promise.all([
      supabase.from("companies").select("id, name, license_expires_at, license_status, monthly_invoice_limit, is_trial, trial_invoice_limit").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, username, role, company_id, companies(name)").order("created_at", { ascending: false }),
      supabase.from("invoice_usage_monthly").select("company_id, periodo, invoice_count"),
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
    if (isCreatingUser) return;
    setIsCreatingUser(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, email, companyId, fullName }) });
      const result = await response.json();
      setStatus(response.ok ? "Invitación enviada y usuario asignado a la empresa." : result.error);
      if (response.ok) { setUsername(""); setFirstName(""); setLastName(""); setEmail(""); await load(); }
    } finally { setIsCreatingUser(false); }
  }
  async function createTrial(event: React.FormEvent) {
    event.preventDefault();
    if (isCreatingTrial) return;
    setIsCreatingTrial(true);
    try {
      const response = await fetch("/api/admin/trials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: trialCompanyName,
          username: trialUsername.replace(/\s/g, ""),
          email: trialEmail,
          fullName: `${trialFirstName.trim()} ${trialLastName.trim()}`.trim(),
        }),
      });
      const result = await response.json();
      setStatus(response.ok ? "Prueba enviada: el cliente podrá exportar un máximo total de 5 facturas." : result.error ?? "No se pudo enviar la prueba.");
      if (response.ok) { setTrialCompanyName(""); setTrialUsername(""); setTrialFirstName(""); setTrialLastName(""); setTrialEmail(""); await load(); }
    } finally { setIsCreatingTrial(false); }
  }
  async function convertTrial(company: Company) {
    if (!window.confirm(`¿Activar “${company.name}” como cliente regular? Se quitará el límite de prueba de 5 facturas.`)) return;
    const supabase = createClient();
    const licenseExpiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const { error } = await supabase.from("companies").update({ is_trial: false, trial_invoice_limit: null, monthly_invoice_limit: null, license_status: "active", license_expires_at: licenseExpiresAt }).eq("id", company.id);
    setStatus(error ? "No se pudo activar el plan regular." : "Cuenta de prueba convertida a cliente regular con 30 días de licencia.");
    await load();
  }
  function openEditUser(profile: Profile) {
    const [firstName = "", ...lastName] = (profile.full_name ?? "").trim().split(/\s+/).filter(Boolean);
    setEditingUser(profile); setEditUsername(profile.username ?? ""); setEditFirstName(firstName); setEditLastName(lastName.join(" ")); setEditPassword("");
  }
  async function saveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;
    const response = await fetch(`/api/admin/users/${editingUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: editUsername.trim().replace(/\s/g, "").toLowerCase(), fullName: `${editFirstName.trim()} ${editLastName.trim()}`.trim(), password: editPassword, companyId: editingUser.company_id }),
    });
    const result = await response.json();
    setStatus(response.ok ? "Usuario actualizado." : result.error ?? "No se pudo actualizar el usuario.");
    if (response.ok) { setEditingUser(null); await load(); }
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
    {open && <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-4"><section className="mx-auto max-w-3xl rounded-2xl bg-white p-4 text-slate-900 shadow-2xl sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Administración</h2><p className="text-sm text-slate-500">Clientes, usuarios, licencias y consumo.</p></div><div className="flex items-center gap-2"><button onClick={()=>setShowAllUsers(true)} className="rounded border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-700">Usuarios ({profiles.length})</button><button onClick={onClose} className="rounded border px-3 py-2 text-sm font-medium">Cerrar</button></div></div>
      <nav className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1" aria-label="Secciones de administración">{([['resumen','Resumen'],['usuarios','Usuarios'],['empresas','Empresas']] as const).map(([section,label])=><button key={section} onClick={()=>setActiveSection(section)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${activeSection === section ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600'}`}>{label}</button>)}</nav>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border border-violet-100 bg-violet-50 p-3"><p className="text-xs font-medium text-violet-700">Facturas exportadas</p><p className="mt-1 text-2xl font-bold">{invoicesThisMonth.toLocaleString("es-DO")}</p><p className="text-xs text-slate-600">Este mes</p></div><div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-xs font-medium text-emerald-700">Facturado</p><p className="mt-1 text-2xl font-bold">{usd.format(costThisMonth)}</p><p className="text-xs text-slate-600">A US$0.15 por factura</p></div><div className="rounded-xl border border-sky-100 bg-sky-50 p-3"><p className="text-xs font-medium text-sky-700">Clientes activos</p><p className="mt-1 text-2xl font-bold">{activeClients}</p><p className="text-xs text-slate-600">{activeTrialCount} cuenta{activeTrialCount === 1 ? '' : 's'} de prueba</p></div><div className="rounded-xl border border-amber-100 bg-amber-50 p-3"><p className="text-xs font-medium text-amber-700">Cuentas pendientes</p><p className="mt-1 text-2xl font-bold">{pendingAccounts}</p><p className="text-xs text-slate-600">Esperando asignación</p></div></div>
      {activeSection === "resumen" && <div className="mt-5 rounded-xl border p-4"><h3 className="font-semibold">Vista rápida</h3><p className="mt-1 text-sm text-slate-600">Selecciona una sección para administrar usuarios o empresas. El consumo se actualiza al exportar cada Excel.</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>setActiveSection("usuarios")} className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Gestionar usuarios</button><button onClick={()=>setActiveSection("empresas")} className="rounded bg-violet-600 px-3 py-2 text-sm font-semibold text-white">Gestionar empresas</button></div></div>}
      {activeSection === "empresas" && <><form onSubmit={createCompany} className="mt-5 grid gap-2 sm:grid-cols-4"><input required value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre de empresa" className="rounded border p-2"/><input value={rnc} onChange={e=>setRnc(e.target.value)} placeholder="RNC (opcional)" className="rounded border p-2"/><label className="relative"><input min="1" type="number" value={monthlyLimit} onChange={e=>setMonthlyLimit(e.target.value)} placeholder="Límite mensual" className="w-full rounded border p-2"/><span className="mt-1 block text-xs text-slate-500">Costo estimado: {usd.format((Number(monthlyLimit) || 0) * COST_PER_INVOICE_USD)}</span></label><button className="rounded bg-violet-600 px-3 py-2 font-semibold text-white">Crear empresa</button></form></>}
      {activeSection === "usuarios" && <><h3 className="mt-6 font-semibold">Crear usuario para una empresa</h3><p className="mt-1 text-sm text-slate-600">La persona recibirá un correo para activar su cuenta y crear su contraseña.</p><form onSubmit={createUser} className="mt-2 grid gap-2 sm:grid-cols-2"><input required disabled={isCreatingUser} minLength={3} value={username} onChange={e=>setUsername(e.target.value.replace(/\s/g,""))} placeholder="Usuario" className="rounded border p-2"/><input required disabled={isCreatingUser} value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Nombre" className="rounded border p-2"/><input required disabled={isCreatingUser} value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Apellido" className="rounded border p-2"/><input required disabled={isCreatingUser} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Correo" className="rounded border p-2"/><select required disabled={isCreatingUser} value={companyId} onChange={e=>setCompanyId(e.target.value)} className="rounded border p-2 sm:col-span-2"><option value="">Empresa…</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button disabled={isCreatingUser} className="rounded bg-slate-900 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400 sm:col-span-2">{isCreatingUser ? "Enviando invitación…" : "Enviar invitación y activar usuario"}</button></form>
      <h3 className="mt-6 font-semibold">Enviar prueba del sistema</h3><p className="mt-1 text-sm text-slate-600">Puedes tener hasta 5 cuentas de prueba activas. Cada una permite exportar 5 facturas en total; al agotarlas, no se recargan hasta que tú actives su plan regular.</p><form onSubmit={createTrial} className="mt-2 grid gap-2 sm:grid-cols-2"><input required disabled={activeTrialCount >= 5 || isCreatingTrial} minLength={2} value={trialCompanyName} onChange={e=>setTrialCompanyName(e.target.value)} placeholder="Empresa del cliente" className="rounded border p-2 disabled:bg-slate-100"/><input required disabled={activeTrialCount >= 5 || isCreatingTrial} minLength={3} value={trialUsername} onChange={e=>setTrialUsername(e.target.value.replace(/\s/g,""))} placeholder="Usuario" className="rounded border p-2 disabled:bg-slate-100"/><input required disabled={activeTrialCount >= 5 || isCreatingTrial} value={trialFirstName} onChange={e=>setTrialFirstName(e.target.value)} placeholder="Nombre" className="rounded border p-2 disabled:bg-slate-100"/><input required disabled={activeTrialCount >= 5 || isCreatingTrial} value={trialLastName} onChange={e=>setTrialLastName(e.target.value)} placeholder="Apellido" className="rounded border p-2 disabled:bg-slate-100"/><input required disabled={activeTrialCount >= 5 || isCreatingTrial} type="email" value={trialEmail} onChange={e=>setTrialEmail(e.target.value)} placeholder="Correo" className="rounded border p-2 disabled:bg-slate-100 sm:col-span-2"/><div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 sm:col-span-2">Pruebas activas: {activeTrialCount} / 5 · Incluye 5 facturas exportadas por cuenta.</div><button disabled={activeTrialCount >= 5 || isCreatingTrial} className="rounded bg-emerald-600 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400 sm:col-span-2">{activeTrialCount >= 5 ? "Límite de pruebas alcanzado" : isCreatingTrial ? "Enviando cuenta de prueba…" : "Enviar cuenta de prueba"}</button></form>
      {editingUser && <form onSubmit={saveUser} className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Editar usuario</h3><button type="button" onClick={()=>setEditingUser(null)} className="text-sm underline">Cancelar</button></div><p className="mt-1 text-sm text-slate-600">Actualiza el nombre, apellido o usuario. Si asignas una clave, el usuario tendrá que cambiarla obligatoriamente al entrar.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><input required minLength={3} value={editUsername} onChange={e=>setEditUsername(e.target.value.replace(/\s/g,""))} placeholder="Usuario" className="rounded border p-2"/><input required value={editFirstName} onChange={e=>setEditFirstName(e.target.value)} placeholder="Nombre" className="rounded border p-2"/><input required value={editLastName} onChange={e=>setEditLastName(e.target.value)} placeholder="Apellido" className="rounded border p-2"/><input minLength={8} type="password" value={editPassword} onChange={e=>setEditPassword(e.target.value)} placeholder="Nueva contraseña (opcional)" className="rounded border p-2"/></div><button className="mt-3 rounded bg-sky-600 px-3 py-2 font-semibold text-white">Guardar cambios</button></form>}
      {status && <p className="mt-3 text-sm text-violet-700">{status}</p>}
      {showAllUsers && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4"><section className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-bold">Todos los usuarios</h3><p className="text-sm text-slate-600">{profiles.length} usuario{profiles.length === 1 ? "" : "s"} creado{profiles.length === 1 ? "" : "s"}</p></div><button onClick={()=>setShowAllUsers(false)} className="rounded border px-3 py-2 text-sm">Cerrar</button></div><div className="mt-4 space-y-2">{profiles.map(profile=>{const company = Array.isArray(profile.companies) ? profile.companies[0] : profile.companies; const state = profile.role === "owner" ? "Súper administrador" : company?.name ? `Empresa: ${company.name}` : "Pendiente de asignar"; return <div key={profile.id} className="rounded-xl border p-3 text-sm"><b>{profile.username || "Sin usuario"}</b>{profile.full_name && <span> · {profile.full_name}</span>}<br/><span className={profile.role === "owner" ? "font-medium text-violet-700" : "text-slate-600"}>{state}</span></div>})}{profiles.length === 0 && <p className="text-sm text-slate-500">Aún no hay usuarios creados.</p>}</div></section></div>}
      <h3 className="mt-6 font-semibold">Súper administrador</h3><div className="mt-2 space-y-2">{profiles.filter(p=>p.role === "owner").map(p=><div key={p.id} className="flex flex-wrap items-center gap-2 rounded border border-violet-200 bg-violet-50 p-3 text-sm"><span className="min-w-40 flex-1"><b>{p.username || "Sin usuario"}</b>{p.full_name && <span> · {p.full_name}</span>}<br/><span className="font-medium text-violet-700">Acceso total al sistema</span></span><span className="rounded-full bg-violet-600 px-3 py-1 font-semibold text-white">Súper administrador</span></div>)}</div>
      <h3 className="mt-6 font-semibold">Cuentas pendientes</h3><div className="mt-2 space-y-2">{profiles.filter(p=>p.role === "client" && !p.company_id).map(p=><div key={p.id} className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm"><span className="min-w-40 flex-1"><b>{p.username || "Sin usuario"}</b>{p.full_name && <span> · {p.full_name}</span>}<br/><span className="text-slate-600">Pendiente de asignar a una empresa</span></span><select defaultValue="" onChange={e=>e.target.value && void assign(p.id,e.target.value)} className="rounded border p-1"><option value="">Activar en empresa…</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button onClick={()=>void deleteUser(p)} className="rounded bg-rose-600 px-3 py-2 font-semibold text-white">Eliminar</button></div>)}{profiles.filter(p=>p.role === "client" && !p.company_id).length === 0 && <p className="text-sm text-slate-500">No hay cuentas pendientes.</p>}</div>
      <h3 className="mt-6 font-semibold">Usuarios creados</h3><div className="mt-2 space-y-2">{profiles.filter(p=>p.role === "client" && p.company_id).map(p=>{const company = Array.isArray(p.companies) ? p.companies[0] : p.companies; return <div key={p.id} className="flex flex-wrap items-center gap-2 rounded border p-3 text-sm"><span className="min-w-40 flex-1"><b>{p.username || "Sin usuario"}</b>{p.full_name && <span> · {p.full_name}</span>}<br/><span className="text-slate-600">Empresa: {company?.name || "Sin empresa"}</span></span><select value={p.company_id ?? ""} onChange={e=>e.target.value && void moveUser(p, e.target.value)} className="rounded border p-2"><option value="">Empresa…</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button onClick={()=>openEditUser(p)} className="rounded bg-sky-600 px-3 py-2 font-semibold text-white">Editar</button><button onClick={()=>openEditUser(p)} className="rounded bg-amber-600 px-3 py-2 font-semibold text-white">Cambiar clave</button><button onClick={()=>void deleteUser(p)} className="rounded bg-rose-600 px-3 py-2 font-semibold text-white">Eliminar</button></div>})}{profiles.filter(p=>p.role === "client" && p.company_id).length === 0 && <p className="text-sm text-slate-500">Aún no hay usuarios asignados a una empresa.</p>}</div>
      </>}
      {activeSection === "empresas" && <><h3 className="mt-6 font-semibold">Empresas</h3><div className="mt-2 space-y-2">{companies.map(c=>{const usedThisMonth = usage.filter(u=>u.company_id === c.id && u.periodo === thisMonth).reduce((total, u)=>total + u.invoice_count, 0); const used = c.is_trial ? usage.filter(u=>u.company_id === c.id).reduce((total, u)=>total + u.invoice_count, 0) : usedThisMonth; const limit = c.is_trial ? c.trial_invoice_limit : c.monthly_invoice_limit; const limitText = limit === null ? "Sin límite" : c.is_trial ? `${used.toLocaleString("es-DO")} / ${limit.toLocaleString("es-DO")} facturas de prueba usadas` : `${used.toLocaleString("es-DO")} / ${limit.toLocaleString("es-DO")} facturas exportadas este mes`; const projectedCost = limit === null ? null : limit * COST_PER_INVOICE_USD; return <div key={c.id} className="flex flex-wrap items-center gap-2 rounded border p-3 text-sm"><span className="min-w-40 flex-1"><b>{c.name}</b><br/>{c.is_trial ? <span className="font-medium text-amber-700">Cuenta de prueba · sin vencimiento por fecha</span> : <>Vence: {new Intl.DateTimeFormat("es-DO", {dateStyle:"medium"}).format(new Date(c.license_expires_at))}</>}<br/><span className="text-slate-600">Límite: {limitText}</span><br/><span className="font-medium text-emerald-700">Facturado por exportación: {usd.format(used * COST_PER_INVOICE_USD)} ({used.toLocaleString("es-DO")} facturas)</span>{projectedCost !== null && <span className="text-slate-600"> · al límite: {usd.format(projectedCost)}</span>}</span><button onClick={()=>void editCompany(c)} className="rounded bg-sky-600 px-3 py-2 font-semibold text-white">Editar</button>{!c.is_trial && <button onClick={()=>void editMonthlyLimit(c)} className="rounded bg-violet-600 px-3 py-2 font-semibold text-white">Límite</button>}<button onClick={()=>void deleteCompany(c)} className="rounded bg-rose-600 px-3 py-2 font-semibold text-white">Eliminar</button>{c.is_trial ? <button onClick={()=>void convertTrial(c)} className="rounded bg-emerald-600 px-3 py-2 font-semibold text-white">Activar como cliente</button> : <button onClick={()=>void renew(c.id)} className="rounded bg-emerald-600 px-3 py-2 font-semibold text-white">Marcar pagado · 30 días</button>}</div>})}</div></>}
    </section></div>}
  </>;
}
