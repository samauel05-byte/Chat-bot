import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_.-]{3,40}$/.test(value);
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
  const trialDays = typeof body.trialDays === "number" ? body.trialDays : Number(body.trialDays);
  const invoiceLimit = typeof body.invoiceLimit === "number" ? body.invoiceLimit : Number(body.invoiceLimit);

  if (companyName.length < 2 || fullName.length < 2 || !isValidUsername(username) || !email.includes("@") || !Number.isInteger(trialDays) || trialDays < 1 || trialDays > 30 || !Number.isInteger(invoiceLimit) || invoiceLimit < 1) {
    return Response.json({ error: "Verifica los datos de la cuenta de prueba." }, { status: 400 });
  }

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: duplicate } = await admin.from("profiles").select("id").ilike("username", username).maybeSingle();
  if (duplicate) return Response.json({ error: "Ese usuario ya está en uso." }, { status: 400 });

  const licenseExpiresAt = new Date(Date.now() + trialDays * 86_400_000).toISOString();
  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert({ name: `Prueba · ${companyName}`, license_status: "active", license_expires_at: licenseExpiresAt, monthly_invoice_limit: invoiceLimit })
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
    return Response.json({ error: "No se pudo enviar la invitación. El correo quizá ya tiene una cuenta." }, { status: 400 });
  }

  const { error: profileError } = await admin.from("profiles").update({ company_id: company.id, must_change_password: true }).eq("id", invited.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    await admin.from("companies").delete().eq("id", company.id);
    return Response.json({ error: "No se pudo activar la cuenta de prueba." }, { status: 500 });
  }

  return Response.json({ ok: true, expiresAt: licenseExpiresAt });
}
