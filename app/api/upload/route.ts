import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Archivo demasiado grande (máx 25 MB)" }, { status: 413 });
    }

    const blob = await put(`uploads/${file.name}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type || "application/octet-stream",
    });

    // Build a proxy URL so the agent can fetch the private blob via our own route
    const origin = new URL(req.url).origin;
    const proxyUrl = `${origin}/api/invoice/${blob.pathname}`;

    return NextResponse.json({ url: proxyUrl, contentType: file.type, name: file.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
