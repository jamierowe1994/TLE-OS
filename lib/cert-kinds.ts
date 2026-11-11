import { expiryFromIssue, filesOnIssueDate, lifeInWords } from "@/lib/cert-life";

/**
 * THE CERTIFICATES SOMEBODY CAN FILE, and when the form is ready to file one
 * (10 Nov 2026). Client-safe: every screen that files a certificate draws its
 * list and greys its button from here, and the server reads the same list.
 *
 * Two things had drifted between the screens.
 *
 * THE LIST. Each screen kept its own copy, and all of them offered one
 * "Fire safety". The office looks for the thing by its name - a Fire Risk
 * Assessment, an Emergency Lighting certificate - did not find it, and
 * reported that the OS will not take it. Both are offered by name now.
 *
 * They are not two new slots, and that is deliberate. REX's compliance types
 * have ONE for the fire family ("Emergency lighting / fire exit",
 * emergency_lighting_fire_exit; read from its schema on 8 Oct 2026) and none
 * for a fire risk assessment, so a slot of its own could not be saved there.
 * The book counts one fire duty on an HMO, met by the newest of them, and
 * splitting that would change the Outstanding figure on Compliance - a
 * decision for James and Michael, not a side effect of a dropdown. So each
 * named kind files AS the fire type, and its name goes on the record with it
 * (the source line, and REX's note), the way an EIC is filed as the EICR.
 *
 * THE RULE. A PAT report and the fire family print the day they were done and
 * no expiry. The property file learned that on 1 Nov 2026 and the server has
 * taken the issue date alone since; the listing, the tracker, the job sheet
 * and the contractor's page still greyed their button until an expiry was
 * typed, and said nothing about why. One rule now, with its reason in words.
 */

export interface CertKind {
  /** What the picker sends. A REX compliance type id, or a named kind below. */
  id: string;
  label: string;
  /** The REX compliance type it is filed as, when the id is a name of ours. */
  filesAs?: string;
}

export const CERT_KINDS: CertKind[] = [
  { id: "gas_safety", label: "Gas safety (CP12)" },
  { id: "eicr", label: "EICR" },
  { id: "epc", label: "EPC" },
  { id: "mandatory_hmo_license", label: "HMO licence" },
  { id: "additional_hmo_license", label: "HMO licence (additional)" },
  { id: "selective_hmo_license", label: "Selective licence" },
  { id: "legionella_risk_assessment", label: "Legionella risk assessment" },
  { id: "portable_appliance_testing", label: "PAT" },
  { id: "smoke_alarms", label: "Smoke alarms" },
  { id: "co_alarms", label: "CO alarms" },
  { id: "fire_risk_assessment", label: "Fire risk assessment", filesAs: "emergency_lighting_fire_exit" },
  { id: "emergency_lighting", label: "Emergency lighting", filesAs: "emergency_lighting_fire_exit" },
  { id: "emergency_lighting_fire_exit", label: "Fire alarm or other fire safety" },
];

const BY_ID = new Map(CERT_KINDS.map((k) => [k.id, k]));

/** The fire family, as a picker offers it wherever one "Fire safety" used to stand. */
export const FIRE_KINDS: CertKind[] = CERT_KINDS.filter((k) => (k.filesAs ?? k.id) === "emergency_lighting_fire_exit");

/** id -> label, for a `<select>` or a "Reads as" line. */
export const CERT_KIND_LABEL: Record<string, string> = Object.fromEntries(CERT_KINDS.map((k) => [k.id, k.label]));

/** The REX compliance type a picked kind is filed as. Anything unknown comes back as it was. */
export const certFilesAs = (id: string): string => BY_ID.get(id)?.filesAs ?? id;

/** The name to keep on the record when the pick was one of ours ("Fire risk assessment"), else null. */
export const certNamedAs = (id: string): string | null => (BY_ID.get(id)?.filesAs ? BY_ID.get(id)!.label : null);

/**
 * WHICH FIRE CERTIFICATE IT IS, READ BACK (11 Nov 2026, Lianna Denholm,
 * ticket 24053535: "I have uploaded a Fire risk assessment ... the system
 * thinks its an emergency lighting/fire extinguisher"). The name was kept on
 * the record when it was filed, but no screen read it back: they read REX's
 * type, so a fire risk assessment came back as "Emergency lighting / fire
 * exit". Every screen that names a fire certificate asks here now.
 *
 * Where the name lives, best first:
 *   - the source line, "Fire risk assessment, we uploaded it, ..." - the
 *     kind picked by name since 10 Nov (fileCertificate in lib/certificate-intake)
 *   - REX's note on the entry, which the OS writes as "Written by TLE OS from
 *     <source> (<file name>)." - so it carries both
 *   - the file's own name, for what was filed before the name was kept: the
 *     fire slot on the live book is almost all "FRA 16062025.pdf" and
 *     "Fire Risk Assessment ... .pdf" (30 of 32 OS records, 11 Nov 2026)
 * A picked name wins over a guess from a file name. A file name that says
 * both, or neither, names nothing, and the screen says "Fire safety" - never
 * one it cannot stand behind. Naming only: what an HMO owes and what counts
 * as outstanding are untouched (one fire duty, as before).
 */
