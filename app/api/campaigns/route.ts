import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { SESSION_COOKIE, uid, verifySessionToken } from "@/lib/auth";
import { CAMPAIGNS, type Campaign, type CampaignStep } from "@/lib/campaigns";

/**
 * Every campaign there is: the built-in set, plus the ones marketing built.
 *
 * The built-ins stay in code. They are the house's own thinking about why a
 * landlord walks away, they want reviewing in a diff, and they have to exist
 * on an environment with no database — the demo, a fresh clone, a laptop on a
 * train. What marketing writes afterwards shouldn't need a deploy, so it goes
 * in the table and gets merged here.
 *
 * Merged in ONE place so nothing downstream has to care which is which: the
 * scheduler, the agent's picker and the marketing screen all ask this route.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = {
  id: string;
  name: string;
  audience: string;
  reasons: string[];
  aim: string;
  status: string;
  steps: CampaignStep[];
};

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "campaign"
  );
}

/** What a step must look like before it's allowed near the scheduler. */
function cleanStep(s: unknown): CampaignStep | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  const day = Number(o.day);
  const channel = o.channel === "call" || o.channel === "post" ? o.channel : "email";
  if (!Number.isFinite(day) || day < 0 || day > 730) return null;
  const subject = String(o.subject ?? "").slice(0, 200).trim();
  if (!subject) return null;
  return {
    day: Math.round(day),
    channel,
    subject,
    gist: String(o.gist ?? "").slice(0, 400),
    ...(Array.isArray(o.body) ? { body: (o.body as unknown[]).map(String) } : {}),
  };
}

export async function GET() {
  const stored = hasDb()
    ? await q<Row>(
        `SELECT id, name, audience, reasons, aim, status, steps FROM os_campaigns ORDER BY created_at`
      ).catch(() => [])
    : [];

  const built: (Campaign & { source: string })[] = CAMPAIGNS.map((c) => ({ ...c, source: "built-in" }));
  const mine: (Campaign & { source: string })[] = stored.map((r) => ({
    id: r.id,
    name: r.name,
    audience: r.audience === "lost" ? "lost" : "nurture",
    reasons: Array.isArray(r.reasons) ? r.reasons : [],
    aim: r.aim,
    status: r.status === "live" ? "live" : "draft",
    steps: Array.isArray(r.steps) ? r.steps : [],
    source: "written here",
  }));

  return NextResponse.json({ stored: hasDb(), campaigns: [...built, ...mine] });
}

export async function POST(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Partial<Campaign> & { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "A campaign needs a name." }, { status: 400 });
  const steps = (Array.isArray(body.steps) ? body.steps : []).map(cleanStep).filter(Boolean) as CampaignStep[];
  const audience = body.audience === "lost" ? "lost" : "nurture";
  const status = body.status === "live" ? "live" : "draft";

  if (!hasDb()) {
    return NextResponse.json({ saved: false, reason: "No database on this environment." });
  }

  // A new campaign gets an id derived from its name, with the row id kept
  // unique — enrolments and copy point at this id forever, so it must never
  // be reused by a later campaign that happens to share a name.
  const id = body.id || `${slug(name)}-${uid().slice(-4)}`;

  // Built-ins are read-only here. Editing one means editing the file, which
  // is the point of them being in the file.
  if (CAMPAIGNS.some((c) => c.id === id)) {
    return NextResponse.json(
      { error: "That's a built-in campaign — it's edited in the code, not here." },
      { status: 409 }
    );
  }

  await q(
    `INSERT INTO os_campaigns (id, name, audience, reasons, aim, status, steps, updated_by)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           audience = EXCLUDED.audience,
           reasons = EXCLUDED.reasons,
           aim = EXCLUDED.aim,
           status = EXCLUDED.status,
           steps = EXCLUDED.steps,
           updated_at = NOW(),
           updated_by = EXCLUDED.updated_by`,
    [
      id,
      name.slice(0, 120),
      audience,
      JSON.stringify(Array.isArray(body.reasons) ? body.reasons : []),
      String(body.aim ?? "").slice(0, 400),
      status,
      JSON.stringify(steps),
      userId,
    ]
  );
  return NextResponse.json({ saved: true, id });
}

export async function DELETE(req: NextRequest) {
  if (!verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (CAMPAIGNS.some((c) => c.id === id)) {
    return NextResponse.json({ error: "Built-in campaigns can't be deleted here." }, { status: 409 });
  }
  if (!hasDb()) return NextResponse.json({ saved: false, reason: "No database on this environment." });

  // Anyone already on it keeps their row: deleting the campaign must not
  // quietly delete the record of who was sent what.
  const live = await q<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM os_campaign_enrolments WHERE campaign_id = $1 AND status = 'active'`,
    [id]
  );
  if (Number(live[0]?.n ?? 0) > 0) {
    return NextResponse.json(
      { error: `${live[0].n} landlord(s) are on this campaign. Stop them first.` },
      { status: 409 }
    );
  }
  await q(`DELETE FROM os_campaigns WHERE id = $1`, [id]);
  return NextResponse.json({ saved: true });
}
