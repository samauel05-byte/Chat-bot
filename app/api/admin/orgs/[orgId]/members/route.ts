import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "@/lib/adminAuth";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { orgId } = await params;
    const client = await clerkClient();

    const [{ data: memberships }, { data: invitations }] = await Promise.all([
      client.organizations.getOrganizationMembershipList({ organizationId: orgId, limit: 100 }),
      client.organizations.getOrganizationInvitationList({ organizationId: orgId, status: ["pending"], limit: 100 }),
    ]);

    return NextResponse.json({ memberships, invitations });
  } catch {
    return forbidden();
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { userId: adminUserId } = await requireAdmin();
    const { orgId } = await params;
    const { email, role } = await req.json();

    if (!email?.trim() || !role) {
      return NextResponse.json({ error: "Email y rol son obligatorios" }, { status: 400 });
    }

    const client = await clerkClient();

    // Check if user already exists in Clerk
    const { data: existing } = await client.users.getUserList({
      emailAddress: [email.trim().toLowerCase()],
    });

    if (existing.length > 0) {
      // User exists — add directly to org
      const membership = await client.organizations.createOrganizationMembership({
        organizationId: orgId,
        userId: existing[0].id,
        role,
      });
      return NextResponse.json({ type: "membership", data: membership }, { status: 201 });
    }

    // User doesn't exist — send email invitation
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const invitation = await client.organizations.createOrganizationInvitation({
      organizationId: orgId,
      emailAddress: email.trim().toLowerCase(),
      role,
      inviterUserId: adminUserId,
      redirectUrl: `${appUrl}/sign-in`,
    });
    return NextResponse.json({ type: "invitation", data: invitation }, { status: 201 });
  } catch (err) {
    if ((err as Error).message === "No autorizado") return forbidden();
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
