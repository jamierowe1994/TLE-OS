/**
 * WHAT A FILE MAY BE, decided in one place (10 Nov 2026).
 *
 * About one ticket in sixteen over three weeks was "it won't take my file",
 * and the causes were all the same shape: seven upload routes each judged a
 * file their own way. All of them went by the type the browser reported and
 * nothing else, so a file the browser could not name - a .heic on a Windows
 * PC, a Word document on a machine without Word, anything dragged out of some
 * mail programs - arrived with a blank type and was refused everywhere. The
 * .jfif fix (a JPEG under Windows' own name) reached two routes of the seven.
 * And each refusal had its own wording, most of which named neither the file
 * nor what would have been taken.
 *
 * So: the accepted types, the fallback to the file's extension, the picker's
 * `accept` and the refusal sentence all live here. No "server-only": a screen
 * runs the same check before it sends, so the reason shows on the row the
 * person is looking at without a round trip, and the server runs it again
 * because a browser is not a gatekeeper.
 */

const PDF = "application/pdf";
const JPEG = "image/jpeg";
const PNG = "image/png";
const WEBP = "image/webp";
const HEIC = "image/heic";
const DOC = "application/msword";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Evidence: a certificate, an ID, a reference. A PDF or a photograph of the real thing. */
export const EVIDENCE_TYPES: readonly string[] = [PDF, JPEG, PNG, WEBP, HEIC];
/** A paper on a file's Documents tab: evidence, or a Word document. */
export const PAPER_TYPES: readonly string[] = [...EVIDENCE_TYPES, DOC, DOCX];

/** A rule a file is judged by: the types taken and, where it matters, the size. */
export interface FileRule {
  types: readonly string[];
  maxBytes?: number;
}

/* --------------------------------------------------------------------------
   The type a file really is.
-------------------------------------------------------------------------- */

/** Names a browser or a mail program gives a type we know under another name. */
const ALIAS: Record<string, string> = {
  "image/jpg": JPEG,
  "image/pjpeg": JPEG,
  "image/jfif": JPEG,
  "image/x-png": PNG,
  "image/heif": HEIC,
  "image/heic-sequence": HEIC,
  "image/heif-sequence": HEIC,
  "application/x-pdf": PDF,
  "application/acrobat": PDF,
  "text/pdf": PDF,
};

/** .jfif, .jpe, .pjpeg and .pjp are plain JPEGs; Windows saves photos as .jfif by default. */
const JPEG_ALIAS = /\.(jfif|jpe|pjpeg|pjp)$/i;

