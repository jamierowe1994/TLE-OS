import "server-only";

/**
 * Stannp: print and post.
 *
 * ── The one thing to know ─────────────────────────────────────────────────
 *
 * STANNP_TEST_MODE decides whether a card is really printed and posted or
 * comes back as a sample PDF. It defaults to TEST when unset or unreadable,
 * which is the safe way round: the failure mode of a mistake here is postage
 * and paper on somebody's doormat, and that cannot be recalled.
 *
 * A live send is only ever made when the caller asks for one AND the
 * environment allows it, so turning it on takes two deliberate acts rather
 * than one.
 */

export interface StannpRecipient {
  title?: string;
  firstname: string;
  lastname: string;
  company?: string;
  address1: string;
  address2?: string;
  city?: string;
  postcode: string;
  country?: string;
}

export interface StannpResult {
  ok: boolean;
  test: boolean;
  id?: number;
  pdf?: string;
  cost?: string;
  status?: string;
  error?: string;
}

const base = () => (process.env.STANNP_BASE_URL ?? "https://api-eu1.stannp.com/v1").replace(/\/+$/, "");
const key = () => (process.env.STANNP_API_KEY ?? "").trim();

export const stannpConfigured = () => Boolean(key());

/** True unless the environment plainly says otherwise. */
export const stannpTestMode = () => (process.env.STANNP_TEST_MODE ?? "true").toLowerCase() !== "false";

function auth(): string {
  return "Basic " + Buffer.from(`${key()}:`).toString("base64");
}

export async function stannpBalance(): Promise<{ ok: boolean; balance?: string; error?: string }> {
  if (!stannpConfigured()) return { ok: false, error: "No Stannp key on this environment." };
  try {
    const r = await fetch(`${base()}/accounts/balance`, { headers: { Authorization: auth() }, cache: "no-store" });
    const j = (await r.json()) as { success?: boolean; data?: { balance?: string }; error?: string };
    if (!j.success) return { ok: false, error: j.error ?? `Stannp answered ${r.status}.` };
    return { ok: true, balance: j.data?.balance };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Stannp." };
  }
}

/**
 * One postcard, printed from our own artwork.
 *
 * The address is NOT on our artwork: Stannp lays it down where its machines
 * expect it, so ours would be a second one in the wrong place. `padding: 0`
 * because we supply the bleed ourselves.
 */
export async function sendPostcard(input: {
  recipient: StannpRecipient;
  front: Uint8Array;
  back: Uint8Array;
  /** Ignored unless the environment also allows a live send. */
  live?: boolean;
  tags?: string;
}): Promise<StannpResult> {
  if (!stannpConfigured()) return { ok: false, test: true, error: "No Stannp key on this environment." };
  const test = stannpTestMode() || !input.live;

  const form = new FormData();
  form.set("size", "A6");
  form.set("padding", "0");
  form.set("test", test ? "true" : "false");
  if (input.tags) form.set("tags", input.tags);
  const r = input.recipient;
  form.set("recipient[title]", r.title ?? "");
  form.set("recipient[firstname]", r.firstname);
  form.set("recipient[lastname]", r.lastname);
  if (r.company) form.set("recipient[company]", r.company);
  form.set("recipient[address1]", r.address1);
  if (r.address2) form.set("recipient[address2]", r.address2);
  if (r.city) form.set("recipient[city]", r.city);
  form.set("recipient[postcode]", r.postcode);
  form.set("recipient[country]", r.country ?? "GB");
  form.set("front", new Blob([new Uint8Array(input.front)], { type: "application/pdf" }), "front.pdf");
  form.set("back", new Blob([new Uint8Array(input.back)], { type: "application/pdf" }), "back.pdf");

  try {
    const res = await fetch(`${base()}/postcards/create`, { method: "POST", headers: { Authorization: auth() }, body: form });
    const j = (await res.json()) as { success?: boolean; data?: { id?: number; pdf?: string; cost?: string; status?: string }; error?: string };
    if (!j.success) return { ok: false, test, error: j.error ?? `Stannp answered ${res.status}.` };
    return { ok: true, test, id: j.data?.id, pdf: j.data?.pdf, cost: j.data?.cost, status: j.data?.status };
  } catch (e) {
    return { ok: false, test, error: e instanceof Error ? e.message : "Could not reach Stannp." };
  }
}
