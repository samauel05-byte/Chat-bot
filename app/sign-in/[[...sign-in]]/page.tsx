import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 dark:bg-neutral-950">
      <SignIn />
    </main>
  );
}
