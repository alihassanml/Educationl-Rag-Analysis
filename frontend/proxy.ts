import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cheap redirect only: the backend is the real authority and re-checks every request.
const SESSION_COOKIE = "access_token";
const AUTH_PAGES = ["/login", "/register"];
// Public pages: the landing page for everyone, and the component gallery in development only
const PUBLIC_PAGES = ["/", ...(process.env.NODE_ENV === "production" ? [] : ["/dev/design"])];

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;
  const isAuthPage = AUTH_PAGES.includes(pathname);
  const isPublicPage = PUBLIC_PAGES.includes(pathname);

  if (!hasSession && !isAuthPage && !isPublicPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (hasSession && isAuthPage && !request.nextUrl.searchParams.has("expired")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|landing/).*)"],
};
