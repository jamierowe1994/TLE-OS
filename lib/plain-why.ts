import type { Problem } from "@/lib/toast";

/**
 * Why something didn't work, in the plainest words we have (James, 8 Nov
 * 2026). The server's own sentence wins when it gave one: our routes are
 * written to answer in plain English ("That listing has no EPC"). Otherwise
 * the status and the address say enough to name what went wrong and whose
 * end it is.
 */

/** Which outside system an address talks to, for "X didn't answer". */
function systemFor(url: string): string | null {
  if (/\/api\/(rex|diary)/.test(url)) return "REX";
  if (/\/api\/(propoly|pretenancy|handover|lets?\b|let-)/.test(url)) return "Propoly";
  if (/\/api\/(listings\/publish|portal)/.test(url)) return "the property portals";
  if (/\/api\/payprop/.test(url)) return "PayProp";
  if (/\/api\/(docuseal|esign|contracts)/.test(url)) return "DocuSeal";
  if (/\/api\/(email|confirmations|send|graph|outlook)/.test(url)) return "the email service";
  if (/\/api\/(plc|flatfair)/.test(url)) return "the referencing service";
  if (/\/api\/(upload|media|files|documents)/.test(url)) return "file storage";
  return null;
}

/** The words a route sent back, if it sent any worth showing. */
export function serverWords(j: unknown): string | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  for (const k of ["error", "said", "detail", "message", "problem", "reason"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim() && v.length < 400 && !/^(internal|error|failed|bad request)$/i.test(v.trim())) return v.trim();
  }
  return null;
}

export function explainFailure(f: {
  action: string;
  url: string;
  method: string;
  status: number | null;
  said: string | null;
}): Problem {
  const sys = systemFor(f.url);
  const technical = `${f.method} ${f.url} ${f.status == null ? "never answered" : `came back ${f.status}`}${f.said ? ` - "${f.said}"` : ""}`;
  const tryAgain = "Try it again in a minute. If it still won't go, send it to us below and we'll look at it.";
  let why: string;
  let next = tryAgain;
  if (f.status == null) {
    why = "Your connection dropped before it reached us, so nothing was saved or sent.";
    next = "Check you're online, then try again.";
  } else if (f.said) {
    why = /[.!?]$/.test(f.said) ? f.said : `${f.said}.`;
    next = f.status >= 500 ? tryAgain : "Put that right and try again. If it doesn't make sense, send it to us below.";
  } else if (f.status === 403) {
    why = "Your account isn't allowed to do this one.";
    next = "Ask James or Howard if you think it should be.";
  } else if (f.status === 404) {
    why = "We couldn't find the record this belongs to. It may have been removed or moved.";
    next = "Refresh the page and try again.";
  } else if (f.status === 409) {
    why = "Someone else changed this at the same time, so we didn't overwrite their change.";
    next = "Refresh the page to see the latest, then try again.";
  } else if (f.status === 413) {
    why = "That file is too big to send.";
    next = "Try a smaller file, or a PDF instead of photos.";
  } else if (f.status === 429) {
    why = sys ? `${sys} has asked us to slow down for a moment.` : "Too many things were asked for at once.";
    next = "Wait a minute and try again.";
  } else if (f.status === 502 || f.status === 503 || f.status === 504) {
    why = sys ? `${sys} didn't answer us in time, so this didn't go through.` : "A system we rely on didn't answer in time, so this didn't go through.";
  } else if (f.status >= 500) {
    why = sys
      ? `Something broke on our side while talking to ${sys}. It isn't anything you did.`
      : "Something broke on our side while doing this. It isn't anything you did.";
  } else {
    why = "We couldn't do that with what was filled in.";
    next = "Check the details and try again. If it doesn't make sense, send it to us below.";
  }
  return { action: f.action, why, next, technical };
}
