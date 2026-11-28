// كشف العملاء Excel (نفس شكل كشوف المرتبات) - the customers Excel sheet (same look as the salary sheets)
import { C, Cell, Col, issuedAt, newWorkbook, round, styledSheet } from "./excel-sheet";
import { customerRows } from "./customers";

const COLS: Col[] = [
  { header: "م", kind: "index" },
  { header: "العميل", kind: "name" },
  { header: "الموبايل", kind: "code" },
  { header: "المنطقة", kind: "text" },
  { header: "العنوان", kind: "text" },
  { header: "النوع", kind: "text" },
  { header: "المندوب", kind: "text" },
  { header: "أول شرا", kind: "code" },
  { header: "آخر شرا", kind: "code" },
  { header: "من كام يوم", kind: "count" },
  { header: "عدد الفواتير", kind: "count" },
  { header: "باكت الشهر", kind: "count" },
  { header: "مبلغ الشهر", kind: "money" },
  { header: "باكت 3 شهور", kind: "count" },
  { header: "باكت الإجمالي", kind: "count" },
  { header: "مبلغ الإجمالي", kind: "money" },
  { header: "متوسط الفاتورة", kind: "money" },
  { header: "المديونية", kind: "deduct" },
  { header: "أقدم فاتورة مفتوحة", kind: "code" },
];

export async function customersWorkbook(ids: string[] | null): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const { rows: all, data } = await customerRows();
  const order = ids ? new Map(ids.map((id, i) => [id, i])) : null;
  const rows = order ? all.filter((r) => order.has(r.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!) : all;
  const repName = new Map(data.reps.map((r) => [r.id, `${r.name} (${r.van})`]));
  const issued = issuedAt();
  const sum = (pick: (r: (typeof rows)[number]) => number) => round(rows.reduce((s, r) => s + pick(r), 0));
  const body: Cell[][] = rows.map((r, i) => [
    i + 1,
    r.name,
    r.mobile,
    r.area,
    r.address,
    r.type,
    r.repId ? repName.get(r.repId) ?? r.repId : "—",
    r.firstDate,
    r.lastDate,
    r.daysSince,
    r.all.invoices,
    r.month.packets,
    r.month.amount,
    r.three.packets,
    r.all.packets,
    r.all.amount,
    r.avgOrder,
    r.debt,
    r.oldestUnpaid?.date ?? null,
  ]);
  const totals: Cell[] = [null, `الإجمالي (${rows.length})`, null, null, null, null, null, null, null, null,
    sum((r) => r.all.invoices), sum((r) => r.month.packets), sum((r) => r.month.amount), sum((r) => r.three.packets),
    sum((r) => r.all.packets), sum((r) => r.all.amount), null, sum((r) => r.debt), null];
  const { workbook, logos } = newWorkbook();
  styledSheet(
    workbook,
    logos,
    {
      name: "العملاء",
      title: "كشف العملاء",
      subtitle: "مصنع الصفوة للفحم — من ERPNext",
      info: [
        ["تاريخ الإصدار", issued.date],
        ["عدد العملاء", String(rows.length)],
        ["إجمالي المديونية", sum((r) => r.debt).toLocaleString("en-US")],
      ],
      headerFill: C.deepOrange,
      headerText: C.white,
      cols: COLS,
      rows: body,
      totals,
    },
    issued.dateTime
  );
  const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
  return { buffer, fileName: `العملاء ${data.today}.xlsx` };
}
