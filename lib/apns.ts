import "server-only";
import crypto from "node:crypto";
import http2 from "node:http2";

/**
 * Apple's push service, spoken directly (2 Oct 2026).
 *
 * No library: APNs is one HTTP/2 POST per notification, authorised by a
 * short ES256 token signed with the .p8 key from developer.apple.com > Keys.
 * The four settings come from the environment:
 *
 *   APNS_KEY_ID     the key's ten-character id
 *   APNS_TEAM_ID    the Apple Developer team id
 *   APNS_KEY_P8     the key file's text, BEGIN/END lines included (\n allowed)
 *   APNS_BUNDLE_ID  uk.co.thelettingexperts.os
 */

export function apnsConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_KEY_P8);
}

const HOSTS = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" } as const;
export type ApnsEnv = keyof typeof HOSTS;

/* Apple wants the token reused: a new one more often than every 20 minutes
   is throttled, and one older than an hour is refused. 50 minutes sits between. */
let cached: { jwt: string; at: number } | null = null;

function authToken(): string {
  if (cached && Date.now() - cached.at < 50 * 60_000) return cached.jwt;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "ES256", kid: process.env.APNS_KEY_ID });
  const iat = Math.floor(Date.now() / 1000);
  const body = b64({ iss: process.env.APNS_TEAM_ID, iat });
  const key = (process.env.APNS_KEY_P8 ?? "").replace(/\\n/g, "\n");
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  cached = { jwt: `${head}.${body}.${sig}`, at: Date.now() };
  return cached.jwt;
}

export interface PushMessage {
  title: string;
  body: string;
  /** A path in the OS the app opens when the notification is tapped. */
  href?: string | null;
  badge?: number;
}

export type PushResult = { token: string; ok: true } | { token: string; ok: false; status: number; reason: string; dead: boolean };

/** Send one message to several tokens of the same environment, over one connection. */
export async function sendPush(env: ApnsEnv, tokens: string[], msg: PushMessage): Promise<PushResult[]> {
  if (!tokens.length) return [];
  const client = http2.connect(HOSTS[env]);
  client.on("error", () => null);
  const payload = JSON.stringify({
    aps: { alert: { title: msg.title, body: msg.body }, sound: "default", ...(msg.badge != null ? { badge: msg.badge } : {}) },
    ...(msg.href ? { href: msg.href } : {}),
  });
  const auth = authToken();
  const topic = process.env.APNS_BUNDLE_ID || "uk.co.thelettingexperts.os";

  const one = (token: string) =>
    new Promise<PushResult>((resolve) => {
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        authorization: `bearer ${auth}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
      let status = 0;
      let data = "";
      req.setTimeout(15_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.on("response", (h) => (status = Number(h[":status"]) || 0));
      req.on("data", (c) => (data += c));
      req.on("end", () => {
        if (status === 200) return resolve({ token, ok: true });
        const reason = (() => {
          try {
            return String(JSON.parse(data).reason ?? "");
          } catch {
            return data.slice(0, 120);
          }
        })();
        /* 410 is Apple saying the app was removed; these two reasons say the
           token was never good for this app or this environment. */
        const dead = status === 410 || reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic";
        resolve({ token, ok: false, status, reason: reason || "No answer", dead });
      });
      req.on("error", (e) => resolve({ token, ok: false, status, reason: e.message, dead: false }));
      req.end(payload);
    });

  try {
    return await Promise.all(tokens.map(one));
  } finally {
    client.close();
  }
}
