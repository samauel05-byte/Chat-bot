import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AdminPanel } from "@/app/components/Admin";

export default async function AdminPage() {
  const { userId } = await auth();
  const adminId = process.env.ADMIN_USER_ID;

  // If ADMIN_USER_ID is set, enforce it. Otherwise any authenticated user can access (dev mode).
  if (!userId || (adminId && userId !== adminId)) {
    redirect("/");
  }

  return <AdminPanel />;
}
