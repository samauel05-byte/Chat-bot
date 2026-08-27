import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const { identifier, password } = await request.json() as { identifier?: string; password?: string };
  if (!identifier?.trim() || !password) return Response.json({ error: "Datos incompletos" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const secretKey = process.env.SUPABASE_SECRET_KEY!;
  const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = identifier.includes("@")
    ? identifier.trim().toLowerCase()
    : (await admin.from("profiles").select("id").ilike("username", identifier.trim()).maybeSingle()).data?.id;

  let resolvedEmail = identifier.trim().toLowerCase();
  if (!identifier.includes("@")) {
    if (!email) return Response.json({ error: "Acceso inválido" }, { status: 401 });
    const { data } = await admin.auth.admin.getUserById(email);
    resolvedEmail = data.user?.email ?? "";
  }

  const auth = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email: resolvedEmail, password });
  if (error || !data.session) return Response.json({ error: "Acceso inválido" }, { status: 401 });
  return Response.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }, { headers: { "Cache-Control": "no-store" } });
}
