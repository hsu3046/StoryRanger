import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 Proxy (formerly Middleware). Refreshes the Supabase session on
 * every app request and enforces login-required on the home + play routes.
 *
 * Per the Next docs, Proxy is for OPTIMISTIC checks only — the authoritative
 * gate still lives in Server Components (admin layout reads the role). Here we
 * just bounce logged-out visitors to /login before they reach a protected page.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  // Safety valve: if Supabase isn't configured yet (no env), don't gate — a
  // half-deployed instance should still render rather than redirect-loop into a
  // /login page that can't construct a client. Gating activates once env is set.
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!configured) return NextResponse.next({ request });

  const { user, response } = await updateSession(request);

  const { pathname, search } = request.nextUrl;
  const isProtected = pathname === "/" || pathname.startsWith("/play");

  if (!user && isProtected) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname + search);
    const redirect = NextResponse.redirect(loginUrl);
    // Carry any session cookies refreshed above onto the redirect response.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  // Run on everything EXCEPT api routes, Next internals, the auth pages
  // themselves, and same-origin static files (icons/manifest/media). Game media
  // is served cross-origin from R2, so it never hits the proxy anyway.
  matcher: [
    "/((?!api|_next/static|_next/image|login|auth|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|json|txt|xml|woff2?)).*)",
  ],
};
