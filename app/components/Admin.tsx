"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

/* ─── Types ─────────────────────────────────────────────── */
type Org = { id: string; name: string; membersCount: number; createdAt: number };
type Member = {
  id: string;
  role: string;
  createdAt: number;
  publicUserData: {
    userId: string;
    firstName: string | null;
    lastName: string | null;
    identifier: string;
    imageUrl: string;
  };
};
type Invitation = { id: string; emailAddress: string; role: string; status: string };

/* ─── Role helpers ───────────────────────────────────────── */
const ROLES: { value: string; label: string; color: string }[] = [
  { value: "org:admin", label: "Contador", color: "indigo" },
  { value: "org:member", label: "Digitador", color: "emerald" },
];

function RoleChip({ role, small }: { role: string; small?: boolean }) {
  const r = ROLES.find((x) => x.value === role) ?? { label: role, color: "slate" };
  const size = small ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  const colors: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
    slate: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  };
  return (
    <span className={`inline-block font-semibold rounded-full border ${size} ${colors[r.color] ?? colors.slate}`}>
      {r.label}
    </span>
  );
}

function Avatar({ member }: { member: Member }) {
  const name = [member.publicUserData.firstName, member.publicUserData.lastName].filter(Boolean).join(" ") || member.publicUserData.identifier;
  const initials = name.slice(0, 2).toUpperCase();
  return member.publicUserData.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={member.publicUserData.imageUrl} alt={name} className="h-8 w-8 rounded-full object-cover" />
  ) : (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
      {initials}
    </div>
  );
}

