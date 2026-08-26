import { get } from "@vercel/blob";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { EXPORTS_PREFIX } from "@/lib/dgii/store";

const CONTENT_TYPES: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain; charset=utf-8",
};

function downloadFilename(filename: string): string {
  // El Blob conserva un sufijo único para evitar sobreescrituras, pero ese
  // detalle técnico no debe aparecer en el archivo que recibe el cliente.
  return filename.replace(/^(ModeloExcel_\d{6})_[a-f0-9]{12}(\.xlsx)$/i, "$1$2");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Solo un nombre de archivo simple, sin separadores de ruta (evita path traversal).
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return NextResponse.json({ error: "Nombre de archivo inválido" }, { status: 400 });
  }

  const result = await get(`${EXPORTS_PREFIX}${filename}`, { access: "private" });
  if (!result || !result.stream) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const displayFilename = downloadFilename(filename);

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${displayFilename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
