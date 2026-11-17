// صدقات الخزنة اللي بتتسجل لوحدها (Server Scripts في ERPNext) + الصدقات المتسجلة مرتين — قراية بس
// Treasury charity recorded automatically by ERPNext Server Scripts + charity recorded twice — read-only
// نفس قواعد السكربتات بالظبط (reports/erpnext-scripts/charity-auto.md) - the exact same rules as the scripts
import { dashboardConfig } from "@/config/dashboard.config";
import { erpDocUrl, erpGet, erpPost } from "./erp";
import { CharityDuplicatePair, CharitySource, UnfundedCharity } from "./types";

// ===== الصندوق من كلام المستند - the fund from the voucher text =====

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

// توحيد الكلام: من غير HTML، أ/إ/آ = ا، ة = ه، ى = ي، من غير تشكيل، أرقام إنجليزي، مسافة واحدة،
// ومن غير مسافة قبل الرقم ("خارجيه 1" = "خارجيه1")
// Normalize: no HTML, Arabic letter variants unified, no tashkeel, English digits, single spaces, no space before a digit
export function fundText(text: string | null | undefined): string {
  let t = String(text ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
  t = t.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))).replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
  t = t
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ً-ْـ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.replace(/ (?=\d)/g, "");
}

// الصناديق اللي كلامها موجود (واحد بس = يتسجل، صفر أو أكتر = مش بيتسجل) - funds whose words appear
export function detectFunds(text: string): string[] {
  const t = fundText(text);
  const found: string[] = [];
  for (const [fund, words] of Object.entries(dashboardConfig.erp.charity.auto.fundWords)) {
    if (words.some((w) => {
      const word = fundText(w);
      if (!word) return false;
      // "خارجيه1" مش "خارجيه12" - a trailing digit must not continue into another number
      let at = t.indexOf(word);
      while (at >= 0) {
        const next = t[at + word.length] ?? "";
        if (!(/\d$/.test(word) && /\d/.test(next))) return true;
        at = t.indexOf(word, at + 1);
      }
      return false;
    })) found.push(fund);
  }
  return found;
}

// ===== Charity Transaction: الحقول المخصوصة (source_voucher أو custom_source_voucher) =====

type SourceFields = { type: string | null; voucher: string | null };
let sourceFieldsCache: { at: number; value: SourceFields } | null = null;

// أسامي الحقلين في ERPNext (لو اتعملوا) - the two custom fields' real names, if they exist (10 min cache)
async function sourceFields(): Promise<SourceFields> {
  if (sourceFieldsCache && Date.now() - sourceFieldsCache.at < 10 * 60_000) return sourceFieldsCache.value;
  const { doctype } = dashboardConfig.erp.charity;
  let names = new Set<string>();
  try {
    const meta = await erpGet<{ docs: { fields: { fieldname: string }[] }[] }>("/api/method/frappe.desk.form.load.getdoctype", { doctype });
    names = new Set(meta.docs[0].fields.map((f) => f.fieldname));
  } catch (error) {
    console.error("[erp] charity meta failed:", error instanceof Error ? error.message : error);
  }
  const pick = (base: string) => (names.has(base) ? base : names.has(`custom_${base}`) ? `custom_${base}` : null);
  const value = { type: pick("source_voucher_type"), voucher: pick("source_voucher") };
  sourceFieldsCache = { at: Date.now(), value };
  return value;
}

export type CharityRaw = {
  name: string | number;
  fund: string | null;
  txn_type: string | null;
  amount: number | null;
  txn_date: string | null;
  beneficiary: string | null;
  details: string | null;
  owner: string | null;
  creation: string;
  source_voucher_type: string | null;
  source_voucher: string | null;
};

// كل عمليات الصدقات بمستند الخزنة بتاعها (لو فيه) - every charity operation with its treasury voucher (if any)
export async function loadCharityRaw(order: "asc" | "desc"): Promise<CharityRaw[]> {
  const { doctype } = dashboardConfig.erp.charity;
  const src = await sourceFields();
  const fields = ["name", "fund", "txn_type", "amount", "txn_date", "beneficiary", "details", "owner", "creation"];
  if (src.type) fields.push(`${src.type} as source_voucher_type`);
  if (src.voucher) fields.push(`${src.voucher} as source_voucher`);
  const { message } = await erpPost<{ message: CharityRaw[] }>("/api/method/frappe.client.get_list", {
    doctype,
    fields,
    order_by: `txn_date ${order}, creation ${order}`,
    limit_page_length: 0,
  });
  return message.map((r) => ({ ...r, source_voucher_type: r.source_voucher_type ?? null, source_voucher: r.source_voucher ?? null }));
}

// مستند الخزنة بتاع عملية (null = اتسجلت بإيدها) - the operation's treasury voucher (null = entered by hand)
export function sourceOf(row: CharityRaw): CharitySource | null {
  const name = String(row.source_voucher ?? "").trim();
  if (!name) return null;
  const type = String(row.source_voucher_type ?? "").trim() || guessDoctype(name);
  return { type, name, url: erpDocUrl(type, name) };
}

