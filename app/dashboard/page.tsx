import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Dashboard } from "@/app/components/Dashboard";

export default async function DashboardPage() {
  const { orgRole } = await auth();

  // Only org admins (Contadores) can see this page
  if (orgRole !== "org:admin") {
    redirect("/");
  }

  return <Dashboard />;
}
