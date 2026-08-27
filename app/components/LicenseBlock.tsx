export function LicenseBlock({ expiresAt, reason }: { expiresAt?: string; reason?: string }) {
  const expires = expiresAt ? new Intl.DateTimeFormat("es-DO", { dateStyle: "long" }).format(new Date(expiresAt)) : null;
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-950 p-5 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-amber-300/20 bg-amber-400/10 p-8 text-center shadow-2xl">
        <p className="text-3xl">🔒</p>
        <h1 className="mt-4 text-2xl font-semibold">Tu licencia requiere renovación</h1>
        <p className="mt-3 text-slate-200">{reason ?? "El acceso a NALA se habilitará cuando el administrador confirme el pago."}</p>
        {expires && <p className="mt-4 text-sm text-amber-200">Vencimiento: {expires}</p>}
      </section>
    </main>
  );
}
