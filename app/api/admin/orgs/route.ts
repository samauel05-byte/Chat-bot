import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "@/lib/adminAuth";

export async function GET() {
  try {
    await requireAdmin();
    const client = await clerkClient();
    const { data } = await client.organizations.getOrganizationList({ limit: 100 });
    return NextResponse.json(data);
  } catch {
    return forbidden();
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAdmin();
    const { name } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }
    const client = await clerkClient();
    const org = await client.organizations.createOrganization({
      name: name.trim(),
      createdBy: userId,
    });
    return NextResponse.json(org, { status: 201 });
  } catch (err) {
    if ((err as Error).message === "No autorizado") return forbidden();
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
