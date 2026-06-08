import { redirect as nav } from "next/navigation";

import { getSessionUser } from "@/lib/supabase/queries";
import { LoginForm } from "./_components/LoginForm";

/** Only allow internal redirect targets — reject absolute URLs, protocol-
 *  relative `//`, and backslashes (browsers normalize `/\evil.com` → `//evil`,
 *  an open redirect) — so the client-side router can't be sent off-site. */
function safeRedirect(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/";
  }
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const next = safeRedirect(redirect);

  // Already signed in → skip the form.
  const user = await getSessionUser().catch(() => null);
  if (user) nav(next);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background-light px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center font-handwritten text-4xl text-accent-deep">
          Story Ranger
        </h1>
        <p className="mb-6 text-center text-sm text-ink-soft">
          Sign in to save your adventure across devices.
        </p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