export const FIRE_TYPE = "emergency_lighting_fire_exit";
export const FIRE_SAFETY = "Fire safety";
const FRA_LABEL = BY_ID.get("fire_risk_assessment")!.label;
const EL_LABEL = BY_ID.get("emergency_lighting")!.label;
const PICKED = [FRA_LABEL, EL_LABEL];
const SAYS_FRA = /fire[\s_.-]*risk|fire[\s_.-]*assess|(?:^|[^a-z])fra(?:[^a-z]|$)/i;
const SAYS_EL = /emergency[\s_.-]*light/i;

/** "Fire risk assessment", "Emergency lighting", or null when nothing given says which. */
export function fireKindIn(...texts: (string | null | undefined)[]): string | null {
  const given = texts.map((t) => (t ?? "").trim()).filter(Boolean);
  /* The kind somebody picked: the source line starts with it, and REX's note carries it after "from ". */
  for (const t of given) {
    const picked = PICKED.find((label) => t.startsWith(`${label},`) || t.includes(`from ${label},`));
    if (picked) return picked;
  }
  for (const t of given) {
    const fra = SAYS_FRA.test(t);
    const el = SAYS_EL.test(t);
    if (fra !== el) return fra ? FRA_LABEL : EL_LABEL;
  }
  return null;
}

/** What to call one certificate: its fire kind where the record says, else `fallback`. */
export const certNameFor = (type: string, fallback: string, ...texts: (string | null | undefined)[]): string =>
  type === FIRE_TYPE ? fireKindIn(...texts) ?? FIRE_SAFETY : fallback;

/** Filed on the day it was tested or checked, with no expiry of its own: PAT and the fire family. */
export const kindFilesOnIssueDate = (id: string): boolean => filesOnIssueDate(certFilesAs(id));

/** "tested" for a PAT, "checked" for the fire family. */
const doneWord = (id: string) => (certFilesAs(id) === "portable_appliance_testing" ? "tested" : "checked");

/**
 * Why the File button is greyed, as a line to show under it - or null when it
 * is ready. `eic` is the property file's and the listing's "EIC in place of
 * an EICR" pick, which needs its issue date and its reason.
 */
export function certNotReadyBecause(p: { type: string; expiry: string; issue: string; file?: unknown; needsFile?: boolean; eic?: { reason: string } | null }): string | null {
  if (!p.type) return "Choose what type of certificate it is to file it.";
  if (p.eic) {
    if (!p.issue) return "Put in the date the EIC was issued to file it.";
    if (!p.eic.reason) return "Say why it is an EIC - a new build or a full rewire - to file it.";
  } else if (kindFilesOnIssueDate(p.type)) {
    if (!p.expiry && !p.issue) return `Put in the date it was ${doneWord(p.type)} to file it. It has no expiry date, so that is all it needs.`;
  } else if (!p.expiry) {
    return "Put in the date it runs out to file it.";
  }
  if (p.needsFile && !p.file) return "Choose the file to put it on.";
  return null;
}

/**
 * The line that explains a kind with no expiry, once it is picked: what it
 * is filed on and how long it counts for. Null for every other kind, and once
 * an expiry has been typed anyway.
 */
export function noExpiryNote(type: string, issue: string, expiry: string, day: (ymd: string) => string): string | null {
  if (!kindFilesOnIssueDate(type) || expiry) return null;
  const filesAs = certFilesAs(type);
  const until = issue ? expiryFromIssue(filesAs, issue) : null;
  /* Called by its own name when one was picked (11 Nov 2026, ticket 24053535). */
  const what = filesAs === "portable_appliance_testing" ? "A PAT report" : type === "fire_risk_assessment" ? "A fire risk assessment" : type === "emergency_lighting" ? "An emergency lighting certificate" : "A fire safety certificate";
  return `${what} has no expiry date, so it is filed on the day it was ${doneWord(type)} and counts for ${lifeInWords(filesAs) ?? "a year"}${until ? `, to ${day(until)}` : ""}.`;
}
