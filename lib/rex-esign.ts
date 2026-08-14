import "server-only";
import { rexCall } from "./rex";

/**
 * Terms of business, signed — through REX's DocuSign connection.
 *
 * ── Why this route and not DocuSign directly ────────────────────────────────
 *
 * REX already holds a live DocuSign connection for each of the group's
 * businesses (TLE's is 2103, service_type "docusign", state "connected"), and
 * the office already sends terms through it by hand: 228 requests against
 * TLE's three templates, 132 of them completed.
 *
 * So we do not need a DocuSign integration key, a go-live promotion, or an
 * account administrator's signature. We push the request into REX, REX talks
 * to DocuSign, and the result comes back to the REX record — which is the
 * whole point. An envelope sent directly from us would be invisible to the
 * next person who opens that landlord, and the team lives in REX.
 *
 * ── What is measured, and what is not ───────────────────────────────────────
 *
 * READS are measured against live data: statuses, completion times, envelope
 * ids and the signed PDF all confirmed.
 *
 * THE CREATE IS NOT. Writes are locked, so the payload below is built from
 * the shape of records REX itself created, not from a send we have made. The
 * first real send is supervised and goes to a colleague — see the note on
 * sendForSignature.
 */

/* ───────────────────────── templates ───────────────────────── */

export type EsignTemplate = {
  id: number;
  name: string;
  /** The record type it attaches to — "listing" for the TLE terms. */
  module: string | null;
};

/**
 * The templates on the account. Eleven exist and most belong to the sister
 * businesses (NPE, TCPE); TLE's are the terms of business, one per region.
 * Filtered by name because there is no field marking which business owns one.
 */
export async function esignTemplates(): Promise<EsignTemplate[]> {
  const res = await rexCall("EsignTemplates", "search", { limit: 100 });
  if (!res.ok) return [];
  const rows = ((res.result as { rows?: unknown[] })?.rows ?? []) as {
    id?: number;
    name?: string;
    module?: { id?: string };
  }[];
  return rows
    .filter((r) => /(^|\b)(TLE|RRA TLE)/i.test(r.name ?? ""))
    .map((r) => ({ id: Number(r.id), name: r.name ?? "", module: r.module?.id ?? null }));
}

/* ───────────────────────── requests ───────────────────────── */

/** REX's own words, kept rather than renamed — these appear in its UI too. */
export type EsignStatus = "completed" | "partially_signed" | "incomplete" | "unknown";

export type EsignRequest = {
  id: number;
  status: EsignStatus;
  statusText: string;
  templateId: number | null;
  templateName: string;
  /** Who sent it, from REX — so the log shows a person, not "the office". */
  sentBy: string;
  sentAt: string | null;
  completedAt: string | null;
  /** DocuSign's own envelope id, for anyone who needs to look it up there. */
  envelopeId: string | null;
  error: string | null;
  listingId: number | null;
  /** Who was asked to sign, and in what role. */
  signers: { role: string; name: string; email: string }[];
};

type Raw = {
  id?: number | string;
  status?: { id?: string; text?: string };
  status_id?: string;
  esign_template?: { id?: number; name?: string };
  esign_template_id?: number;
  system_sent_user?: { name?: string };
  system_sent_time?: number;
  system_completed_time?: number;
  provider_request_id?: string;
  error_message?: string | null;
  content?: {
    listing?: { id?: number | string };
    roles?: {
      provider_role_id?: string;
      role_type?: string;
      record?: { name?: string; email_address?: string };
    }[];
  };
};

const at = (unix?: number | null) => (unix ? new Date(unix * 1000).toISOString() : null);

function toRequest(r: Raw): EsignRequest {
  const id = String(r.status?.id ?? r.status_id ?? "");
  return {
    id: Number(r.id),
    status: (["completed", "partially_signed", "incomplete"].includes(id)
      ? id
      : "unknown") as EsignStatus,
    statusText: r.status?.text ?? "Unknown",
    templateId: r.esign_template?.id ?? r.esign_template_id ?? null,
    templateName: r.esign_template?.name ?? "",
    sentBy: r.system_sent_user?.name ?? "",
    sentAt: at(r.system_sent_time),
    completedAt: at(r.system_completed_time),
    envelopeId: r.provider_request_id ?? null,
    error: r.error_message ?? null,
    listingId: r.content?.listing?.id ? Number(r.content.listing.id) : null,
    signers: (r.content?.roles ?? []).map((x) => ({
      role: x.provider_role_id ?? "",
      name: x.record?.name ?? "",
      email: x.record?.email_address ?? "",
    })),
  };
}

