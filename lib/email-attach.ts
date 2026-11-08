import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { keyIsOurs, R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";

/**
 * Files from the OS's own store, attached to an email an agent sends
 * (James, 8 Nov 2026: "an attachment button ... from the file or from your
 * Downloads ... a PLC check that's failed, and they can attach that").
 *
 * Only keys we issued, at most five, 15MB between them - a mailbox refuses
 * more, and a refusal after Send is worse than one before it.
 */
export const ATTACH_MAX_FILES = 5;
export const ATTACH_MAX_BYTES = 15 * 1024 * 1024;

export type AttachIn = { key: string; name: string };

export async function loadAttachments(list: unknown): Promise<{ ok: true; files: { filename: string; content: string; contentType?: string }[] } | { ok: false; error: string }> {
  const items = (Array.isArray(list) ? list : [])
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : null))
    .filter((x): x is Record<string, unknown> => Boolean(x))
    .map((x) => ({ key: String(x.key ?? "").trim(), name: String(x.name ?? "").trim() || "Attachment" }))
    .filter((x) => x.key);
  if (!items.length) return { ok: true, files: [] };
  if (items.length > ATTACH_MAX_FILES) return { ok: false, error: `Attach up to ${ATTACH_MAX_FILES} files at a time.` };
  if (!r2Configured) return { ok: false, error: "File storage isn't connected here, so nothing can be attached." };
  let total = 0;
  const files: { filename: string; content: string; contentType?: string }[] = [];
  for (const it of items) {
    if (!keyIsOurs(it.key)) return { ok: false, error: `${it.name} isn't one of our files, so it can't be attached.` };
    try {
      const obj = await withR2((c) => c.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: it.key })));
      const bytes = await obj.Body?.transformToByteArray();
      if (!bytes) return { ok: false, error: `${it.name} couldn't be opened.` };
      total += bytes.byteLength;
      if (total > ATTACH_MAX_BYTES) return { ok: false, error: "The attachments are over 15MB together. Take one off, or send it as a link." };
      const ext = it.key.split(".").pop() ?? "";
      const filename = /\.[a-z0-9]{2,5}$/i.test(it.name) ? it.name : ext && ext.length <= 5 ? `${it.name}.${ext}` : it.name;
      files.push({ filename, content: Buffer.from(bytes).toString("base64"), contentType: obj.ContentType ?? undefined });
    } catch {
      return { ok: false, error: `${it.name} couldn't be read from the file store just now.` };
    }
  }
  return { ok: true, files };
}