/* ─── Modal ──────────────────────────────────────────────── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-neutral-900 dark:ring-1 dark:ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4 dark:border-white/10">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{title}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────── */
export function AdminPanel() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("org:member");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  /* Fetch orgs */
  const loadOrgs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/orgs");
    if (!res.ok) { setError("No se pudo cargar la lista de empresas."); setLoading(false); return; }
    const data: Org[] = await res.json();
    setOrgs(data.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  }, []);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  /* Fetch members for selected org */
  const loadMembers = useCallback(async (orgId: string) => {
    setMembersLoading(true);
    const res = await fetch(`/api/admin/orgs/${orgId}/members`);
    if (!res.ok) { setMembersLoading(false); return; }
    const data: { memberships: Member[]; invitations: Invitation[] } = await res.json();
    setMembers(data.memberships.sort((a, b) => a.role.localeCompare(b.role)));
    setInvitations(data.invitations);
    setMembersLoading(false);
  }, []);

  useEffect(() => {
    if (selectedOrg) loadMembers(selectedOrg.id);
    else { setMembers([]); setInvitations([]); }
  }, [selectedOrg, loadMembers]);

  /* Create org */
  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const res = await fetch("/api/admin/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: orgName }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setFormError(data.error ?? "Error al crear la empresa"); return; }
    setOrgName("");
    setShowOrgModal(false);
    await loadOrgs();
  }

  /* Invite user */
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrg) return;
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);
    const res = await fetch(`/api/admin/orgs/${selectedOrg.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setFormError(data.error ?? "Error al invitar"); return; }
    const msg = data.type === "invitation"
      ? `Invitación enviada a ${inviteEmail}`
      : `${inviteEmail} agregado directamente`;
    setFormSuccess(msg);
    setInviteEmail("");
    setInviteRole("org:member");
    await loadMembers(selectedOrg.id);
    await loadOrgs();
    setTimeout(() => { setShowInviteModal(false); setFormSuccess(null); }, 1800);
  }

  /* Change role */
  async function handleRoleChange(userId: string, newRole: string) {
    if (!selectedOrg) return;
    await fetch(`/api/admin/orgs/${selectedOrg.id}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await loadMembers(selectedOrg.id);
  }

  /* Remove member */
  async function handleRemove(userId: string, name: string) {
    if (!selectedOrg) return;
    if (!confirm(`¿Eliminar a ${name} de la empresa?`)) return;
    await fetch(`/api/admin/orgs/${selectedOrg.id}/members/${userId}`, { method: "DELETE" });
    await loadMembers(selectedOrg.id);
    await loadOrgs();
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-50 dark:bg-neutral-950">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-black/5 bg-white px-5 py-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center">
            <Image src="/logo.png" alt="NALA" width={40} height={40} priority />
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Administración</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Empresas y usuarios</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="hidden rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-white/15 dark:text-neutral-300 sm:flex items-center gap-1.5">
            💬 Ir al Chat
          </Link>
          <UserButton />
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: org list */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-black/5 bg-white dark:border-white/10 dark:bg-neutral-900">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Empresas</span>
            <button
              onClick={() => { setShowOrgModal(true); setFormError(null); setOrgName(""); }}
              className="flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              + Nueva
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {loading && (
              <p className="px-4 py-3 text-xs text-neutral-400 animate-pulse">Cargando...</p>
            )}
            {error && (
              <p className="px-4 py-3 text-xs text-red-600">{error}</p>
            )}
            {!loading && orgs.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-neutral-400">
                Sin empresas todavía.<br />Crea una con el botón &quot;+ Nueva&quot;.
              </p>
            )}
            {orgs.map((org) => (
              <button
                key={org.id}
                onClick={() => setSelectedOrg(org)}
                className={
                  "w-full text-left px-4 py-3 flex flex-col gap-0.5 transition-colors " +
                  (selectedOrg?.id === org.id
                    ? "bg-indigo-50 dark:bg-indigo-950/40"
                    : "hover:bg-slate-50 dark:hover:bg-neutral-800/50")
                }
              >
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{org.name}</span>
                <span className="text-xs text-neutral-400">
                  {org.membersCount} {org.membersCount === 1 ? "miembro" : "miembros"}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Right: org detail */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {!selectedOrg ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center text-neutral-400">
                <div className="text-4xl mb-2">🏢</div>
                <p className="text-sm">Selecciona una empresa para ver sus usuarios</p>
              </div>
            </div>
          ) : (
            <>
              {/* Org header */}
              <div className="flex items-center justify-between border-b border-black/5 bg-white px-6 py-4 dark:border-white/10 dark:bg-neutral-900">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">{selectedOrg.name}</h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">ID: {selectedOrg.id}</p>
                </div>
                <button
                  onClick={() => { setShowInviteModal(true); setFormError(null); setFormSuccess(null); setInviteEmail(""); setInviteRole("org:member"); }}
                  className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
                >
                  + Invitar usuario
                </button>
              </div>

              {/* Members list */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {membersLoading && (
                  <p className="text-xs text-neutral-400 animate-pulse">Cargando miembros...</p>
                )}

                {!membersLoading && members.length === 0 && invitations.length === 0 && (
                  <div className="rounded-xl border border-dashed border-black/10 p-8 text-center dark:border-white/10">
                    <p className="text-3xl mb-2">👤</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Sin miembros todavía. Usa el botón &quot;+ Invitar usuario&quot;.
                    </p>
                  </div>
                )}

                {/* Active members */}
                {members.length > 0 && (
                  <div className="mb-6">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Miembros activos</p>
                    <div className="divide-y divide-black/5 rounded-xl border border-black/5 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-neutral-900">
                      {members.map((m) => {
                        const name = [m.publicUserData.firstName, m.publicUserData.lastName].filter(Boolean).join(" ") || "—";
                        const email = m.publicUserData.identifier;
                        return (
                          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                            <Avatar member={m} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{name}</span>
                                <RoleChip role={m.role} small />
                              </div>
                              <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate block">{email}</span>
                            </div>
                            {/* Role change */}
                            <select
                              value={m.role}
                              onChange={(e) => handleRoleChange(m.publicUserData.userId, e.target.value)}
                              className="shrink-0 rounded-lg border border-black/10 bg-slate-50 px-2 py-1 text-xs text-neutral-700 focus:outline-none dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-300"
                              title="Cambiar rol"
                            >
                              {ROLES.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleRemove(m.publicUserData.userId, name || email)}
                              className="shrink-0 rounded-lg border border-red-100 px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                              title="Eliminar de la empresa"
                            >
                              Eliminar
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pending invitations */}
                {invitations.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Invitaciones pendientes</p>
                    <div className="divide-y divide-black/5 rounded-xl border border-black/5 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-neutral-900">
                      {invitations.map((inv) => (
                        <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-sm dark:bg-amber-900/40">
                            ✉️
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-neutral-700 dark:text-neutral-300 truncate">{inv.emailAddress}</span>
                              <RoleChip role={inv.role} small />
                            </div>
                            <span className="text-xs text-amber-600 dark:text-amber-400">Invitación pendiente</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Modal: Nueva empresa */}
      {showOrgModal && (
        <Modal title="Nueva empresa" onClose={() => setShowOrgModal(false)}>
          <form onSubmit={handleCreateOrg} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Nombre de la empresa
              </label>
              <input
                autoFocus
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Ej. Save Consultores, S.R.L."
                className="w-full rounded-lg border border-black/10 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white dark:border-white/15 dark:bg-neutral-800 dark:focus:bg-neutral-800"
              />
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowOrgModal(false)} className="rounded-lg border border-black/10 px-4 py-2 text-sm text-neutral-600 hover:bg-slate-50 dark:border-white/15 dark:text-neutral-300">
                Cancelar
              </button>
              <button type="submit" disabled={!orgName.trim() || submitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {submitting ? "Creando..." : "Crear empresa"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Invitar usuario */}
      {showInviteModal && (
        <Modal title={`Invitar a ${selectedOrg?.name}`} onClose={() => setShowInviteModal(false)}>
          <form onSubmit={handleInvite} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Correo electrónico
              </label>
              <input
                autoFocus
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                className="w-full rounded-lg border border-black/10 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white dark:border-white/15 dark:bg-neutral-800"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Rol
              </label>
              <div className="flex gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setInviteRole(r.value)}
                    className={
                      "flex-1 rounded-lg border py-2 text-sm font-medium transition-colors " +
                      (inviteRole === r.value
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-black/10 text-neutral-600 hover:border-indigo-300 dark:border-white/15 dark:text-neutral-300")
                    }
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-neutral-400">
                {inviteRole === "org:admin"
                  ? "Contador: accede al chat y al dashboard de estadísticas."
                  : "Digitador: solo puede subir facturas en el chat."}
              </p>
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            {formSuccess && <p className="text-xs text-emerald-600">{formSuccess}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowInviteModal(false)} className="rounded-lg border border-black/10 px-4 py-2 text-sm text-neutral-600 hover:bg-slate-50 dark:border-white/15 dark:text-neutral-300">
                Cancelar
              </button>
              <button type="submit" disabled={!inviteEmail.trim() || submitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {submitting ? "Invitando..." : "Invitar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
