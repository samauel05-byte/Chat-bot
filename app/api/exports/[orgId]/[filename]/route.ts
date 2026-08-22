import { auth } from "@clerk/nextjs/server";
import { get } from "@vercel/blob";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { exportPathname } from "@/lib/dgii/generateReport";

const CONTENT_TYPES: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain; charset=utf-8",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; filename: string }> }
) {
  const { orgId: sessionOrgId } = await auth();

  const { orgId, filename } = await params;

  // Only the org that owns the file (or an individual user) can download it.
  if (orgId !== sessionOrgId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return NextResponse.json({ error: "Nombre de archivo inválido" }, { status: 400 });
  }

  const ext = path.extname(filename).toLowerCase() as "xlsx" | "txt";
  const match = filename.match(/^(606|607)_(\d{6})\.(xlsx|txt)$/);
  if (!match) {
    return NextResponse.json({ error: "Nombre de archivo inválido" }, { status: 400 });
  }

  const tipo = match[1] as "606" | "607";
  const periodo = match[2];
  const blobPath = exportPathname(orgId, tipo, periodo, ext.replace(".", "") as "xlsx" | "txt");

  const result = await get(blobPath, { access: "private" });
  if (!result || !result.stream) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
