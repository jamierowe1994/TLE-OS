import "server-only";
import { demoMode } from "./mode";

/**
 * NOTHING LEAVES THE DEMO (lib/demo/mode).
 *
 * The demo service is given none of the real keys, which already means it
 * cannot sign in to REX, PayProp, Propoly, Outlook, the email sender or the
 * text service. This is the second lock, for the day somebody copies a
 * variable across by mistake: in demo mode every outgoing request from the
 * server is checked against a short list of places it may go, and anything
 * else is refused before it is sent.
 *
 * An ALLOW list, not a block list. A block list is only as good as its
 * author's memory of every service the OS has ever talked to; an allow list
 * fails safe when a new one is added.
 *
 * Allowed: this server itself, public address lookups that hold no customer
 * data, and anything named in DEMO_ALLOW_HOSTS (comma separated) for a screen
 * James decides should work for real in the demo, such as Steve's AI.
 */

const ALWAYS = ["localhost", "127.0.0.1", "[::1]", "api.postcodes.io", "postcodes.io", "fonts.googleapis.com", "fonts.gstatic.com"];

export class DemoNetBlocked extends Error {}

function allowed(host: string): boolean {
  const h = host.toLowerCase();
  const own = [process.env.DEMO_ORIGIN, process.env.OS_ORIGIN, process.env.NEXT_PUBLIC_OS_ORIGIN, process.env.RAILWAY_PUBLIC_DOMAIN]
    .map((o) => (o ?? "").replace(/^https?:\/\//, "").replace(/[/:].*$/, "").toLowerCase())
    .filter(Boolean);
  const extra = (process.env.DEMO_ALLOW_HOSTS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return [...ALWAYS, ...own, ...extra].some((a) => h === a || h.endsWith(`.${a}`)) || h.endsWith(".localhost") || h.endsWith(".railway.internal");
}

const holder = globalThis as unknown as { __tleDemoNetGuard?: boolean };
const refused = new Set<string>();

/** Wrap the server's fetch once. Does nothing at all unless DEMO_MODE=1. */
export function installDemoNetGuard(): void {
  if (!demoMode() || holder.__tleDemoNetGuard) return;
  holder.__tleDemoNetGuard = true;
  const real = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let host = "";
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      host = new URL(url, "http://localhost").hostname;
    } catch {
      host = "";
    }
    if (host && !allowed(host)) {
      if (!refused.has(host)) {
        refused.add(host);
        console.warn(`[demo] refused a request to ${host}: the demo copy does not talk to outside systems`);
      }
      throw new DemoNetBlocked(`The demo copy does not talk to ${host}.`);
    }
    return real(input, init);
  }) as typeof fetch;
  console.log("[demo] DEMO_MODE is on: REX is the invented world, and outside requests are refused");
}

/**
 * The boot check: a demo must not be started holding live keys. Returns the
 * names of any that are set, so the caller can refuse to start and say which.
 */
export function liveKeysOnDemo(): string[] {
  if (!demoMode()) return [];
  const dangerous = [
    "REX_API_EMAIL", "REX_API_PASSWORD", "REX_ALLOW_WRITES", "RESEND_API_KEY", "RESEND_ALLOW_SEND",
    "PAYPROP_API_KEY", "PAYPROP_API_KEY_SCOTLAND", "PAYPROP_REFRESH_TOKEN", "PAYPROP_CLIENT_ID", "PAYPROP_CLIENT_SECRET",
    "PROPOLY_API_KEY", "PROPOLY_PASSWORD", "DOCUSEAL_API_KEY", "DOCUSEAL_ALLOW_SEND", "TWILIO_AUTH_TOKEN", "AZURE_CLIENT_SECRET",
    "FLATFAIR_API_TOKEN", "STANNP_API_KEY", "GHL_API_TOKEN", "META_SYSTEM_TOKEN", "APNS_KEY_P8", "VAPID_PRIVATE_KEY",
    "R2_SECRET_ACCESS_KEY", "WEBSITE_API_TOKEN", "TEG_HUB_API_SECRET", "MARKETING_WEBHOOK_URL", "GITHUB_TICKETS_TOKEN", "CLAUDE_TICKETS_ROUTINE_TOKEN",
  ];
  return dangerous.filter((k) => (process.env[k] ?? "").trim());
}
