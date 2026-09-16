import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { sendEmail } from "@/lib/resend";
import { renderPlain } from "@/lib/campaign-mail";
import { userByName } from "@/lib/tenant-email-send";
import { sendNotForThem } from "@/lib/tenant-journey-emails";

/**
 * The tenant's feedback on a viewing, behind the token in How Was It?
 * (16 Sep 2026). No account: the token is the sign-in, the way the passport
 * works, and it only opens the one viewing it was minted for.
 *
 *   GET  ?t=<token>   what the page needs to show: the home, the rent, the agent
 *   POST { t, answers, interested, offer? }
 *
 * On a POST the agent gets the answers by email (and the offer, when there is
 * one, to put to the landlord), and a "not this one" sends Not That One, Try
 * These straight away - behind the Automatic tenant emails switch.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = {
  token: string; viewing_id: string; email: string; name: string; listing_id: string | null; address: string;
  asking_pcm: number | null; starts_at: Date | null; agent: string | null; answered_at: Date | null;
};

async function load(t: string): Promise<Row | null> {
  if (!hasDb() || !/^[A-Za-z0-9_-]{20,64}$/.test(t)) return null;
  const rows = await q<Row>(
    `SELECT token, viewing_id, email, name, listing_id, address, asking_pcm, starts_at, agent, answered_at
       FROM os_tenant_feedback WHERE token = $1 AND created_at > NOW() - interval '30 days'`,
    [t]
  );
  return rows[0] ?? null;
}

const QUESTIONS: [string, string][] = [
  ["liked", "What did you like most about the property?"],
  ["info", "Is there anything you'd like more information on?"],
  ["concerns", "Are there any concerns or points you'd like to discuss?"],
  ["compare", "How does it compare to other properties you've seen?"],
];

export async function GET(req: NextRequest) {
  const f = await load(req.nextUrl.searchParams.get("t") ?? "");
  if (!f) return NextResponse.json({ ok: false, said: "This link has expired or isn't quite right. Reply to the email and we'll send you another." }, { status: 404 });
  /* "Room 2, 5b Newton Road, Newton Abbot TQ12 5EQ": the town is after the LAST comma. */
  const cut = f.address.lastIndexOf(",");
  const property = cut > 0 ? f.address.slice(0, cut) : f.address;
  const rest = cut > 0 ? [f.address.slice(cut + 1)] : [];
  return NextResponse.json({
    ok: true,
    viewing: {
      firstName: f.name.trim().split(/\s+/)[0] || "",
      property: property.trim(),
      locality: rest.join(",").trim(),
      askingPcm: f.asking_pcm,
      viewedOn: f.starts_at
        ? new Date(f.starts_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" })
        : "",
      agent: f.agent ?? "",
      answered: Boolean(f.answered_at),
    },
  });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as {
    t?: string;
    answers?: Record<string, string>;
    interested?: boolean;
    offer?: { amount?: number; moveIn?: string; term?: string };
  };
  const f = await load(String(b.t ?? ""));
  if (!f) return NextResponse.json({ ok: false, said: "This link has expired or isn't quite right." }, { status: 404 });
  if (f.answered_at) return NextResponse.json({ ok: false, said: "We already have your feedback on this one. Thank you." }, { status: 409 });
  if (typeof b.interested !== "boolean") return NextResponse.json({ ok: false, said: "Let us know whether you'd like to offer." }, { status: 400 });

  const answers = Object.fromEntries(QUESTIONS.map(([k]) => [k, String(b.answers?.[k] ?? "").slice(0, 2000).trim()]));
  let offer: { amount: number; moveIn: string | null; term: string | null } | null = null;
  if (b.interested) {
    const amount = Math.round(Number(b.offer?.amount));
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ ok: false, said: "Tell us what you'd like to offer." }, { status: 400 });
    /* Nothing above the asking rent - see the page for why. Checked here as
       well, because the page is only the browser's word for it. */
    if (f.asking_pcm && amount > f.asking_pcm) {
      return NextResponse.json({ ok: false, said: `The advertised rent is £${f.asking_pcm.toLocaleString("en-GB")} a month, so an offer can't be above that.` }, { status: 400 });
    }
    offer = { amount, moveIn: b.offer?.moveIn ? String(b.offer.moveIn).slice(0, 20) : null, term: b.offer?.term ? String(b.offer.term).slice(0, 20) : null };
  }

  const saved = await q<{ token: string }>(
    `UPDATE os_tenant_feedback SET answered_at = NOW(), answers = $2::jsonb, interested = $3, offer = $4::jsonb
      WHERE token = $1 AND answered_at IS NULL RETURNING token`,
    [f.token, JSON.stringify(answers), b.interested, offer ? JSON.stringify(offer) : null]
  );
  if (!saved.length) return NextResponse.json({ ok: false, said: "We already have your feedback on this one. Thank you." }, { status: 409 });

  /* The agent hears either way. Staff mail, so it is not behind the customer
     switch: an offer sitting in a table nobody reads is the failure here. */
  const agent = await userByName(f.agent);
  if (agent?.email) {
    const who = f.name || f.email;
    const subject = offer
      ? `Offer from ${who}: £${offer.amount.toLocaleString("en-GB")} pcm on ${f.address}`
      : `Viewing feedback from ${who}: ${f.address}`;
    const text = [
      offer ? `${who} would like to offer on ${f.address}.` : `${who} has said ${f.address} is not for them.`,
      "",
      ...(offer
        ? [
            `**Offer:** £${offer.amount.toLocaleString("en-GB")} pcm${f.asking_pcm ? ` (advertised at £${f.asking_pcm.toLocaleString("en-GB")})` : ""}`,
            `**Move in:** ${offer.moveIn ?? "not said"}`,
            `**Term:** ${offer.term ?? "not said"}`,
            "",
            "Put it to the landlord, and reply to them either way.",
            "",
          ]
        : ["They have been sent other homes nearby at a similar rent, if there were any.", ""]),
      ...QUESTIONS.map(([k, q]) => `**${q}**\n${answers[k] || "-"}`),
      "",
      `Their email: ${f.email}`,
    ].join("\n");
    await sendEmail({ to: agent.email, subject, html: renderPlain(subject, text).html, text: text.replace(/\*\*/g, ""), replyTo: f.email }).catch(() => null);
  }

  if (!b.interested) await sendNotForThem(f.token).catch(() => null);
  return NextResponse.json({ ok: true, agent: f.agent ?? "" });
}
