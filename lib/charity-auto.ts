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
  // سطر صدقات من Expense Claim (مش سجل Charity Transaction) - an Expense Claim charity row (not a Charity Transaction)
  claim?: ClaimCharity;
};

// كل عمليات الصدقات بمستند الخزنة بتاعها (لو فيه) + سطور صدقات مصروفات الموظفين اللي ليها صندوق
// Every charity operation with its treasury voucher (if any) + the funded Expense Claim charity rows
export async function loadCharityRaw(order: "asc" | "desc"): Promise<CharityRaw[]> {
  const { doctype, expenseClaimSince } = dashboardConfig.erp.charity;
  const src = await sourceFields();
  const fields = ["name", "fund", "txn_type", "amount", "txn_date", "beneficiary", "details", "owner", "creation"];
  if (src.type) fields.push(`${src.type} as source_voucher_type`);
  if (src.voucher) fields.push(`${src.voucher} as source_voucher`);
  const [{ message }, claims] = await Promise.all([
    erpPost<{ message: CharityRaw[] }>("/api/method/frappe.client.get_list", {
      doctype,
      fields,
      order_by: `txn_date ${order}, creation ${order}`,
      limit_page_length: 0,
    }),
    claimCharity(),
  ]);
  const records = message.map((r) => ({ ...r, source_voucher_type: r.source_voucher_type ?? null, source_voucher: r.source_voucher ?? null }));
  // السكربت عمل سجل للمصروف ده خلاص (نفس المستند والمبلغ) = نفس العملية، مش بنعدها تاني
  // A Server Script already made a record for this claim (same voucher and amount) = the same operation, not added again
  const fromScript = new Set(records.filter((r) => r.source_voucher).map((r) => `${String(r.source_voucher).trim()}|${cents(r.amount)}`));
  const extra = claims
    .filter((c) => c.fund && c.date >= expenseClaimSince && !fromScript.has(`${c.claim}|${cents(c.amount)}`))
    .map(claimRow);
  const sign = order === "asc" ? 1 : -1;
  return [...records, ...extra].sort(
    (a, b) => sign * (String(a.txn_date).localeCompare(String(b.txn_date)) || String(a.creation).localeCompare(String(b.creation)))
  );
}

// ===== صدقات مصروفات الموظفين (Expense Claim، جدول expenses) - Expense Claim charity rows =====

export type ClaimCharity = {
  id: string; // "HR-EXP-2026-00803-1 #7"
  claim: string;
  row: number;
  employee: string;
  employeeName: string;
  date: string;
  amount: number;
  text: string;
  funds: string[];
  fund: string | null;
  creation: string;
  owner: string;
};

const cents = (v: unknown) => Math.round((Number(v) || 0) * 100);

type ClaimRowRaw = {
  name: string; employee: string | null; employee_name: string | null; posting_date: string | null; owner: string | null; creation: string;
  row_idx: number; expense_date: string | null; description: string | null; amount: number | null; sanctioned_amount: number | null;
};

