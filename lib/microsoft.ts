import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { rexCall, rexConfigured } from "@/lib/rex";

/**
 * MICROSOFT 365, PER AGENT — so an email to a landlord is genuinely from them.
 *
 * Adapted from the working integration in TEG-Paid-Ads-platform (Launch Pad),
 * which already does this for lead emails. Same Azure app registration, same
 * tenant, same delegated model. Two differences, both deliberate:
 *
 *   • Mail.Read is added. Launch Pad only ever sends; James asked to read the
 *     thread back, and that is the permission that allows it. It is delegated,
 *     so it reaches one mailbox — the one whose owner personally consented —
 *     and never the tenant's mail at large.
 *   • The redirect URI is this app's, which must be added to the SAME app
 *     registration in Azure. An app registration may hold several.
 *
 * ── Why Graph and not REX, when REX can already send ─────────────────────
 *
 * REX sends with the agent's address in the From, through its own provider.
 * The message therefore never touches their mailbox: it is not in Sent Items,
 * and when the landlord replies, that reply lands in Outlook with nothing to
 * attach it to. You end up holding half a conversation in each system, which
 * is the one outcome the request was trying to avoid.
 *
 * Graph sends from the mailbox itself. The sent copy is in Sent Items, the
 * reply threads onto it, and Mail.Read can then read both halves.
 *
 * We keep REX's timeline anyway by BCC-ing the agent's own REX email dropbox
 * (see rexDropboxFor). Nothing is lost by moving the send.
 *
 * Env (Railway):
 *   AZURE_CLIENT_ID     — the app registration's Application (client) ID
 *   AZURE_TENANT_ID     — the Directory (tenant) ID
 *   AZURE_CLIENT_SECRET — the secret VALUE. IT EXPIRES. Diary it.
 *   AZURE_REDIRECT_URI  — optional override for local testing
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

/** The CSRF nonce cookie, shared by the start and callback routes. It lives
 *  here because a Next route file may export only handlers and config — an
 *  exported constant there fails the build with a type error about `never`. */
export const MS_STATE_COOKIE = "os_ms_state";

/**
 * THIS STRING AND THE AZURE APP MUST AGREE.
 *
 * Changing it re-prompts every already-connected agent for consent, and asking
 * for a scope the app registration does not hold fails at the consent screen
 * with an error most people will read as "it's broken". So it is settled once,
 * before anybody connects, rather than edited later.
 *
 * Beyond Launch Pad's set:
 *   Mail.Read           read the thread back, not just send it
 *   Calendars.ReadWrite create, change and delete events in THEIR OWN diary —
 *                       which is what closes the gap the OS already admits to
 *                       in five places ("it has NOT been added to your 365
 *                       diary"). Sending a viewing invite is part of creating
 *                       the event, so it needs nothing further.
 *   MailboxSettings.Read their working hours and time zone. Cheap, and without
 *                       it a viewing eventually gets booked at the wrong local
 *                       time — a bug that is miserable to trace after the fact.
 *
 * Deliberately NOT here: Calendars.ReadWrite.Shared. James, 30 Aug — nobody
 * books into anybody else's diary, so the wider grant would be asked for and
 * never used. Add it the day that changes, not before.
 */
const SCOPES =
  "openid profile email offline_access User.Read Mail.Send Mail.Read Calendars.ReadWrite MailboxSettings.Read";

const DEFAULT_REDIRECT = "https://tle-os.co.uk/api/auth/microsoft/callback";

export function msConfigured(): boolean {
  return !!(
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_TENANT_ID &&
    process.env.AZURE_CLIENT_SECRET
  );
}

export function msRedirectUri(): string {
  return process.env.AZURE_REDIRECT_URI ?? DEFAULT_REDIRECT;
}