function guessDoctype(name: string) {
  return name.startsWith("ACC-PAY") ? "Payment Entry" : name.startsWith("HR-EXP") ? "Expense Claim" : "Journal Entry";
}

// ===== متسجلة مرتين: يدوي (من غير مستند) = تلقائي في الصندوق والنوع والمبلغ والتاريخ ±1 يوم =====
// Recorded twice: a manual row matching an automatic one (fund, type, amount, date ±1 day). Counted once (the automatic)

const TYPE_OF: Record<string, "out" | "in"> = { صرف: "out", إيداع: "in" };
const dayNum = (date: string) => Math.round(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / 86_400_000);

export function charityDuplicates(rows: CharityRaw[]): { pairs: CharityDuplicatePair[]; skip: Set<string>; partner: Map<string, string> } {
  const { doctype } = dashboardConfig.erp.charity;
  const typeOf = (r: CharityRaw) => TYPE_OF[(r.txn_type ?? "").trim()];
  const amountOf = (r: CharityRaw) => Math.round((Number(r.amount) || 0) * 100);
  const autos = rows.filter((r) => sourceOf(r) && typeOf(r)).sort((a, b) => String(a.txn_date).localeCompare(String(b.txn_date)));
  const manuals = rows.filter((r) => !sourceOf(r) && typeOf(r));
  const used = new Set<string>();
  const pairs: CharityDuplicatePair[] = [];
  for (const auto of autos) {
    let best: CharityRaw | null = null;
    let bestGap = 2;
    for (const m of manuals) {
      const id = String(m.name);
      if (used.has(id) || (m.fund ?? "").trim() !== (auto.fund ?? "").trim() || typeOf(m) !== typeOf(auto) || amountOf(m) !== amountOf(auto)) continue;
      const gap = Math.abs(dayNum(String(m.txn_date)) - dayNum(String(auto.txn_date)));
      if (gap <= 1 && gap < bestGap) {
        best = m;
        bestGap = gap;
      }
    }
    if (!best) continue;
    used.add(String(best.name));
    pairs.push({
      fund: (auto.fund ?? "").trim(),
      type: typeOf(auto),
      amount: Math.round((Number(auto.amount) || 0) * 100) / 100,
      manual: { id: String(best.name), date: String(best.txn_date).slice(0, 10), url: erpDocUrl(doctype, String(best.name)) },
      auto: { id: String(auto.name), date: String(auto.txn_date).slice(0, 10), url: erpDocUrl(doctype, String(auto.name)), source: sourceOf(auto)! },
    });
  }
  const partner = new Map<string, string>();
  for (const p of pairs) {
    partner.set(p.manual.id, p.auto.id);
    partner.set(p.auto.id, p.manual.id);
  }
  return { pairs, skip: new Set(pairs.map((p) => p.manual.id)), partner };
}

// ===== صدقات الخزنة من المستندات (نفس شغل السكربتات) - treasury charity from the vouchers (same as the scripts) =====

type Gl = { voucher_type: string; voucher_no: string; posting_date: string; debit: number; credit: number };
type Doc = Record<string, unknown> & { name: string };

// مستند خزنة متقري: الصدقة اللي فيه والصندوق - a treasury voucher read: its charity part(s) and fund
export type TreasuryCharity = UnfundedCharity & { fund: string | null };

const docCache = new Map<string, { at: number; doc: Doc | null }>();
async function getDoc(doctype: string, name: string): Promise<Doc | null> {
  const key = `${doctype}|${name}`;
  const hit = docCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.doc;
  let doc: Doc | null = null;
  try {
    doc = (await erpGet<{ data: Doc }>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {})).data;
  } catch (error) {
    console.error(`[erp] charity voucher ${name} unreadable:`, error instanceof Error ? error.message : error);
  }
  docCache.set(key, { at: Date.now(), doc });
  return doc;
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const plain = (v: unknown) => str(v).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const round = (v: number) => Math.round(v * 100) / 100;

function item(voucherType: string, voucherNo: string, date: string, type: "out" | "in", amount: number, text: string, fundTextSource: string): TreasuryCharity {
  const funds = detectFunds(fundTextSource);
  return {
    voucherType,
    voucherNo,
    url: erpDocUrl(voucherType, voucherNo),
    date,
    type,
    amount: round(amount),
    text,
    funds,
    reason: funds.length === 0 ? "none" : "many",
    fund: funds.length === 1 ? funds[0] : null,
  };
}

