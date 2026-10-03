import "server-only";
import crypto from "node:crypto";

/**
 * Web Push, spoken directly (2 Oct 2026) - the alerts for the app when it is
 * installed from the browser (app/app/install) rather than as the iPhone app.
 * Apple (iPhone home-screen apps, iOS 16.4 on), Google (Android, Chrome) and
 * Mozilla all take the same thing: one POST to the subscription's endpoint,
 * the message encrypted to the phone's own key (RFC 8291, aes128gcm), and a
 * short ES256 token saying it is us (VAPID, RFC 8292). No library: it is
 * fifty lines of node:crypto, the same as lib/apns.
 *
 *   VAPID_PUBLIC_KEY   the public key, base64url, 65 bytes uncompressed
 *   VAPID_PRIVATE_KEY  the private key, base64url, 32 bytes
 *   VAPID_SUBJECT      who to contact about our pushes (default https://tle-os.co.uk)
 */

export function webPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export interface WebSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const b64u = (b: Buffer) => b.toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url");
const hmac = (key: Buffer, data: Buffer) => crypto.createHmac("sha256", key).update(data).digest();

/** RFC 8291: the message, encrypted so only that phone can read it. */
export function encryptForSubscription(payload: Buffer, sub: { p256dh: string; auth: string }, salt = crypto.randomBytes(16)): Buffer {
  const uaPublic = unb64u(sub.p256dh);
  const authSecret = unb64u(sub.auth);
  const ecdh = crypto.createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  /* One record, so it ends with the 0x02 "last record" delimiter. */
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** RFC 8292: a token, signed with our private key, for the push service at `audience`. */
function vapidToken(audience: string): string {
  const pub = unb64u(process.env.VAPID_PUBLIC_KEY ?? "");
  const key = crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: process.env.VAPID_PRIVATE_KEY ?? "", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const head = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(
    Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT || "https://tle-os.co.uk" }))
  );
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${claims}.${b64u(sig)}`;
}

export interface WebPushMessage {
  title: string;
  body: string;
  href?: string | null;
  badge?: number;
}

export type WebPushResult = { ok: true } | { ok: false; status: number; reason: string; dead: boolean };

export async function sendWebPush(sub: WebSubscription, msg: WebPushMessage): Promise<WebPushResult> {
  const audience = new URL(sub.endpoint).origin;
  const body = encryptForSubscription(Buffer.from(JSON.stringify(msg)), sub);
  try {
    const r = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        authorization: `vapid t=${vapidToken(audience)}, k=${process.env.VAPID_PUBLIC_KEY}`,
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        ttl: String(24 * 3600),
        urgency: "high",
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (r.ok) return { ok: true };
    const reason = (await r.text().catch(() => "")).slice(0, 160) || r.statusText;
    /* 404 and 410 are the service saying this subscription is gone for good. */
    return { ok: false, status: r.status, reason, dead: r.status === 404 || r.status === 410 };
  } catch (e) {
    return { ok: false, status: 0, reason: e instanceof Error ? e.message : String(e), dead: false };
  }
}