// كاش دقيقة، ولو فشل آخر نتيجة نجحت (ولو مفيش بيرمي) - 1 min cache; on failure the last good result (else throws)
let claimCache: { at: number; value: ClaimCharity[] } | null = null;
let claimInFlight: Promise<ClaimCharity[]> | null = null;
export async function claimCharity(): Promise<ClaimCharity[]> {
  const { expenseClaimTypes } = dashboardConfig.erp.charity;
  if (expenseClaimTypes.length === 0) return [];
  if (claimCache && Date.now() - claimCache.at < 60_000) return claimCache.value;
  if (claimInFlight) return claimInFlight;
  const child = "`tabExpense Claim Detail`";
  claimInFlight = (async () => {
    try {
      const { message } = await erpPost<{ message: ClaimRowRaw[] }>("/api/method/frappe.client.get_list", {
        doctype: "Expense Claim",
        filters: [["docstatus", "=", 1], ["Expense Claim Detail", "expense_type", "in", expenseClaimTypes]],
        fields: [
          "name", "employee", "employee_name", "posting_date", "owner", "creation",
          `${child}.idx as row_idx`, `${child}.expense_date as expense_date`, `${child}.description as description`,
          `${child}.amount as amount`, `${child}.sanctioned_amount as sanctioned_amount`,
        ],
        limit_page_length: 0,
      });
      const value = message
        .map((r): ClaimCharity => {
          const text = plain(r.description);
          const funds = detectFunds(text);
          return {
            id: `${r.name} #${r.row_idx}`,
            claim: r.name,
            row: Number(r.row_idx) || 0,
            employee: str(r.employee),
            employeeName: plain(r.employee_name) || str(r.employee),
            date: str(r.expense_date || r.posting_date).slice(0, 10),
            amount: round(Number(r.sanctioned_amount) || Number(r.amount) || 0),
            text,
            funds,
            fund: funds.length === 1 ? funds[0] : null,
            creation: str(r.creation),
            owner: str(r.owner),
          };
        })
        .filter((c) => c.amount > 0 && c.date)
        .sort((a, b) => a.date.localeCompare(b.date) || a.claim.localeCompare(b.claim) || a.row - b.row);
      claimCache = { at: Date.now(), value };
      return value;
    } catch (error) {
      console.error("[erp] expense claim charity failed:", error instanceof Error ? error.message : error);
      if (claimCache) return claimCache.value;
      throw error;
    }
  })();
  try {
    return await claimInFlight;
  } finally {
    claimInFlight = null;
  }
}

function claimSource(c: ClaimCharity): CharitySource {
  return { type: "Expense Claim", name: c.claim, url: erpDocUrl("Expense Claim", c.claim), label: `مصروف موظف ${c.claim} · ${c.employeeName}` };
}

// سطر مصروف موظف كعملية صرف في صندوقه - an Expense Claim row as a صرف in its fund
function claimRow(c: ClaimCharity): CharityRaw {
  return {
    name: c.id,
    fund: c.fund,
    txn_type: "صرف",
    amount: c.amount,
    txn_date: c.date,
    beneficiary: "",
    details: c.text,
    owner: c.owner,
    creation: c.creation,
    source_voucher_type: "Expense Claim",
    source_voucher: c.claim,
    claim: c,
  };
}

// رابط العملية في ERPNext - the operation's ERPNext link
export function charityRowUrl(row: CharityRaw): string {
  return row.claim ? erpDocUrl("Expense Claim", row.claim.claim) : erpDocUrl(dashboardConfig.erp.charity.doctype, String(row.name));
}

