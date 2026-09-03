import { startVerification } from "@/lib/verification";

/**
 * The link that opens the recorder.
 *
 * James, 3 Sep: "when they click that button, it launches us directly into a
 * recording session." So the button does not point at a page behind the
 * sign-in door and hope. It carries a single-use token, minted for the
 * recipient's own address, that /api/record/enter swaps for a session before
 * sending them on to /record/<appraisal>. Opened on a laptop, that page
 * offers a code to scan; the code is another of these links, so the phone
 * signs in the same way.
 *
 * Without a database there is nothing to mint, and the plain page URL is
 * returned - the sign-in page brings them back to it afterwards.
 */
export function recordPagePath(appraisalId: string): string {
  return `/record/${encodeURIComponent(appraisalId)}`;
}

export async function mintRecordLink(opts: {
  email: string;
  appraisalId: string;
  origin: string;
}): Promise<string> {
  const base = opts.origin.replace(/\/+$/, "");
  try {
    const { token } = await startVerification(opts.email, "record", { keepOthers: true });
    return `${base}/api/record/enter?k=${encodeURIComponent(token)}&a=${encodeURIComponent(opts.appraisalId)}`;
  } catch {
    return `${base}${recordPagePath(opts.appraisalId)}`;
  }
}
