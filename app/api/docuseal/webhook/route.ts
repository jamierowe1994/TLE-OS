import { NextRequest, NextResponse } from "next/server";
import { putInstructionInRex } from "@/lib/rex-instruct";
import { createHmac, timingSafeEqual } from "node:crypto";
import { fetchSigned, store, pushToRex } from "@/lib/signed-documents";
import { whoHasSigned } from "@/lib/docuseal";

/**
 * A signed contract coming back from DocuSeal.
 *
 * ── What happens, in this order, and the order matters ────────────────────
 *
 * 1. Verify the signature. Anything unsigned is refused before it is read.
 * 2. Download the PDF WHILE ITS URL IS STILL ALIVE. DocuSeal's document links
 *    expire after 40 minutes and their docs say plainly not to store them, so
 *    the bytes are fetched here rather than remembered for later.
 * 3. Store it in R2 and write the row. After this the contract is safe.
 * 4. Copy it to REX as a backup, and let that fail without consequence.
 *
 * James, 31 Aug: "the main storage hub is OS, and then we push it to REX as a
 * backup." Storing first is what makes that true — the day REX changes
 * something must not be the day signed contracts stop being kept.
 *
 * ── Fail SHUT on a missing secret ─────────────────────────────────────────
 *
 * With no DOCUSEAL_WEBHOOK_SECRET this returns 503 and stores nothing. It does
 * NOT fall through to "unverified but probably fine": this endpoint is public
 * by necessity, and an unauthenticated writer that accepts a document is an
 * unauthenticated writer that can put any PDF into a landlord's file.
 *
 * 503 rather than 401 on purpose — DocuSeal retries a 503, so the moment the
 * secret is set the queued deliveries land instead of having been thrown away.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * HMAC-SHA256 over `${timestamp}.${rawBody}`, sent as `timestamp.signature`.
 *
 * THE RAW BODY IS REQUIRED. Verifying against a re-serialised object fails
 * even when the JSON is semantically identical — key order and whitespace are
 * part of what was signed. So the body is read once as text, verified, and
 * only then parsed.
 */
function verify(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const [ts, sig] = header.split(".", 2);
  if (!ts || !sig) return false;
  /* Five minutes, the tolerance DocuSeal's own example uses. Without it a
     captured request could be replayed indefinitely. */
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const expected = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  /* Length-check first: timingSafeEqual throws on a mismatch rather than
     returning false, and a thrown comparison is a 500 instead of a refusal. */
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Payload {
  event_type?: string;
  data?: {
    id?: number;
    name?: string;
    email?: string;
    external_id?: string | null;
    completed_at?: string | null;
    submission?: { id?: number };
    template?: { name?: string };
    documents?: Array<{ name?: string; url?: string }>;
  };
}

export async function POST(req: NextRequest) {
  const secret = (process.env.DOCUSEAL_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    return NextResponse.json(
      { error: "DOCUSEAL_WEBHOOK_SECRET isn't set, so nothing can be verified." },
      { status: 503 }
    );
  }

  const raw = await req.text();
  if (!verify(raw, req.headers.get("x-docuseal-signature"), secret)) {
    return NextResponse.json({ error: "Signature did not check out." }, { status: 401 });
  }

  let body: Payload;
  try {
    body = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }

  /* Only completions carry a document. The other three events — viewed,
     started, declined — are acknowledged so DocuSeal stops retrying them,
     and deliberately do nothing. */
  if (body.event_type !== "form.completed") {
    return NextResponse.json({ ok: true, ignored: body.event_type ?? "unknown" });
  }

  const d = body.data ?? {};

  /* ONE SIGNATURE IS NOT A SIGNED CONTRACT (14 Sep 2026).
     The terms went to two submitters - the agent signs, then the landlord -
     and DocuSeal fires this once per submitter. Storing the agent's completion
     would file a contract with one signature on it, tick "Terms signed" on the
     spine (lib/appraisal-stage) and walk the appraisal on to the take-on visit
     before the landlord had seen it. Acknowledged so DocuSeal stops retrying,
     and nothing else. */
  const submissionId = d.submission?.id != null ? Number(d.submission.id) : null;
  const signed = await whoHasSigned(submissionId);
  /* Could not ask: say so with a 503, which DocuSeal retries. A 200 here is a
     thank-you, and the completion never comes again (18 Sep 2026). */
  if (signed === "unknown") {
    return NextResponse.json({ error: "Could not confirm who has signed. Send it again." }, { status: 503 });
  }
  if (signed !== "all") {
    return NextResponse.json({ ok: true, waiting: "the other signer" });
  }

  const doc = (d.documents ?? [])[0];
  if (!doc?.url || !d.id) {
    return NextResponse.json(
      { error: "A completion with no document on it — nothing to store." },
      { status: 422 }
    );
  }

  try {
    /* Step 2 before step 3: no point writing a row that points at nothing. */
    const bytes = await fetchSigned(doc.url);

    const result = await store({
      submitterId: Number(d.id),
      submissionId,
      /* Ours, set when the signing session was opened, so a document can find
         its way back to the appraisal it belongs to. */
      appraisalId: (d.external_id ?? "").trim(),
      templateName: d.template?.name ?? "",
      signerName: d.name ?? "",
      signerEmail: d.email ?? "",
      completedAt: d.completed_at ?? null,
      bytes,
      fileName: doc.name ? `${doc.name}.pdf` : "terms-of-business.pdf",
    });

    if (!result.stored) {
      /* 500 so DocuSeal retries. A contract we could not keep is worth being
         asked about again. */
      return NextResponse.json({ error: result.reason ?? "Not stored." }, { status: 500 });
    }

    /* The backup. Never allowed to fail the request — the contract is already
       safe, and a 500 here would have DocuSeal redelivering a document we have
       successfully kept. */
    const rex = await pushToRex(Number(d.id)).catch((e) => ({
      pushed: false,
      reason: e instanceof Error ? e.message : "REX copy failed.",
    }));

    /* Signed terms are the instruction: the landlord and the home go into REX
       now, so the listing has something to hang on (lib/rex-instruct). Never
       the reason the webhook fails; the cron retries anything left over. */
    const appraisalId = (d.external_id ?? "").trim();
    const instructed = appraisalId && d.completed_at
      ? await putInstructionInRex(appraisalId).catch((e) => ({ ok: false, detail: e instanceof Error ? e.message : "REX step failed." }))
      : null;

    return NextResponse.json({
      ok: true,
      instructed,
      fresh: result.fresh,
      r2Key: result.r2Key,
      rexCopied: rex.pushed,
      rexNote: rex.pushed ? null : rex.reason,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not store the signed document." },
      { status: 500 }
    );
  }
}
