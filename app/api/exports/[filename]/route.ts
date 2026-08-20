import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { EXPORTS_DIR } from "@/lib/dgii/store";

const CONTENT_TYPES: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain; charset=utf-8",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Solo un nombre de archivo simple, sin separadores de ruta (evita path traversal).
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return NextResponse.json({ error: "Nombre de archivo inválido" }, { status: 400 });
  }

  const filePath = path.join(EXPORTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const data = fs.readFileSync(filePath);

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