/** Everything sent for one listing, newest first. */
export async function esignFor(listingId: string | number): Promise<EsignRequest[]> {
  const res = await rexCall("EsignRequests", "search", {
    limit: 20,
    criteria: [{ name: "listing_id", type: "=", value: Number(listingId) }],
    // ONLY id, system_sent_time and system_completed_time are sortable.
    // Anything else comes back as ZERO ROWS rather than an error — that is
    // how this looked unused when it has 228 records on it.
    order_by: { id: "desc" },
  });
  if (!res.ok) return [];
  const rows = ((res.result as { rows?: Raw[] })?.rows ?? []) as Raw[];
  // The search format omits `content`, so each row is read in full — the
  // signers and the listing join only exist in there.
  const full = await Promise.all(
    rows.map(async (r) => {
      const one = await rexCall("EsignRequests", "read", { id: Number(r.id) });
      return one.ok ? toRequest(one.result as Raw) : toRequest(r);
    })
  );
  return full;
}

export async function esignRequest(id: string | number): Promise<EsignRequest | null> {
  const res = await rexCall("EsignRequests", "read", { id: Number(id) });
  return res.ok && res.result ? toRequest(res.result as Raw) : null;
}

/**
 * Ask for a signature.
 *
 * NOT YET FIRED. Writes are locked, so this payload is modelled on records
 * REX created itself rather than on a send we have made. Two things are worth
 * knowing before the first one goes:
 *
 *  • The roles are named by the TEMPLATE, not by us. TLE's terms of business
 *    declares "Agent" (a REX user) and "Landlord" (a REX contact). Send a
 *    role name the template doesn't have and DocuSign has nobody to route to.
 *
 *  • The listing join lives inside `content`, not as a column. That is why
 *    the searchable `listing_id` works while there is no listing_id field on
 *    the record.
 *
 * Send the first one to a colleague, watch it arrive, and only then point it
 * at a landlord.
 */
export async function sendForSignature(
  params: {
    connectionId: number;
    templateId: number;
    listingId: number;
    subject: string;
    body: string;
    /** The REX user doing the sending. */
    agentUserId: number;
    /** The REX contact who signs. */
    landlordContactId: number;
    agentRole?: string;
    landlordRole?: string;
  },
  actorToken?: string | null
) {
  return rexCall(
    "EsignRequests",
    "create",
    {
      data: {
        connection_id: params.connectionId,
        esign_template_id: params.templateId,
        content: {
          email_subject: params.subject,
          email_body: params.body,
          listing: { id: params.listingId },
          roles: [
            {
              provider_role_id: params.agentRole ?? "Agent",
              role_type: "user",
              record_id: String(params.agentUserId),
            },
            {
              provider_role_id: params.landlordRole ?? "Landlord",
              role_type: "contact",
              record_id: String(params.landlordContactId),
            },
          ],
        },
      },
      return_id: true,
    },
    actorToken
  );
}

/* ───────────────────────── the signed document ───────────────────────── */

export type SignedDoc = {
  id: number;
  name: string;
  /** REX's internal address. NEVER send this to a browser — see below. */
  uri: string;
  sizeMb: number;
  createdAt: string | null;
  privacy: string;
};

/**
 * The signed PDFs sitting on a listing.
 *
 * DocuSign's completed document is written back by REX as a Document on the
 * listing, by "System User", within a second or two of the request
 * completing. Measured: DocuSign_Document_rexihbdMe.pdf, 0.39MB, created at
 * 1708643027 against a completion time of 1708643029.
 *
 * `primary_record_type` MUST accompany `listing_id` or the search is refused.
 */
export async function signedDocuments(listingId: string | number): Promise<SignedDoc[]> {
  const res = await rexCall("Documents", "search", {
    limit: 40,
    criteria: [
      { name: "primary_record_type", type: "=", value: "listing" },
      { name: "listing_id", type: "=", value: Number(listingId) },
    ],
  });
  if (!res.ok) return [];
  const rows = ((res.result as { rows?: unknown[] })?.rows ?? []) as {
    id?: number;
    description?: string;
    uri?: string;
    system_size_mb?: number;
    system_ctime?: number;
    privacy_id?: string;
  }[];
  return rows
    .filter((r) => r.uri)
    .map((r) => ({
      id: Number(r.id),
      name: r.description ?? "Document",
      uri: r.uri!,
      sizeMb: Number(r.system_size_mb ?? 0),
      createdAt: at(r.system_ctime),
      privacy: r.privacy_id ?? "",
    }));
}

