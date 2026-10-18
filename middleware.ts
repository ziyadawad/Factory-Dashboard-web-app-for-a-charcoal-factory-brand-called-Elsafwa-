import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  const sessionCookie = request.cookies.get("dashboard-session");

  // If no password is set, allow access (development mode)
  if (!password) {
    return NextResponse.next();
  }

  // Check if user is authenticated
  if (sessionCookie?.value === password) {
    return NextResponse.next();
  }

  // Redirect to login page if not authenticated
  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
