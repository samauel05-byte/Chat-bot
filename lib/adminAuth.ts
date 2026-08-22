import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function requireAdmin(): Promise<{ userId: string }> {
  const { userId } = await auth();
  const adminId = process.env.ADMIN_USER_ID;

  if (!userId || (adminId && userId !== adminId)) {
    throw new Error("No autorizado");
  }

  return { userId };
}

export function forbidden() {
  return NextResponse.json({ error: "No autorizado" }, { status: 403 });
}