/** The type each extension means, for a file whose browser said nothing useful. */
const BY_EXT: Record<string, string> = {
  pdf: PDF,
  jpg: JPEG, jpeg: JPEG, jfif: JPEG, jpe: JPEG, pjpeg: JPEG, pjp: JPEG,
  png: PNG,
  webp: WEBP,
  heic: HEIC, heif: HEIC,
  avif: "image/avif",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff", tiff: "image/tiff",
  svg: "image/svg+xml",
  doc: DOC,
  docx: DOCX,
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
  eml: "message/rfc822",
  msg: "application/vnd.ms-outlook",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

const extOf = (name: string) => (/\.([a-z0-9]{1,8})$/i.exec(name.trim())?.[1] ?? "").toLowerCase();

/** A type that says nothing: blank, or "some bytes". */
const says = (t: string) => Boolean(t) && t !== "application/octet-stream" && t !== "binary/octet-stream";

/**
 * The content type to keep a file under.
 *
 * The browser's word when it has one, put under the name we know it by; the
 * extension when it has none. A JPEG under another extension is image/jpeg
 * whatever the browser said. Given the types a route takes, an extension that
 * names one of them wins over a browser type that is not among them: Excel on
 * a PC reports a .csv as a spreadsheet, and the route that takes CSVs should
 * still take it.
 */
export function fileType(name: string, browserType?: string | null, taken?: readonly string[]): string {
  if (JPEG_ALIAS.test(name)) return JPEG;
  const raw = (browserType ?? "").split(";")[0].trim().toLowerCase();
  const said = ALIAS[raw] ?? raw;
  const byName = BY_EXT[extOf(name)] ?? "";
  if (!says(said)) return byName;
  if (taken && !taken.includes(said) && byName && taken.includes(byName)) return byName;
  return said;
}

/** "GSR 24.07.2027.jfif" -> "GSR 24.07.2027.jpg"; anything else as it was. REX judges a file by the extension on its link. */
export function storedName(name: string): string {
  return name.replace(JPEG_ALIAS, ".jpg");
}

/* --------------------------------------------------------------------------
   Saying it.
-------------------------------------------------------------------------- */

/** What each type is called, with its article. */
const CALLED: Record<string, string> = {
  [PDF]: "a PDF",
  [JPEG]: "a JPEG photo",
  [PNG]: "a PNG picture",
  [WEBP]: "a WebP picture",
  [HEIC]: "a HEIC photo (the iPhone's own format)",
  "image/avif": "an AVIF picture",
  "image/gif": "a GIF",
  "image/bmp": "a BMP picture",
  "image/tiff": "a TIFF scan",
  "image/svg+xml": "an SVG drawing",
  [DOC]: "a Word document",
  [DOCX]: "a Word document",
  "application/vnd.ms-excel": "an Excel spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "an Excel spreadsheet",
  "application/vnd.ms-powerpoint": "a PowerPoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "a PowerPoint",
  "text/csv": "a CSV",
  "text/plain": "a text file",
  "text/html": "a web page",
  "message/rfc822": "an email",
  "application/vnd.ms-outlook": "an Outlook email",
  "application/zip": "a zip folder",
  "application/x-zip-compressed": "a zip folder",
  "video/mp4": "a video",
  "video/quicktime": "a video",
};

/** The short name of each type taken, in the order they are said. */
const SHORT: [string, string][] = [
  [PDF, "PDF"],
  [DOCX, "Word document"],
  [DOC, "Word document"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel spreadsheet"],
  ["application/vnd.ms-excel", "Excel spreadsheet"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "PowerPoint"],
  ["application/vnd.ms-powerpoint", "PowerPoint"],
  ["text/csv", "CSV"],
  ["text/plain", "text file"],
  ["message/rfc822", "email"],
  ["application/vnd.ms-outlook", "email"],
  [JPEG, "JPEG"],
  [PNG, "PNG"],
  [WEBP, "WebP"],
  [HEIC, "HEIC"],
  ["image/avif", "AVIF"],
  ["image/gif", "GIF"],
  ["video/mp4", "MP4 video"],
  ["video/quicktime", "MOV video"],
];

const orList = (words: string[]) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`);

/** "a PDF, JPEG, PNG, WebP or HEIC": what a rule takes, in words. */
export function takenInWords(types: readonly string[]): string {
  const words: string[] = [];
  for (const [type, word] of SHORT) if (types.includes(type) && !words.includes(word)) words.push(word);
  if (!words.length) return "a file of the right kind";
  return `${/^(Excel|email|MP4|AVIF)/.test(words[0]) ? "an" : "a"} ${orList(words)}`;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)}MB`;

/**
 * Why this file will not be taken, as one sentence that names the file and
 * says what would be taken instead - or null when it will. The same words on
 * the screen (before it is sent) and from the server (when it is).
 */
export function fileRefusal(file: { name: string; type?: string | null; size?: number }, rule: FileRule): string | null {
  const name = file.name?.trim() || "That file";
  if (file.size === 0) return `${name} is empty (0 bytes), so there is nothing to keep. Check it opens, then upload it again.`;
  if (rule.maxBytes && typeof file.size === "number" && file.size > rule.maxBytes) {
    return `${name} is ${mb(file.size)} and the most that can go here is ${mb(rule.maxBytes)}. Save a smaller copy and upload that.`;
  }
  const type = fileType(file.name ?? "", file.type, rule.types);
  if (rule.types.includes(type)) return null;
  const taken = takenInWords(rule.types);
  const called = CALLED[type];
  if (called) return `${name} was not taken: it is ${called}, and this takes ${taken}. Save it as one of those and upload that.`;
  const ext = extOf(file.name ?? "");
  return `${name} was not taken: ${ext ? `a .${ext} file is not one this can keep` : "it has no file type we can tell"}. This takes ${taken}. Save it as one of those and upload that.`;
}

/** The outcome of judging a file: the type and name to keep it under, or the sentence to show. */
export type FileVerdict =
  | { ok: true; type: string; name: string }
  | { ok: false; error: string; status: 413 | 415 | 400 };

/** Judge a file against a rule. Every upload route's one question. */
export function judgeFile(file: { name: string; type?: string | null; size?: number }, rule: FileRule): FileVerdict {
  const error = fileRefusal(file, rule);
  if (!error) return { ok: true, type: fileType(file.name, file.type, rule.types), name: storedName(file.name) };
  const tooBig = Boolean(rule.maxBytes && typeof file.size === "number" && file.size > rule.maxBytes);
  return { ok: false, error, status: file.size === 0 ? 400 : tooBig ? 413 : 415 };
}

/* --------------------------------------------------------------------------
   The picker.
-------------------------------------------------------------------------- */

const EXT_FOR: Record<string, string[]> = {
  [PDF]: [".pdf"],
  [DOC]: [".doc"],
  [DOCX]: [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
  "message/rfc822": [".eml"],
  "application/vnd.ms-outlook": [".msg"],
  [JPEG]: [".jpg", ".jpeg", ".jfif"],
  [PNG]: [".png"],
  [WEBP]: [".webp"],
  "image/avif": [".avif"],
  "image/gif": [".gif"],
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
};

/**
 * The `accept` for a file input, from the same list the server judges by.
 *
 * Each type goes in by name AND by extension, so a file the computer cannot
 * name a type for (the blank-type case above) can still be chosen.
 *
 * One deliberate difference, and it is the photographs. Where a rule takes
 * phone photos (JPEG, PNG and HEIC), the picker says `image/*` rather than
 * listing them, for two reasons. An iPhone hands a page that asks for
 * `image/*` a JPEG, and hands one that names HEIC the HEIC itself - which the
 * certificate reader cannot open and a Windows PC cannot show. And `image/*`
 * is the one wording under which every desktop lets a .heic be chosen. The
 * cost is that a GIF or a TIFF can be chosen too; it is then refused by name
 * (fileRefusal), on the screen, before anything is sent.
 */
export function acceptFor(types: readonly string[]): string {
  const photos = types.includes(JPEG) && types.includes(PNG) && types.includes(HEIC);
  const out: string[] = [];
  for (const t of types) {
    if (photos && t.startsWith("image/")) continue;
    out.push(t, ...(EXT_FOR[t] ?? []));
  }
  if (photos) out.push("image/*", ".jfif");
  return [...new Set(out)].join(",");
}

/** A certificate, an ID, a reference: `accept` for the pickers that take evidence. */
export const ACCEPT_EVIDENCE = acceptFor(EVIDENCE_TYPES);
/** A paper on the Documents tab: evidence or Word. */
export const ACCEPT_PAPER = acceptFor(PAPER_TYPES);
