import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { data: owner } = await sessionClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (owner?.role !== "owner") return Response.json({ error: "No autorizado" }, { status: 403 });

  const { username, email, companyId, fullName } = await request.json() as Record<string, string>;
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username ?? "") || !email?.includes("@") || !companyId || (fullName?.trim().length ?? 0) < 2) {
    return Response.json({ error: "Verifica nombre, apellido, usuario, correo y empresa." }, { status: 400 });
  }

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const activationUrl = new URL("/activate", request.url).toString();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), {
    redirectTo: activationUrl,
    data: { username: username.trim().toLowerCase(), full_name: fullName?.trim() ?? "" },
  });
  if (error || !data.user) return Response.json({ error: "No se pudo enviar la invitación. El usuario o correo quizá ya existe." }, { status: 400 });
  const { error: profileError } = await admin.from("profiles").update({ company_id: companyId }).eq("id", data.user.id);
  if (profileError) return Response.json({ error: "La invitación fue enviada, pero no pudo asignarse a la empresa." }, { status: 500 });
  return Response.json({ ok: true });
}
