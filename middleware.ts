import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// أول قيمة من هيدر ممكن يبقى فيه كذا قيمة ورا بعض (proxy ورا proxy) - the first value of a possibly comma-separated header
function firstHeader(request: NextRequest, name: string): string {
  return (request.headers.get(name) ?? "").split(",")[0].trim();
}

// الرابط اللي المتصفح فاتحه فعلا (مثلا https://192.168.1.200:3443) من x-forwarded-host / x-forwarded-proto، وإلا
// هيدر Host. ممنوع request.url (ورا الـ proxy بيبقى localhost:3000) وممنوع أي رابط ثابت. لو مفيش host سليم = رابط نسبي
// The origin the browser really opened (e.g. https://192.168.1.200:3443), from x-forwarded-host / x-forwarded-proto,
// else the Host header. Never request.url (localhost:3000 behind the proxy) and never a hardcoded base URL.
// (Next middleware needs an absolute Location; a relative one throws "Invalid URL".)
// host[:port] بس (مفيش / ولا @ ولا مسافات) - host[:port] only (no /, @ or spaces)
const VALID_HOST = /^[A-Za-z0-9.\-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$/;
function publicUrl(request: NextRequest, path: string): string {
  const host = [firstHeader(request, "x-forwarded-host"), firstHeader(request, "host")].find((h) => VALID_HOST.test(h));
  // مفيش ولا host سليم (مستحيل تقريبا في HTTP/1.1) - no valid host at all (practically impossible over HTTP/1.1)
  if (!host) return new URL(path, request.url).toString();
  const forwardedProto = firstHeader(request, "x-forwarded-proto").toLowerCase();
  const proto = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}${path}`;
}

function redirectTo(request: NextRequest, path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: publicUrl(request, path) } });
}

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

  // Redirect to login page if not authenticated (on the host the browser used, not the internal one)
  return redirectTo(request, "/login");
}

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
