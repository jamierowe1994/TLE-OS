/**
 * Files on an email written in the OS (Stuart Roper, 18 Nov 2026: "when you are
 * in OS and send an email to LL or tenant can we have a button to attach
 * files?"). Client-safe: the Write an Email window uses the same limits to say
 * no before Send, and /api/messages/send checks again.
 *
 * ── Why 3MB matters ───────────────────────────────────────────────────────
 *
 * Microsoft's sendMail takes the whole message in one request of at most 4MB,
 * base64 and all, and anything bigger needs a draft and an upload session -
 * which needs Mail.ReadWrite, a permission nobody's connection has (lib/microsoft
 * SCOPES), so every agent would have to reconnect Outlook. Up to MAILBOX_MAX the
 * email goes from their own Outlook as now; above it lib/send-as-agent sends it
 * from The Letting Experts with their address to reply to, and the window says
 * so before they press Send.
 */

export interface MailFile {
  filename: string;
  /** Base64. */
  content: string;
  contentType?: string;
}

export const MAX_FILES = 10;
export const MAX_TOTAL = 20 * 1024 * 1024;
export const MAILBOX_MAX = 3 * 1024 * 1024;

/** Things that run when opened. A landlord's mail server bins the whole email for one of these anyway. */
const BLOCKED = /\.(exe|bat|cmd|com|msi|scr|js|jse|vbs|vbe|ps1|sh|jar|app|dmg|apk|lnk|hta|cpl|reg|iso)$/i;

export const bytesOfBase64 = (b64: string) => {
  const len = b64.length;
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - pad);
};

export const totalBytes = (files: Array<Pick<MailFile, "content">>) => files.reduce((n, f) => n + bytesOfBase64(f.content), 0);

export function sizeWords(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

export function fileRefusal(name: string): string | null {
  if (BLOCKED.test(name)) return `${name} is a kind of file that runs when it is opened, so it can't go on an email.`;
  return null;
}

export function checkAttachments(raw: unknown, o: { onlyPdf?: boolean } = {}): { ok: true; files: MailFile[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: true, files: [] };
  if (raw.length > MAX_FILES) return { ok: false, error: `Up to ${MAX_FILES} files can go on one email.` };
  const files: MailFile[] = [];
  for (const f of raw as Array<Partial<MailFile>>) {
    const filename = String(f?.filename ?? "").replace(/[\\/\r\n\t"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
    const content = String(f?.content ?? "");
    if (!filename || !content || !/^[A-Za-z0-9+/=]+$/.test(content)) return { ok: false, error: "One of the files couldn't be read. Take it off and attach it again." };
    const no = fileRefusal(filename);
    if (no) return { ok: false, error: no };
    const contentType = String(f?.contentType ?? "").slice(0, 120) || "application/octet-stream";
    if (o.onlyPdf && !(contentType === "application/pdf" && /\.pdf$/i.test(filename))) return { ok: false, error: "Only a report can be attached for you just now." };
    files.push({ filename, content, contentType });
  }
  const total = totalBytes(files);
  if (total > MAX_TOTAL) return { ok: false, error: `The files come to ${sizeWords(total)}; ${sizeWords(MAX_TOTAL)} is the most one email can carry.` };
  return { ok: true, files };
}
