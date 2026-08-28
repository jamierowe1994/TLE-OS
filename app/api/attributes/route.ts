import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import {
  addDef, defsFor, removeDef, setValue, valuesFor,
  ENTITIES, KINDS, type AttrEntity, type AttrKind,
} from "@/lib/attributes";

/** A person's own custom fields. Everything here is scoped to the caller. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const me = (req: NextRequest) => verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

export async function GET(req: NextRequest) {
  const id = me(req);
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const entityRaw = req.nextUrl.searchParams.get("entity");
  const entity = (ENTITIES as readonly string[]).includes(entityRaw ?? "")
    ? (entityRaw as AttrEntity) : undefined;
  const record = req.nextUrl.searchParams.get("record");
  return NextResponse.json({
    defs: await defsFor(id, entity),
    values: record ? await valuesFor(id, record) : {},
  });
}

export async function POST(req: NextRequest) {
  const id = me(req);
  if (!id) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    entity?: string; label?: string; kind?: string; options?: string[];
    defId?: string; record?: string; value?: string;
  };

  /* Two jobs on one route: defining a field, and filling one in. Split by which
     arguments arrived rather than by a mode flag — a flag somebody can get
     wrong is worse than an argument they cannot omit. */
  if (b.defId && b.record !== undefined) {
    await setValue(id, b.defId, b.record, b.value ?? "");
    return NextResponse.json({ ok: true });
  }

  if (!b.label?.trim() || !(ENTITIES as readonly string[]).includes(b.entity ?? "")) {
    return NextResponse.json({ ok: false, error: "Needs a label and where it belongs." }, { status: 400 });
  }
  const kind = (KINDS as readonly string[]).includes(b.kind ?? "") ? (b.kind as AttrKind) : "text";
  if (kind === "select" && !(b.options ?? []).filter((o) => o.trim()).length) {
    return NextResponse.json({ ok: false, error: "A list needs at least one option." }, { status: 400 });
  }
  await addDef({
    ownerId: id,
    entity: b.entity as AttrEntity,
    label: b.label,
    kind,
    options: (b.options ?? []).map((o) => o.trim()).filter(Boolean),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = me(req);
  if (!id) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  const { defId } = (await req.json().catch(() => ({}))) as { defId?: string };
  if (defId) await removeDef(id, defId);
  return NextResponse.json({ ok: true });
}