// كل صدقات الخزنة من تاريخ (المسودات والملغي مش بيتحسبوا) - every treasury charity entry since a date
export async function treasuryCharity(since: string): Promise<TreasuryCharity[]> {
  const { charityAccounts } = dashboardConfig.accounts;
  const { treasuryAccounts } = dashboardConfig.erp.charity.auto;
  const list = async (filters: unknown[]) =>
    (
      await erpPost<{ message: Gl[] }>("/api/method/frappe.client.get_list", {
        doctype: "GL Entry",
        filters,
        fields: ["voucher_type", "voucher_no", "posting_date", "debit", "credit"],
        limit_page_length: 0,
      })
    ).message;
  const charityGl = await list([["account", "in", charityAccounts], ["posting_date", ">=", since], ["is_cancelled", "=", 0]]);
  const vouchers = Array.from(new Set(charityGl.map((g) => g.voucher_no)));
  if (vouchers.length === 0) return [];
  // لازم المستند يدخل أو يخرج من الخزنة - the voucher must move money in/out of the treasury
  const cashGl = await list([["voucher_no", "in", vouchers], ["account", "in", treasuryAccounts], ["is_cancelled", "=", 0]]);
  const touches = new Set(cashGl.map((g) => `${g.voucher_type}|${g.voucher_no}`));
  const byVoucher = new Map<string, Gl[]>();
  for (const g of charityGl) {
    const key = `${g.voucher_type}|${g.voucher_no}`;
    if (touches.has(key)) byVoucher.set(key, [...(byVoucher.get(key) ?? []), g]);
  }

  const out: TreasuryCharity[] = [];
  for (const lines of Array.from(byVoucher.values())) {
    const { voucher_type: vt, voucher_no: vn, posting_date } = lines[0];
    const date = String(posting_date).slice(0, 10);
    const doc = await getDoc(vt, vn);
    if (!doc) continue;
    if (vt === "Expense Claim") {
      // كل سطر صدقات لوحده (صرف دايما) - each charity line on its own (always صرف)
      const rows = (doc.expenses as Record<string, unknown>[] | undefined) ?? [];
      for (const r of rows) {
        if (!charityAccounts.includes(str(r.default_account))) continue;
        const amount = Number(r.sanctioned_amount) || Number(r.amount) || 0;
        if (!amount) continue;
        const text = plain(r.description) || plain(doc.remark) || str(r.expense_type);
        out.push(item(vt, vn, date, "out", amount, text, [r.description, r.expense_type, doc.remark].map(plain).join(" ")));
      }
      continue;
    }
    // Payment Entry / Journal Entry: الصافي على حساب الصدقات (مدين = خرج من الخزنة = صرف)
    // net on the charity account (debit = money out of the treasury = صرف)
    const net = round(lines.reduce((s, g) => s + (Number(g.debit) || 0) - (Number(g.credit) || 0), 0));
    if (!net) continue;
    let texts: unknown[];
    let shown: string;
    if (vt === "Journal Entry") {
      const rows = (doc.accounts as Record<string, unknown>[] | undefined) ?? [];
      texts = [doc.user_remark, doc.cheque_no, doc.title, ...rows.flatMap((r) => [r.user_remark, r.account, r.party])];
      shown = plain(doc.user_remark) || rows.map((r) => plain(r.user_remark)).filter(Boolean).join(" · ");
    } else {
      texts = [doc.custom_remarks ? doc.remarks : "", doc.reference_no, doc.party, doc.party_name, doc.paid_from, doc.paid_to];
      shown = (doc.custom_remarks ? plain(doc.remarks) : "") || plain(doc.party_name) || plain(doc.party);
    }
    out.push(item(vt, vn, date, net > 0 ? "out" : "in", Math.abs(net), shown, texts.map(plain).join(" ")));
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.voucherNo.localeCompare(a.voucherNo));
}

// "⚠ صدقة من غير صندوق": من تاريخ السكربتات، كاش 5 دقايق (null = مقدرناش نقرا)
// "صدقة من غير صندوق" since the scripts' date, 5 min cache (null = unreadable)
let unfundedCache: { at: number; value: UnfundedCharity[] | null } | null = null;
let unfundedInFlight: Promise<UnfundedCharity[] | null> | null = null;
export async function unfundedCharity(): Promise<UnfundedCharity[] | null> {
  if (unfundedCache && Date.now() - unfundedCache.at < 5 * 60_000) return unfundedCache.value;
  if (unfundedInFlight) return unfundedInFlight;
  unfundedInFlight = (async () => {
    let value: UnfundedCharity[] | null = null;
    try {
      const all = await treasuryCharity(dashboardConfig.erp.charity.auto.since);
      value = all
        .filter((x) => !x.fund)
        .map((x) => ({ voucherType: x.voucherType, voucherNo: x.voucherNo, url: x.url, date: x.date, type: x.type, amount: x.amount, text: x.text, funds: x.funds, reason: x.reason }));
    } catch (error) {
      console.error("[erp] unfunded charity failed:", error instanceof Error ? error.message : error);
      value = unfundedCache?.value ?? null;
    }
    unfundedCache = { at: Date.now(), value };
    return value;
  })();
  try {
    return await unfundedInFlight;
  } finally {
    unfundedInFlight = null;
  }
}
