// DEEYOUNG PRO — admin content desk (owner-editable site copy + media).
// GET  — every override row with updatedBy/updatedAt for the Content tab.
// POST — { key, value } upsert. Key whitelist + per-type size caps enforced in
//        src/lib/site-content.ts (text 5k chars, image 600KB data URL).
//        value === "" deletes the override (falls back to built-in default).
// Every write lands in the audit trail with the acting admin attached.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { CONTENT_KEYS, validateContentValue } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required." }, { status: 403 });

  const rows = await db.siteContent.findMany({
    where: { key: { in: [...CONTENT_KEYS] } },
    select: { key: true, value: true, updatedBy: true, updatedAt: true },
  });
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN", message: "Admin access required." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { key?: string; value?: string };
  const key = String(body.key ?? "");
  const value = String(body.value ?? "");

  const invalid = validateContentValue(key, value);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (value === "") {
    await db.siteContent.deleteMany({ where: { key } }); // absent = default copy
  } else {
    await db.siteContent.upsert({
      where: { key },
      update: { value, updatedBy: admin.email },
      create: { key, value, updatedBy: admin.email },
    });
  }

  await db.auditEvent
    .create({
      data: {
        userId: admin.id,
        category: "ADMIN",
        action: value === "" ? "CONTENT_CLEARED" : "CONTENT_UPDATED",
        detail: JSON.stringify({ key, bytes: value.length }),
      },
    })
    .catch(() => undefined);

  return NextResponse.json({ ok: true, key });
}
