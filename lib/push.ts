import "server-only";
import { q } from "@/lib/db";
import crypto from "node:crypto";
import { apnsConfigured, sendPush, type ApnsEnv, type PushMessage } from "@/lib/apns";
import { sendWebPush, webPushConfigured } from "@/lib/web-push";
import { noticesFor, seenAt } from "@/lib/notifications";
import { findUserById } from "@/lib/users";
import { switchOn } from "@/lib/switches";

/**
 * The bell, in the agent's pocket (2 Oct 2026).
 *
 * Nothing new decides what is worth a buzz: whatever the bell would show
 * (lib/notifications) is what the phone is sent. Every five minutes the scan
 * reads each phone owner's bell and sends what has arrived since their last
 * send. The first scan for a person only sets the marker, so installing the
 * app never replays a fortnight of history at them.
 *
 * Two roads to a phone, one list of them (os_push_devices): Apple's push
 * service for the iPhone app (lib/apns), and Web Push for the app installed
 * from the browser on an iPhone or an Android (lib/web-push).
 *
 * Behind the "phone_alerts" switch. A test to your own phone is not.
 */

/** Either road is set up on this environment. */
export const pushConfigured = () => apnsConfigured() || webPushConfigured();

const SENT_KEY = "push.sent_at";
/** More than this in one scan arrives as one line saying how many. */
const MAX_EACH = 3;

export async function registerDevice(userId: string, d: { token: string; platform: string; env: ApnsEnv; appVersion: string }): Promise<void> {
  /* A phone handed to a colleague takes its token with it: the row follows
     whoever registered it last, never both. */
  await q(
    `INSERT INTO os_push_devices (token, user_id, platform, env, app_version)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
       env = EXCLUDED.env, app_version = EXCLUDED.app_version, seen_at = NOW()`,
    [d.token, userId, d.platform, d.env, d.appVersion]
  );
}

/** The browser's subscription. Keyed by a hash of its endpoint, which is long and unguessable but not ours to print. */
export async function registerWebSubscription(userId: string, s: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
  const token = crypto.createHash("sha256").update(s.endpoint).digest("hex");
  await q(
    `INSERT INTO os_push_devices (token, user_id, platform, env, endpoint, p256dh, auth)
     VALUES ($1, $2, 'web', 'web', $3, $4, $5)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, endpoint = EXCLUDED.endpoint,
       p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, seen_at = NOW()`,
    [token, userId, s.endpoint, s.p256dh, s.auth]
  );
}

export async function forgetWebSubscription(userId: string, endpoint: string): Promise<void> {
  const token = crypto.createHash("sha256").update(endpoint).digest("hex");
  await q(`DELETE FROM os_push_devices WHERE token = $1 AND user_id = $2`, [token, userId]);
}

type Device = { token: string; env: string; endpoint: string | null; p256dh: string | null; auth: string | null };

async function devicesOf(userId: string): Promise<Device[]> {
  return q<Device>(`SELECT token, env, endpoint, p256dh, auth FROM os_push_devices WHERE user_id = $1`, [userId]);
}

/** Send to every phone a person has, forgetting the ones Apple says are gone. */
export async function pushTo(userId: string, msg: PushMessage): Promise<{ sent: number; failed: string[] }> {
  const devices = await devicesOf(userId);
  let sent = 0;
  const failed: string[] = [];
  const forget = (token: string) => q(`DELETE FROM os_push_devices WHERE token = $1`, [token]);
  if (apnsConfigured()) {
    for (const env of ["production", "sandbox"] as const) {
      const results = await sendPush(env, devices.filter((d) => d.env === env).map((d) => d.token), msg);
      for (const r of results) {
        if (r.ok) sent++;
        else {
          failed.push(`${r.status} ${r.reason}`);
          if (r.dead) await forget(r.token);
        }
      }
    }
  }
  if (webPushConfigured()) {
    for (const d of devices.filter((x) => x.env === "web" && x.endpoint && x.p256dh && x.auth)) {
      const r = await sendWebPush({ endpoint: d.endpoint!, p256dh: d.p256dh!, auth: d.auth! }, msg);
      if (r.ok) sent++;
      else {
        failed.push(`${r.status} ${r.reason}`);
        if (r.dead) await forget(d.token);
      }
    }
  }
  return { sent, failed };
}

async function readMarker(userId: string): Promise<string | null> {
  const rows = await q<{ value: unknown }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, SENT_KEY]);
  const v = rows[0]?.value;
  return typeof v === "string" ? v : null;
}

async function writeMarker(userId: string, at: string): Promise<void> {
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, SENT_KEY, JSON.stringify(at)]
  );
}

export interface ScanReport {
  ok: boolean;
  armed: boolean;
  people: number;
  sent: number;
  started: number;
  errors: string[];
}

export async function scanAndPush(): Promise<ScanReport> {
  const report: ScanReport = { ok: true, armed: false, people: 0, sent: 0, started: 0, errors: [] };
  if (!pushConfigured()) return { ...report, ok: false, errors: ["Neither APNs nor Web Push is set up on this environment."] };
  report.armed = await switchOn("phone_alerts");
  if (!report.armed) return report;

  const owners = await q<{ user_id: string }>(`SELECT DISTINCT user_id FROM os_push_devices`);
  for (const { user_id } of owners) {
    try {
      const me = await findUserById(user_id);
      if (!me) continue;
      report.people++;
      const [notices, marker, seen] = await Promise.all([noticesFor(me, 40), readMarker(user_id), seenAt(user_id)]);
      const newest = notices[0]?.at ?? new Date().toISOString();
      if (!marker) {
        await writeMarker(user_id, newest);
        report.started++;
        continue;
      }
      const fresh = notices.filter((n) => n.at > marker);
      if (!fresh.length) continue;
      /* The badge is the bell's own unread count, so the two always agree. */
      const badge = seen ? notices.filter((n) => n.at > seen).length : notices.length;
      const each = fresh.length > MAX_EACH ? [] : fresh;
      for (const n of each) {
        const r = await pushTo(user_id, { title: n.title, body: n.body, href: n.href, badge });
        report.sent += r.sent;
        report.errors.push(...r.failed);
      }
      if (!each.length) {
        const r = await pushTo(user_id, { title: `${fresh.length} New Updates`, body: fresh[0]!.title, href: "/app", badge });
        report.sent += r.sent;
        report.errors.push(...r.failed);
      }
      await writeMarker(user_id, fresh[0]!.at);
    } catch (e) {
      report.errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return report;
}