function tokenEndpoint(): string {
  return `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;
}

/** Where to send them to sign in and consent. `state` is our CSRF nonce. */
export function msAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: msRedirectUri(),
    response_mode: "query",
    scope: SCOPES,
    state,
    /* Always ask which account. Several of these people hold more than one
       Microsoft login, and a silent sign-in with the wrong one connects the
       wrong mailbox — which nobody notices until an email comes from it. */
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize?${p}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID ?? "",
      client_secret: process.env.AZURE_CLIENT_SECRET ?? "",
      redirect_uri: msRedirectUri(),
      scope: SCOPES,
      ...params,
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? `Microsoft token error ${res.status}`);
  }
  return data;
}

export function msExchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "authorization_code", code });
}

/* ─────────────────── the stored refresh token ─────────────────── */

/**
 * Sealed exactly like the REX token beside it: a refresh token is a bearer
 * credential for somebody's MAILBOX, which is a good deal worse to leak than a
 * CRM session. Same AES-GCM, different salt, so one key cannot open the other.
 */
function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set — refusing to store mailbox tokens without it.");
  return scryptSync(secret, "os-ms-token", 32);
}

function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

function open(sealed: string): string | null {
  try {
    const [iv, tag, enc] = sealed.split(".");
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export interface MsConnection {
  connected: boolean;
  /** The mailbox they actually connected, which may not be their OS email. */
  email: string | null;
  connectedAt: string | null;
}

export async function msConnectionFor(userId: string): Promise<MsConnection> {
  if (!hasDb() || !userId) return { connected: false, email: null, connectedAt: null };
  const rows = await q<{ ms_email: string; connected_at: string }>(
    `SELECT ms_email, connected_at FROM os_ms_tokens WHERE user_id = $1`,
    [userId]
  );
  const row = rows[0];
  return row
    ? { connected: true, email: row.ms_email, connectedAt: new Date(row.connected_at).toISOString() }
    : { connected: false, email: null, connectedAt: null };
}

/** Everyone connected, for the pre-launch board. No tokens leave this file. */
export async function msConnections(): Promise<Map<string, MsConnection>> {
  const out = new Map<string, MsConnection>();
  if (!hasDb()) return out;
  const rows = await q<{ user_id: string; ms_email: string; connected_at: string }>(
    `SELECT user_id, ms_email, connected_at FROM os_ms_tokens`
  );
  for (const r of rows) {
    out.set(r.user_id, {
      connected: true,
      email: r.ms_email,
      connectedAt: new Date(r.connected_at).toISOString(),
    });
  }
  return out;
}

export async function msStore(userId: string, email: string, refreshToken: string): Promise<void> {
  await q(
    `INSERT INTO os_ms_tokens (user_id, ms_email, refresh_enc, connected_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET ms_email = EXCLUDED.ms_email,
           refresh_enc = EXCLUDED.refresh_enc,
           connected_at = NOW()`,
    [userId, email.toLowerCase(), seal(refreshToken)]
  );
}

export async function msDisconnect(userId: string): Promise<void> {
  if (!hasDb()) return;
  await q(`DELETE FROM os_ms_tokens WHERE user_id = $1`, [userId]);
}

/* Access tokens last an hour; refresh tokens rotate. A returned new refresh
   token MUST be persisted or the connection dies quietly a fortnight later. */
const accessCache = new Map<string, { token: string; expiresAt: number }>();

export class MailboxNotConnected extends Error {
  constructor() {
    super("That person hasn't connected their Microsoft mailbox yet.");
    this.name = "MailboxNotConnected";
  }
}

export async function msAccessTokenFor(userId: string): Promise<string> {
  const cached = accessCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  if (!hasDb()) throw new MailboxNotConnected();
  const rows = await q<{ refresh_enc: string }>(
    `SELECT refresh_enc FROM os_ms_tokens WHERE user_id = $1`,
    [userId]
  );
  const sealed = rows[0]?.refresh_enc;
  if (!sealed) throw new MailboxNotConnected();
  const refresh = open(sealed);
  if (!refresh) throw new MailboxNotConnected();

  const data = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  if (data.refresh_token && data.refresh_token !== refresh) {
    await q(`UPDATE os_ms_tokens SET refresh_enc = $2 WHERE user_id = $1`, [userId, seal(data.refresh_token)]);
  }
  const token = data.access_token as string;
  accessCache.set(userId, {
    token,
    /* A minute short of the stated life, so a token never expires mid-send. */
    expiresAt: Date.now() + Math.max(60, (data.expires_in ?? 3600) - 60) * 1000,
  });
  return token;
}

/** The mailbox behind an access token — used once, at connect time. */
export async function msGetMe(accessToken: string): Promise<{ email: string; name: string }> {
  const res = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName,displayName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const me = (await res.json().catch(() => ({}))) as {
    mail?: string; userPrincipalName?: string; displayName?: string;
  };
  if (!res.ok) throw new Error("Couldn't read the Microsoft account.");
  const email = me.mail ?? me.userPrincipalName ?? "";
  if (!email) throw new Error("That Microsoft account has no email address.");
  return { email, name: me.displayName ?? "" };
}

/* ─────────────────── REX's timeline, kept ─────────────────── */

const dropboxCache = new Map<string, string>();

/**
 * The agent's own REX email dropbox: BCC it and REX files the message against
 * the contact, so moving the send to Graph costs the timeline nothing.
 *
 * The address is `3517.<rexUserId>@emaildrop.uk.rexsoftware.com` and is
 * obviously constructible, which is exactly why it is ASKED for instead. The
 * shape is REX's to change, and a constructed address that silently stops
 * matching means mail quietly stops being filed with nothing to notice.
 */
export async function rexDropboxFor(rexUserId: string | null): Promise<string | null> {
  if (!rexUserId || !rexConfigured()) return null;
  const held = dropboxCache.get(rexUserId);
  if (held) return held;
  const res = await rexCall("EmailDropbox", "getEmailDropboxAddressForUser", { user_id: Number(rexUserId) });
  const addr = typeof res.result === "string" ? res.result.trim() : "";
  if (!res.ok || !addr.includes("@")) return null;
  dropboxCache.set(rexUserId, addr);
  return addr;
}

/* ─────────────────── sending ─────────────────── */

export interface GraphSend {
  to: { name?: string; email: string };
  subject: string;
  /** HTML. */
  body: string;
  /** Their REX user id, so the message is BCC'd onto the REX timeline. */
  rexUserId?: string | null;
}

/**
 * Send from their mailbox, as them.
 *
 * saveToSentItems is left ON deliberately. A sent message that does not appear
 * in the agent's own Sent Items is one they cannot find, cannot forward, and
 * cannot prove they sent — and the reply would have nothing to thread onto,
 * which is the entire reason for sending this way instead of through REX.
 */
export async function msSendMail(userId: string, msg: GraphSend): Promise<{ bccd: boolean }> {
  const token = await msAccessTokenFor(userId);
  const bcc = await rexDropboxFor(msg.rexUserId ?? null);

  const res = await fetch(`${GRAPH}/me/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: msg.subject,
        body: { contentType: "HTML", content: msg.body },
        toRecipients: [{ emailAddress: { address: msg.to.email, name: msg.to.name } }],
        ...(bcc ? { bccRecipients: [{ emailAddress: { address: bcc } }] } : {}),
      },
      saveToSentItems: true,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Microsoft refused the send (${res.status}). ${detail.slice(0, 300)}`);
  }
  return { bccd: Boolean(bcc) };
}
