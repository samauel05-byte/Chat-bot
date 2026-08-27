import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ userId: string }> };
type ClientProfile = {
  id: string;
  role: "client" | "owner";
  username: string | null;
  full_name: string | null;
  company_id: string | null;
};

function makeAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
type AdminClient = ReturnType<typeof makeAdminClient>;

function isValidUserId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_.-]{3,40}$/.test(value);
}

async function getOwnerAndAdmin() {
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return { error: Response.json({ error: "No autorizado" }, { status: 401 }) };

  const { data: owner } = await sessionClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (owner?.role !== "owner") return { error: Response.json({ error: "No autorizado" }, { status: 403 }) };

  const admin = makeAdminClient();
  return { admin, ownerId: user.id };
}

async function getClientProfile(admin: AdminClient, userId: string, ownerId: string) {
  if (!isValidUserId(userId) || userId === ownerId) return null;
  const { data } = await admin
    .from("profiles")
    .select("id, role, username, full_name, company_id")
    .eq("id", userId)
    .maybeSingle();
  const profile = data as ClientProfile | null;
  return profile?.role === "client" ? profile : null;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const access = await getOwnerAndAdmin();
  if ("error" in access) return access.error;
  const { userId } = await params;
  const profile = await getClientProfile(access.admin, userId, access.ownerId);
  if (!profile) return Response.json({ error: "Usuario no encontrado o protegido." }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : profile.username ?? "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : profile.full_name ?? "";
  const companyId = typeof body.companyId === "string" ? body.companyId : profile.company_id;
  const password = typeof body.password === "string" ? body.password : "";

  if (!isValidUsername(username) || !companyId || !isValidUserId(companyId) || (password && password.length < 8)) {
    return Response.json({ error: "Verifica usuario, empresa y contraseña." }, { status: 400 });
  }

  const { data: duplicate } = await access.admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .neq("id", userId)
    .maybeSingle();
  if (duplicate) return Response.json({ error: "Ese usuario ya está en uso." }, { status: 400 });

  const { data: authUser, error: authLookupError } = await access.admin.auth.admin.getUserById(userId);
  if (authLookupError || !authUser.user) return Response.json({ error: "No se encontró la cuenta de acceso." }, { status: 404 });

  const { error: authError } = await access.admin.auth.admin.updateUserById(userId, {
    ...(password ? { password } : {}),
    user_metadata: { ...authUser.user.user_metadata, username, full_name: fullName },
  });
  if (authError) return Response.json({ error: "No se pudo actualizar la cuenta." }, { status: 400 });

  const { error: profileError } = await access.admin
    .from("profiles")
    .update({ username, full_name: fullName || null, company_id: companyId })
    .eq("id", userId);
  if (profileError) return Response.json({ error: "La cuenta se actualizó, pero no se pudo guardar su perfil." }, { status: 500 });

  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const access = await getOwnerAndAdmin();
  if ("error" in access) return access.error;
  const { userId } = await params;
  const profile = await getClientProfile(access.admin, userId, access.ownerId);
  if (!profile) return Response.json({ error: "Usuario no encontrado o protegido." }, { status: 404 });

  const { error } = await access.admin.auth.admin.deleteUser(userId);
  if (error) return Response.json({ error: "No se pudo eliminar el usuario." }, { status: 400 });
  return Response.json({ ok: true });
}
