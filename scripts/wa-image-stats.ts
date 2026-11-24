// صور الواتساب النهارده (بتوقيت القاهرة): كام صورة ليها ملف مترفع في Blob وكام لأ، وبعد كام ثانية من الرسالة بيترفع.
// قراية بس من Postgres. التشغيل: npm run audit:wa-images (محتاج DATABASE_URL في .env.local، زي vercel env pull)
// Today's WhatsApp images (Cairo): how many have an uploaded file in Blob and how many don't, and the upload delay after
// the message. Read-only. Run: npm run audit:wa-images (needs DATABASE_URL in .env.local, e.g. from vercel env pull)

import { neon } from "@neondatabase/serverless";

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  Object.entries(process.env).find(([k, v]) => (k.endsWith("_DATABASE_URL") || k.endsWith("POSTGRES_URL")) && v)?.[1];
if (!url) {
  console.error("DATABASE_URL مش موجود في .env.local - DATABASE_URL is missing (run: vercel env pull .env.local)");
  process.exit(1);
}
const sql = neon(url);
const TODAY = `(m.at AT TIME ZONE 'Africa/Cairo')::date = (now() AT TIME ZONE 'Africa/Cairo')::date`;

async function main() {
const [s] = await sql.query(`
  SELECT count(*)::int AS total,
         count(md.id)::int AS uploaded,
         count(*) FILTER (WHERE m.media_id IS NOT NULL AND md.id IS NULL)::int AS media_id_not_uploaded,
         count(*) FILTER (WHERE m.media_id IS NULL)::int AS no_media_id
  FROM wa_messages m LEFT JOIN wa_media md ON md.id = m.media_id
  WHERE m.type = 'image' AND NOT m.deleted AND ${TODAY}`);
console.log("صور النهارده - today's image messages");
console.log(`  الإجمالي - total:                         ${s.total}`);
console.log(`  ليها ملف مترفع - with an uploaded file:   ${s.uploaded}`);
console.log(`  ليها media id ومش مترفعة - id, no file:  ${s.media_id_not_uploaded}`);
console.log(`  من غير media id خالص - no media id:      ${s.no_media_id}`);

const lag = await sql.query(`
  SELECT round(extract(epoch FROM (md.at - m.received_at)))::int AS lag
  FROM wa_messages m JOIN wa_media md ON md.id = m.media_id
  WHERE m.type = 'image' AND ${TODAY} ORDER BY m.at DESC LIMIT 20`);
if (lag.length) {
  const values = lag.map((r) => Number(r.lag));
  const sorted = [...values].sort((a, b) => a - b);
  console.log(`الملف اترفع بعد الرسالة بـ (ثانية، آخر ${values.length}) - upload delay after the message (s): ${values.join(", ")}`);
  console.log(`  الوسيط - median: ${sorted[Math.floor(sorted.length / 2)]}s, الأكبر - max: ${sorted[sorted.length - 1]}s`);
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
