import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getOrgMonthlyStats } from "@/lib/dgii/store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId: sessionOrgId } = await auth();
  const { orgId } = await params;

  if (orgId !== sessionOrgId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const stats = await getOrgMonthlyStats(orgId);
  return NextResponse.json(stats);
}
