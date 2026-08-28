import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { password } = await request.json() as { password?: string };
  if (!password || password.length < 8) {
    return Response.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
  }

  const sessionClient = await createClient();
  let { data: { user } } = await sessionClient.auth.getUser();

  // El token del navegador permite conservar el cambio de clave incluso si el
  // navegador todavía no sincronizó la cookie de sesión con el servidor.
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!user && accessToken) {
    const auth = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    ({ data: { user } } = await auth.auth.getUser(accessToken));
  }
  if (!user) return Response.json({ error: "Tu sesión expiró. Entra de nuevo e inténtalo." }, { status: 401 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) {
    console.error("[account/password] password update failed", { userId: user.id, message: error.message });
    return Response.json({ error: "No se pudo guardar la contraseña. Intenta nuevamente." }, { status: 400 });
  }

  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