/**
 * Turn REX's internal address into a URL its CDN will serve.
 *
 * ⚠️ SERVER SIDE ONLY, AND DELIBERATELY NOT EXPORTED TO ANY PAGE.
 *
 * Measured, and worth being blunt about: a document marked
 * `privacy_id: "private"` — a landlord's signed terms of business, with their
 * name, their address and their signature on it — is served from this URL
 * over the open internet with NO authentication of any kind. 200,
 * application/pdf, 404KB. The only thing protecting it is that the filename
 * contains a long random string.
 *
 * We did not create that exposure and cannot close it. What we CAN do is
 * refuse to widen it: this URL never reaches a browser, never goes in an
 * email, never appears in a page's HTML. The OS streams the bytes through its
 * own authenticated route instead, so a signed contract is only ever handed
 * to somebody who is signed in. See app/api/esign/document.
 */
export function cdnUrlFor(uri: string): string | null {
  const m = uri.match(/^rexlive:\/\/(.+)$/);
  if (!m) return null;
  const host = process.env.REX_CDN_HOST ?? "uk-crm.cdns.rexsoftware.com";
  return `https://${host}/app/livestore/accounts/${m[1]}`;
}

/**
 * Everything still waiting on a signature, across the whole book.
 *
 * ── Scoped to TLE by TEMPLATE, not by sender ────────────────────────────────
 *
 * The REX account is shared with five sister businesses, so an unscoped search
 * would put another agency's landlords on TLE's dashboard. The obvious divider
 * is the sender's email domain, and it is the wrong one: TLE partners sit on
 * BOTH domains, so a domain filter drops real TLE contracts.
 *
 * The templates are the reliable divider. TLE has exactly three and they are
 * its own — 4824 TLE Terms Of Business, 5930 TLE_TOB_SCOTLAND, 5962 RRA
 * TLE_TOB_ENGLAND — and nothing else sends them.
 *
 * Overridable by env for the day a fourth is added, because a hard-coded id
 * that goes stale silently drops contracts rather than erroring.
 */
export function tleTemplateIds(): number[] {
  const raw = process.env.REX_TLE_TEMPLATE_IDS;
  if (raw) return raw.split(",").map((s) => Number(s.trim())).filter(Boolean);
  return [4824, 5930, 5962];
}

export type OutstandingTerm = EsignRequest & {
  /** The property it was sent against, as words. Blank when it went out
   *  from a contact or a property rather than a listing. */
  address: string;
  /** Whole days since it was sent. Null when REX has no sent time. */
  age: number | null;
};

export async function outstandingTerms(limit = 60): Promise<OutstandingTerm[]> {
  const ours = tleTemplateIds();
  const res = await rexCall("EsignRequests", "search", {
    limit,
    criteria: [
      { name: "esign_template_id", type: "in", value: ours },
      // "incomplete" and "partially_signed" both mean somebody still has to
      // act. Only "completed" is finished.
      { name: "status_id", type: "in", value: ["incomplete", "partially_signed"] },
    ],
    // See esignFor: sorting by anything else returns zero rows, not an error.
    order_by: { system_sent_time: "desc" },
  });
  if (!res.ok) return [];
  const rows = ((res.result as { rows?: Raw[] })?.rows ?? []) as Raw[];

  const full = await Promise.all(
    rows.map(async (r) => {
      const one = await rexCall("EsignRequests", "read", { id: Number(r.id) });
      const raw = (one.ok ? one.result : r) as Raw & {
        content?: {
          listing?: { property?: { system_search_key?: string } };
          /* The sender's own subject line, which on TLE's sends is usually
             "Terms of Business - 19 Pilrig Gardens". Only a fallback: plenty
             are just "Terms of Business" with no address in them at all. */
          email_subject?: string;
        };
      };
      const req = toRequest(raw);
      const sent = req.sentAt ? new Date(req.sentAt).valueOf() : null;
      /* The address is NOT `content.listing.name` — that field doesn't exist.
         It lives on the joined property as `system_search_key`, which is REX's
         own one-line address ("Flat 504, 50 Warwick Street, Birmingham B12
         0BA"). Read the wrong key and every row comes back blank. */
      const fromSubject = (raw.content?.email_subject ?? "").split(/\s+-\s+/).slice(1).join(" - ");
      return {
        ...req,
        address: raw.content?.listing?.property?.system_search_key ?? fromSubject.trim(),
        age: sent == null ? null : Math.floor((Date.now() - sent) / 86_400_000),
      };
    })
  );

  /* Defence in depth. `in` on a template id is honoured today, but this API
     has a habit of ignoring a filter it doesn't like and returning everything
     rather than erroring — and "everything" here means another agency's
     landlords on TLE's dashboard. */
  return full.filter((r) => r.templateId != null && ours.includes(r.templateId));
}
