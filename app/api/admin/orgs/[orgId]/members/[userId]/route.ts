import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "@/lib/adminAuth";

type Params = { params: Promise<{ orgId: string; userId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { orgId, userId } = await params;
    const { role } = await req.json();
    const client = await clerkClient();
    const result = await client.organizations.updateOrganizationMembership({
      organizationId: orgId,
      userId,
      role,
    });
    return NextResponse.json(result);
  } catch (err) {
    if ((err as Error).message === "No autorizado") return forbidden();
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { orgId, userId } = await params;
    const client = await clerkClient();
    await client.organizations.deleteOrganizationMembership({ organizationId: orgId, userId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if ((err as Error).message === "No autorizado") return forbidden();
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
