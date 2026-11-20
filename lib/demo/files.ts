import "server-only";
import { hasDb, q } from "@/lib/db";
import { r2Configured } from "@/lib/r2";
import { demoMode } from "./mode";

/**
 * FILES ON THE DEMO COPY, WITHOUT R2 (lib/demo/mode, 20 Nov 2026).
 *
 * The demo service holds no storage keys (lib/demo/net-guard refuses to boot
 * with them), so a screen that keeps a file had nowhere to put it. The
 * Scottish rent review makes a notice and takes market evidence, and the
 * demo must show both on the desk afterwards. So on the demo, and only
 * there, those files are kept in its own database under the same key R2
 * would have used, and /api/r2/file hands them back. The nightly reset
 * empties the table with the rest (lib/demo/seed resetDemo).
 *
 * Never on live: off unless DEMO_MODE=1 and R2 is not configured.
 */

export const demoFilesOn = () => demoMode() && !r2Configured && hasDb();

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_demo_files (
      key TEXT PRIMARY KEY,
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      bytes BYTEA NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).then(() => undefined).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/* A demo is a walk-through, not a store: one file is capped at 10MB. */
const MAX = 10 * 1024 * 1024;

export async function putDemoFile(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  if (!demoFilesOn()) throw new Error("Demo file storage is only for the demo copy.");
  if (bytes.length > MAX) throw new Error("Too big for the demo copy.");
  await ensure();
  await q(
    `INSERT INTO os_demo_files (key, content_type, bytes) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET content_type = EXCLUDED.content_type, bytes = EXCLUDED.bytes, at = NOW()`,
    [key, contentType, Buffer.from(bytes)]
  );
}

export async function getDemoFile(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!demoFilesOn()) return null;
  await ensure();
  const [row] = await q<{ bytes: Buffer; content_type: string }>(`SELECT bytes, content_type FROM os_demo_files WHERE key = $1`, [key]);
  return row ? { bytes: row.bytes, contentType: row.content_type } : null;
}
