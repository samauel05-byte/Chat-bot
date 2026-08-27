export function LicenseNotice({ expiresAt, days }: { expiresAt: string; days: number }) {
  const date = new Intl.DateTimeFormat("es-DO", { dateStyle: "long" }).format(new Date(expiresAt));
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[60] border-b border-amber-300/30 bg-amber-400 px-4 py-3 text-center text-sm font-semibold text-amber-950 shadow-lg">
      Tu licencia vence {days === 0 ? "hoy" : `en ${days} día${days === 1 ? "" : "s"}`} ({date}). Contacta a tu administrador para renovarla.
    </div>
  );
}
