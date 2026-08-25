import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        // La carga va directo del navegador a Vercel Blob. 500 MB cubre
        // expedientes grandes sin abrir cargas ilimitadas ni costos imprevistos.
        maximumSizeInBytes: 500 * 1024 * 1024,
        addRandomSuffix: true,
        allowedContentTypes: [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "image/heic",
          "image/heif",
          "application/pdf",
        ],
      }),
      onUploadCompleted: async () => {
        // nothing required — client builds the proxy URL from blob.pathname
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload] error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
