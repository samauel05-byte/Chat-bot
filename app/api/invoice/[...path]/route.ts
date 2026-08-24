import { get } from "@vercel/blob";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params;
  const pathname = pathParts.join("/");

  if (
    !pathname.startsWith("uploads/") ||
    pathParts.some((part) => !part || part === "." || part === ".." || part.includes("\\"))
  ) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || !result.stream) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = path.extname(pathname).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
