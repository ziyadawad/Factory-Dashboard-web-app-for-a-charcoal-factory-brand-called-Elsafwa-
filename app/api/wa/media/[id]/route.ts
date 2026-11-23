import { NextRequest, NextResponse } from "next/server";
import { NO_STORE, salaryAuthError } from "@/lib/api-auth";
import { openMedia } from "@/lib/wa-store";
import { waErrorResponse } from "@/lib/wa-http";

export const dynamic = "force-dynamic";
// مفيش كاش خالص: لا Next ولا CDN ولا المتصفح، فالصفحة والإيجنت شايفين نفس الـ Postgres دايما
// No cache at all (Next, CDN or browser): the page and the agent always see the same Postgres
export const fetchCache = "force-no-store";
export const revalidate = 0;

// ملف من الواتساب (للداشبورد بعد الدخول بس): الـ Blob private والسيرفر هو اللي بيقراه ويبعته. ?download=1 = تحميل
// A WhatsApp file (dashboard login only): the Blob is private and the server streams it. ?download=1 = download
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = salaryAuthError(request);
  if (denied) return denied;
  try {
    const file = await openMedia(params.id);
    if (!file) return NextResponse.json({ error: "الملف مش موجود أو اتمسح" }, { status: 404, headers: NO_STORE });
    const name = file.fileName ?? params.id;
    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(file.stream, {
      headers: {
        "Content-Type": file.mime,
        ...(file.size ? { "Content-Length": String(file.size) } : {}),
        "Content-Disposition": `${disposition}; filename="file"; filename*=UTF-8''${encodeURIComponent(name)}`,
        // المتصفح بس يحتفظ بيه (مش الـ CDN) - kept by the browser only, never a shared cache
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return waErrorResponse(error, "media");
  }
}