// مستند الخزنة بتاع عملية (null = اتسجلت بإيدها) - the operation's treasury voucher (null = entered by hand)
export function sourceOf(row: CharityRaw): CharitySource | null {
  if (row.claim) return claimSource(row.claim);
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

// + سطر مصروف موظف = أي سجل صدقات لسه بيتحسب (يدوي أو تلقائي) بنفس الصندوق والمبلغ والتاريخ ±1 يوم: بيتحسب السجل
// + An Expense Claim row matching any still-counted Charity Transaction (fund, amount, date ±1 day): the record counts

export type CharityPartner = { id: string; url: string };

export function charityDuplicates(rows: CharityRaw[]): { pairs: CharityDuplicatePair[]; skip: Set<string>; partner: Map<string, CharityPartner> } {
  const typeOf = (r: CharityRaw) => TYPE_OF[(r.txn_type ?? "").trim()];
  const fundOf = (r: CharityRaw) => (r.fund ?? "").trim();
  const byDate = (a: CharityRaw, b: CharityRaw) => String(a.txn_date).localeCompare(String(b.txn_date));
  const records = rows.filter((r) => !r.claim && typeOf(r));
  const autos = records.filter((r) => sourceOf(r)).sort(byDate);
  const manuals = records.filter((r) => !sourceOf(r));
  const claims = rows.filter((r) => r.claim && typeOf(r)).sort(byDate);
  const used = new Set<string>();
  const skip = new Set<string>();
  const pairs: CharityDuplicatePair[] = [];
  const info = (r: CharityRaw) => ({ id: String(r.name), date: String(r.txn_date).slice(0, 10), url: charityRowUrl(r) });

  // أقرب واحد مش مستخدم (±1 يوم) بنفس الصندوق والنوع والمبلغ - the nearest unused match within ±1 day
  const nearest = (target: CharityRaw, pool: CharityRaw[]) => {
    let best: CharityRaw | null = null;
    let bestGap = 2;
    for (const m of pool) {
      if (used.has(String(m.name)) || fundOf(m) !== fundOf(target) || typeOf(m) !== typeOf(target) || cents(m.amount) !== cents(target.amount)) continue;
      const gap = Math.abs(dayNum(String(m.txn_date)) - dayNum(String(target.txn_date)));
      if (gap <= 1 && gap < bestGap) {
        best = m;
        bestGap = gap;
      }
    }
    return best;
  };

  for (const auto of autos) {
    const best = nearest(auto, manuals);
    if (!best) continue;
    used.add(String(best.name));
    skip.add(String(best.name));
    pairs.push({ fund: fundOf(auto), type: typeOf(auto), amount: cents(auto.amount) / 100, manual: info(best), auto: { ...info(auto), source: sourceOf(auto)! } });
  }
  // سطور المصروفات قصاد السجلات اللي لسه بتتحسب - claim rows against the records still counted
  const counted = records.filter((r) => !skip.has(String(r.name)));
  for (const claim of claims) {
    const best = nearest(claim, counted);
    if (!best) continue;
    used.add(String(best.name));
    skip.add(String(claim.name));
    pairs.push({
      fund: fundOf(claim), type: typeOf(claim), amount: cents(claim.amount) / 100, kind: "claim",
      manual: info(best), auto: { ...info(claim), source: sourceOf(claim)! },
    });
  }
  const partner = new Map<string, CharityPartner>();
  for (const p of pairs) {
    partner.set(p.manual.id, { id: p.auto.id, url: p.auto.url });
    partner.set(p.auto.id, { id: p.manual.id, url: p.manual.url });
  }
  return { pairs, skip, partner };
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
      const { since } = dashboardConfig.erp.charity.auto;
      const [all, claims, rows] = await Promise.all([treasuryCharity(since), claimCharity(), loadCharityRaw("asc")]);
      // مصروفات الموظفين من claimCharity (كل السطور، مش بس اللي على الخزنة) - Expense Claims come from claimCharity
      const treasury = all
        .filter((x) => !x.fund && x.voucherType !== "Expense Claim")
        .map((x) => ({ voucherType: x.voucherType, voucherNo: x.voucherNo, url: x.url, date: x.date, type: x.type, amount: x.amount, text: x.text, funds: x.funds, reason: x.reason }));
      // سطر من غير صندوق ومتسجل بإيده في أي صندوق (نفس المبلغ والتاريخ ±1 يوم) = اتسجل خلاص، مش بيظهر
      // A fundless row already entered by hand in some fund (same amount, date ±1 day) is recorded: not listed
      const spent = rows.filter((r) => !r.claim && TYPE_OF[(r.txn_type ?? "").trim()] === "out");
      const recorded = (c: ClaimCharity) =>
        spent.some((r) => cents(r.amount) === cents(c.amount) && Math.abs(dayNum(String(r.txn_date)) - dayNum(c.date)) <= 1);
      const fromClaims = claims
        .filter((c) => !c.fund && c.date >= since && !recorded(c))
        .map((c): UnfundedCharity => ({
          voucherType: "Expense Claim",
          voucherNo: c.claim,
          url: erpDocUrl("Expense Claim", c.claim),
          date: c.date,
          type: "out",
          amount: c.amount,
          text: `${c.text || "مفيش بيان"} (مصروف موظف · ${c.employeeName} · سطر ${c.row})`,
          funds: c.funds,
          reason: c.funds.length === 0 ? "none" : "many",
        }));
      value = [...treasury, ...fromClaims].sort((a, b) => b.date.localeCompare(a.date) || b.voucherNo.localeCompare(a.voucherNo));
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
