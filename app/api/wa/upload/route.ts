import { NextRequest, NextResponse } from "next/server";
import { NO_STORE } from "@/lib/api-auth";
import { saveMedia } from "@/lib/wa-store";
import { agentAuthError, waErrorResponse } from "@/lib/wa-http";
import { dashboardConfig } from "@/config/dashboard.config";

export const dynamic = "force-dynamic";
// مفيش كاش خالص: لا Next ولا CDN ولا المتصفح، فالصفحة والإيجنت شايفين نفس الـ Postgres دايما
// No cache at all (Next, CDN or browser): the page and the agent always see the same Postgres
export const fetchCache = "force-no-store";
export const revalidate = 0;

// ملف (صورة / فويس / PDF ...): الـ body = الملف نفسه، والهيدرز x-media-id و Content-Type و x-file-name (encodeURIComponent)
// A file (image / voice / PDF ...): the body is the raw file; headers x-media-id, Content-Type, x-file-name (URI-encoded)
export async function POST(request: NextRequest) {
  const denied = agentAuthError(request);
  if (denied) return denied;
  const maxMB = dashboardConfig.whatsapp.maxUploadMB;
  if (Number(request.headers.get("content-length") ?? 0) > maxMB * 1024 * 1024) {
    return NextResponse.json({ error: `file too large: at most ${maxMB} MB` }, { status: 413, headers: NO_STORE });
  }
  try {
    let fileName: string | null = null;
    try {
      fileName = decodeURIComponent(request.headers.get("x-file-name") ?? "").slice(0, 200) || null;
    } catch {
      fileName = null;
    }
    const saved = await saveMedia({
      id: request.headers.get("x-media-id") ?? "",
      body: await request.arrayBuffer(),
      mime: (request.headers.get("content-type") ?? "").split(";")[0].trim(),
      fileName,
    });
    return NextResponse.json({ ok: true, ...saved }, { headers: NO_STORE });
  } catch (error) {
    return waErrorResponse(error, "upload");
  }
}
