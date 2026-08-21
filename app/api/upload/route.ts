import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Archivo demasiado grande (máx 25 MB)" }, { status: 413 });
  }

  const blob = await put(`uploads/${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type || "application/octet-stream",
  });

  return NextResponse.json({ url: blob.url, contentType: file.type, name: file.name });
}
