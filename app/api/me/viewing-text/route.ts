import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb, q } from "@/lib/db";
import { firstName } from "@/lib/tenant-email-send";
import { addressForText, phoneForAgent, timeForText } from "@/lib/viewing-texts";
import { STANDARD_TEMPLATE, VIEWING_TEXT_PREF, checkTemplate, tidyTemplate, type TextVars } from "@/lib/viewing-text-template";

/**
 * A person's own viewing reminder text (Profile > Custom > Viewing text).
 *
 *   GET            theirs (null = the standard text), the standard, and real
 *                  details from their next viewing for the preview
 *   GET ?all=1     owners: everybody who has changed theirs
 *   PUT            { template }  checked by lib/viewing-text-template, saved tidied
 *   DELETE         back to the standard text
 *   DELETE ?user=  owners: put somebody else's back to the standard text
 *
 * Saved by the person it belongs to: refused while an owner is viewing as
 * them, the same line app/api/me/footer draws. An owner puts one back from
 * Admin with ?user= instead.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Saved = { template?: string; updatedAt?: string };

async function savedFor(userId: string): Promise<Saved | null> {
  const rows = await q<{ value: Saved | null }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, VIEWING_TEXT_PREF]).catch(() => []);
  return rows[0]?.value?.template ? rows[0].value : null;
}

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  const me = subject ?? actor;
  if (!actor || !me) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected." }, { status: 503 });

  if (req.nextUrl.searchParams.get("all") === "1") {
    if (!can(actor.role, "see:everything")) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
    const rows = await q<{ user_id: string; name: string; value: Saved }>(
      `SELECT p.user_id, u.name, p.value FROM os_user_prefs p JOIN os_users u ON u.id = p.user_id
        WHERE p.key = $1 AND COALESCE(p.value->>'template', '') <> '' ORDER BY u.name`,
      [VIEWING_TEXT_PREF]
    );
    return NextResponse.json({
      ok: true,
      people: rows.map((r) => ({ userId: r.user_id, name: r.name, template: r.value.template, updatedAt: r.value.updatedAt ?? null, ok: checkTemplate(r.value.template ?? "").ok })),
    });
  }

  const saved = await savedFor(me.id);
  /* Their next accompanied TLE viewing, for a preview in real words. */
  const next = await q<{ starts_at: string | Date; label: string | null; contacts: { name?: string }[] | null }>(
    `SELECT starts_at, payload->>'listingLabel' AS label, contacts FROM os_viewings
      WHERE kind = 'viewing' AND cancelled = FALSE AND starts_at > NOW()
        AND LOWER(agent) = LOWER($1)
        AND payload->>'type' ILIKE 'TLE %Viewing%' AND payload->>'type' NOT ILIKE '%unaccompanied%'
      ORDER BY starts_at LIMIT 1`,
    [me.name]
  ).catch(() => []);
  const v = next[0];
  const viewer = (v?.contacts ?? []).map((c) => c.name ?? "").find((n) => n && n !== "(no name)") ?? "";
  const preview: TextVars & { real: boolean } = {
    firstName: v ? firstName(viewer) : "Sophie",
    time: v ? timeForText(new Date(v.starts_at).toISOString()) : "3pm",
    address: v ? addressForText(v.label) : "14 Moor Street, Manchester",
    myName: me.name,
    myPhone: await phoneForAgent(me.name, me),
    real: Boolean(v),
  };
  return NextResponse.json({ ok: true, template: saved?.template ?? null, updatedAt: saved?.updatedAt ?? null, standard: STANDARD_TEMPLATE, preview, readOnly: Boolean(subject && subject.id !== actor.id) });
}

export async function PUT(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as somebody first. A text is set by the person it belongs to." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { template?: unknown };
  const template = tidyTemplate(typeof body.template === "string" ? body.template : "");
  const check = checkTemplate(template);
  if (!check.ok) return NextResponse.json({ ok: false, error: check.errors.join(" "), check }, { status: 400 });
  /* Saving the standard word for word is going back to the standard - so a
     later change to the standard reaches them too. */
  if (template === STANDARD_TEMPLATE) {
    await q(`DELETE FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [actor.id, VIEWING_TEXT_PREF]);
    return NextResponse.json({ ok: true, template: null, check });
  }
  const value: Saved = { template, updatedAt: new Date().toISOString() };
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [actor.id, VIEWING_TEXT_PREF, JSON.stringify(value)]
  );
  return NextResponse.json({ ok: true, template, updatedAt: value.updatedAt, check });
}

export async function DELETE(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected." }, { status: 503 });
  const other = req.nextUrl.searchParams.get("user");
  if (other && other !== actor.id) {
    if (!can(actor.role, "see:everything")) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  } else if (viewingAs) {
    return NextResponse.json({ ok: false, error: "Stop viewing as somebody first. A text is set by the person it belongs to." }, { status: 403 });
  }
  await q(`DELETE FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [other || actor.id, VIEWING_TEXT_PREF]);
  return NextResponse.json({ ok: true, template: null });
}
