import { LicenseBlock } from "@/app/components/LicenseBlock";
import { LicenseNotice } from "@/app/components/LicenseNotice";
import { LoginForm } from "@/app/components/LoginForm";
import { NalaWorkspace } from "@/app/components/NalaWorkspace";
import { createClient } from "@/lib/supabase/server";
import { createQuotaContext } from "@/lib/quota-context";

export const dynamic = "force-dynamic";

function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export default async function Home() {
  if (!isConfigured()) {
    return <LicenseBlock reason="NALA está terminando su configuración segura. Intenta de nuevo en unos minutos." />;
  }

  const supabase = await createClient();
  // `proxy.ts` ya valida y refresca la sesión mediante getClaims. Repetir
  // getUser aquí agrega otra llamada de red antes de mostrar la aplicación.
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (!userId) return <LoginForm />;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id, username, full_name, must_change_password, companies(name, license_expires_at, license_status, is_trial)")
    .eq("id", userId)
    .maybeSingle();

  const company = Array.isArray(profile?.companies) ? profile.companies[0] : profile?.companies;
  if (profile?.role !== "owner" && !company) {
    return <LicenseBlock reason="Tu cuenta fue creada y está pendiente de activación por el administrador." />;
  }

  const expiresAt = company?.license_expires_at;
  const currentTime = new Date().getTime();
  const millisecondsRemaining = expiresAt ? new Date(expiresAt).getTime() - currentTime : null;
  const isExpired = Boolean(
    company && (company.license_status !== "active" || (!company.is_trial && (millisecondsRemaining ?? 0) <= 0))
  );
  if (isExpired) return <LicenseBlock expiresAt={expiresAt} />;

  const hasExpiringLicense = Boolean(
    !company?.is_trial && millisecondsRemaining !== null && millisecondsRemaining <= 5 * 86_400_000
  );
  const daysRemaining = millisecondsRemaining === null ? 0 : Math.max(0, Math.ceil(millisecondsRemaining / 86_400_000));

  return (
    <>
      {hasExpiringLicense && <LicenseNotice expiresAt={expiresAt!} days={daysRemaining} />}
      <NalaWorkspace
        isOwner={profile?.role === "owner"}
        quotaContext={createQuotaContext(profile?.company_id ?? null)}
        accountName={profile?.full_name || profile?.username || claims?.claims?.email || "Mi cuenta"}
        mustChangePassword={profile?.role !== "owner" && Boolean(profile?.must_change_password)}
      />
    </>
  );
}
