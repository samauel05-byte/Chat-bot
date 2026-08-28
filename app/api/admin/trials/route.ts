import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_.-]{3,40}$/.test(value);
}

function invitationErrorMessage(message?: string) {
  const normalized = message?.toLowerCase() ?? "";
  if (normalized.includes("rate limit") || normalized.includes("over_email_send_rate_limit")) {
    return "El servicio de correo alcanzó su límite temporal. No se creó ninguna cuenta. Espera antes de reenviar o configura SMTP propio en Supabase para enviar invitaciones sin este límite.";
  }
  if (normalized.includes("already") || normalized.includes("exists") || normalized.includes("registered")) {
    return "Este correo ya tiene una cuenta registrada. Usa otro correo o revisa los usuarios creados.";
  }
  return "No se pudo enviar la invitación. No se creó ninguna cuenta; inténtalo nuevamente.";
}

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { data: owner } = await sessionClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (owner?.role !== "owner") return Response.json({ error: "No autorizado" }, { status: 403 });

  const body = await request.json() as Record<string, unknown>;
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  if (companyName.length < 2 || fullName.length < 2 || !isValidUsername(username) || !email.includes("@")) {
    return Response.json({ error: "Verifica los datos de la cuenta de prueba." }, { status: 400 });
  }

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { count: activeTrialCount, error: trialCountError } = await admin
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("is_trial", true);
  if (trialCountError) return Response.json({ error: "No se pudo validar las cuentas de prueba." }, { status: 500 });
  if ((activeTrialCount ?? 0) >= 5) {
    return Response.json({ error: "Ya tienes las 5 cuentas de prueba activas. Convierte o elimina una para crear otra." }, { status: 400 });
  }

  const { data: duplicate } = await admin.from("profiles").select("id").ilike("username", username).maybeSingle();
  if (duplicate) return Response.json({ error: "Ese usuario ya está en uso." }, { status: 400 });

  // La prueba no vence por fecha: se bloquea de forma permanente al completar
  // cinco facturas exportadas, hasta que el administrador la convierta a plan normal.
  const licenseExpiresAt = new Date(Date.now() + 20 * 365 * 86_400_000).toISOString();
  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert({ name: `Prueba · ${companyName}`, license_status: "active", license_expires_at: licenseExpiresAt, is_trial: true, trial_invoice_limit: 5, monthly_invoice_limit: null })
    .select("id")
    .single();
  if (companyError || !company) return Response.json({ error: "No se pudo preparar la cuenta de prueba." }, { status: 500 });

  const activationUrl = new URL("/activate", request.url).toString();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: activationUrl,
    data: { username, full_name: fullName },
  });
  if (inviteError || !invited.user) {
    await admin.from("companies").delete().eq("id", company.id);
    console.error("[trial invitation]", { email, message: inviteError?.message ?? "missing invited user" });
    return Response.json({ error: invitationErrorMessage(inviteError?.message) }, { status: 429 });
  }

  const { error: profileError } = await admin.from("profiles").update({ company_id: company.id, must_change_password: true }).eq("id", invited.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    await admin.from("companies").delete().eq("id", company.id);
    return Response.json({ error: "No se pudo activar la cuenta de prueba." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
