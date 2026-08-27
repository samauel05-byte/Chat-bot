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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <LoginForm />;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id, username, full_name, companies(name, license_expires_at, license_status)")
    .eq("id", user.id)
    .maybeSingle();

  const company = Array.isArray(profile?.companies) ? profile.companies[0] : profile?.companies;
  if (profile?.role !== "owner" && !company) {
    return <LicenseBlock reason="Tu cuenta fue creada y está pendiente de activación por el administrador." />;
  }

  const expiresAt = company?.license_expires_at;
  const currentTime = new Date().getTime();
  const millisecondsRemaining = expiresAt ? new Date(expiresAt).getTime() - currentTime : null;
  const isExpired = Boolean(
    company && (company.license_status !== "active" || (millisecondsRemaining ?? 0) <= 0)
  );
  if (isExpired) return <LicenseBlock expiresAt={expiresAt} />;

  const hasExpiringLicense = Boolean(
    millisecondsRemaining !== null && millisecondsRemaining <= 5 * 86_400_000
  );
  const daysRemaining = millisecondsRemaining === null ? 0 : Math.max(0, Math.ceil(millisecondsRemaining / 86_400_000));

  return (
    <>
      {hasExpiringLicense && <LicenseNotice expiresAt={expiresAt!} days={daysRemaining} />}
      <NalaWorkspace
        isOwner={profile?.role === "owner"}
        quotaContext={createQuotaContext(profile?.company_id ?? null)}
        accountName={profile?.full_name || profile?.username || user.email || "Mi cuenta"}
      />
    </>
  );
}
