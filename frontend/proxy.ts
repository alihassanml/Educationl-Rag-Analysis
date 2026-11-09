import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cheap redirect only: the backend is the real authority and re-checks every request.
const SESSION_COOKIE = "access_token";
const AUTH_PAGES = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (!hasSession && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (hasSession && isAuthPage && !request.nextUrl.searchParams.has("expired")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
