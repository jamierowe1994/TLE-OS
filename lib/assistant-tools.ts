import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { Scope } from "@/lib/scope";
import { bookFor } from "@/lib/listings-cache";
import { getComplianceBook } from "@/lib/compliance-cache";
import { getListingContacts, getListingDetail } from "@/lib/business/rex-stats";
import { portalLinksFor } from "@/lib/rex-portal-links";
import { rexCall, rexConfigured } from "@/lib/rex";
import { requiredCerts, statusOf, type CompProperty } from "@/lib/compliance";
import type { ActionProposal } from "@/lib/assistant-actions";

/**
 * WHAT STEVE CAN ACTUALLY GO AND FIND OUT.
 *
 * Until now the assistant answered from a static system prompt and said "I
 * can't look that up" to everything else — not because anything stopped him,
 * but because his own brief said so. Nothing was wired. These are the tools
 * that make the sentence untrue.
 *
 * ── Three rules every tool here obeys ────────────────────────────────────
 *
 * 1. READ ONLY. Nothing in this file changes anything, anywhere. Actions that
 *    send or write go through a separate confirm-first path, because "Steve
 *    emailed the wrong landlord" has no undo and a wrong answer does.
 *
 * 2. SCOPED, ALWAYS. Every tool takes the caller's Scope and filters by it.
 *    An agent asking Steve gets exactly what they'd get by clicking around
 *    the app themselves — their own book. This matters more here than on a
 *    screen: a page shows you a list you can see is yours, whereas a chat
 *    answer arrives with no such framing, so the filtering has to be real
 *    rather than cosmetic. `unlinked` returns NOTHING, never everything.
 *
 * 3. SAY WHEN IT ISN'T THERE. REX is patchy in ways that matter: bedrooms are
 *    recorded on roughly a third of the current rental book (measured 29 Aug
 *    2026: 9 of 25 sampled). A tool that quietly omits a missing field invites
 *    a confident wrong answer. Every one of these returns an explicit "not
 *    recorded in REX" so Steve says that instead of guessing.
 */

export interface ToolContext {
  scope: Scope;
  /** The screen they're on, so a tool can resolve "this property". */
  path: string | null;
  /** The record open in front of them, when the screen has one. */
  openListingId: string | null;
}

/** A tool's answer, plus the one-line label the widget shows while it runs. */
export interface AssistantTool {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
  /** Present tense, shown live in the bubble: "Looking up 4 Hermosa Road…" */
  label: (input: Record<string, unknown>) => string;
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** REX rows arrive as `{rows:[…]}` or a bare array depending on the method. */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/**
 * "Not recorded" is a real answer and must survive the trip to the model.
 * `null` in JSON reads as absence; this reads as absence somebody checked.
 */
const orMissing = <T>(v: T | null | undefined): T | "not recorded in REX" =>
  v === null || v === undefined || v === "" ? "not recorded in REX" : v;

/* ==========================================================================
   Scope — the guard every tool runs first.
   ========================================================================== */

/** Signed in but unlinked: we cannot say whose book this is, so there isn't one. */
function refuseUnscoped(scope: Scope): { error: string } | null {
  if (scope.unlinked) {
    return {
      error:
        "I can't tell which REX user you are, so I can't show you any properties — and I won't show you everybody's. Ask James to link your account.",
    };
  }
  return null;
}

/* ==========================================================================
   The tools.
   ========================================================================== */

/**
 * FIND A PROPERTY BY ADDRESS.
 *
 * Two sources, because neither is enough alone:
 *
 *   • The caller's listing book — everything they're actually working on,
 *     with rent, status and availability attached.
 *   • Properties/autocomplete — REX's own address index, which reaches
 *     properties that have no listing at all.
 *
 * The second is why this exists. James asked Steve for "Kenneth Close" and got
 * nothing: it is 7 & 8 Kenneth Bradshaw Close, Coventry, it has never been
 * listed, and it is invisible to every route that walks the rental book.
 *
 * Autocomplete is the ONLY address search REX allows here. `adr_street_name`
 * and `system_search_key` are both refused as search fields on Properties
 * ("not a permissible or valid search field"), so don't reach for them again.
 */
const findProperty: AssistantTool = {
  name: "find_property",
  description:
    "Find a property by address, street name, or postcode. Call this whenever somebody names a property — 'Kenneth Close', '4 Hermosa Road', 'the Teignmouth flat' — before answering anything else about it, because you need its id. Searches both the listings they are working on and REX's full address index, so it also finds properties that have never been on the market. Returns candidates with ids; if more than one comes back, ask which they meant rather than guessing.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Address, street, or postcode as the person said it, e.g. 'Kenneth Close' or 'Hermosa Road Teignmouth'.",
      },
    },
    required: ["query"],
  },
  label: (i) => `Looking for ${str(i.query) || "a property"}…`,
  async run(input, ctx) {
    const refusal = refuseUnscoped(ctx.scope);
    if (refusal) return refusal;
    const query = str(input.query);
    if (query.length < 2) return { error: "Give me at least a couple of characters to search on." };

    /* 1. Their own book first — these are the useful hits, and they come with
          rent and status already attached. */
    const book = await bookFor(ctx.scope.rexUserId);
    const needle = query.toLowerCase();
    const mine = book.listings
      .filter((l) => `${l.name} ${l.locality}`.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((l) => ({
        listingId: l.id,
        propertyId: l.propertyId,
        address: `${l.name}, ${l.locality}`,
        rent: l.rent ? `£${l.rent.toLocaleString("en-GB")} ${l.rentPeriod === "week" ? "pw" : "pcm"}` : "not recorded in REX",
        status: l.letAgreed ? "let agreed" : l.publicationStatus === "published" ? "on the market" : "draft, not published",
        availableFrom: orMissing(l.availableFrom),
        onYourBook: true,
      }));

    /* 2. REX's address index, for anything with no listing behind it. */
    let others: { propertyId: string; address: string; onYourBook: false; note: string }[] = [];
    if (rexConfigured()) {
      const res = await rexCall("Properties", "autocomplete", { search_string: query, limit: 12 });
      if (res.ok) {
        const known = new Set(book.listings.map((l) => String(l.propertyId)));
        others = rowsOf(res.result)
          .filter((r) => !known.has(String(r.id)))
          .slice(0, 8)
          .map((r) => ({
            propertyId: String(r.id),
            address: String(r.address ?? "").trim(),
            onYourBook: false as const,
            note: "In REX's address book but not on your listings. It may never have been marketed, or it may belong to another part of the group.",
          }));
      }
    }

    /* An agent must not learn what is on somebody else's book by asking. An
       owner is looking at the whole business anyway, so they see everything. */
    const hidden = ctx.scope.everything ? 0 : others.length;
    if (!ctx.scope.everything) others = [];

    return {
      query,
      searchedAs: ctx.scope.label || "you",
      matches: [...mine, ...others],
      found: mine.length + others.length,
      ...(hidden
        ? { note: `${hidden} further ${hidden === 1 ? "match is" : "matches are"} in REX but not on your book, so I haven't listed ${hidden === 1 ? "it" : "them"}.` }
        : {}),
      ...(mine.length + others.length === 0
        ? { note: "Nothing matched. It may be spelled differently in REX, or belong to another brand in the group." }
        : {}),
    };
  },
};

/**
 * THE FACTS ABOUT ONE PROPERTY.
 *
 * Bedrooms are the reason this is a separate call from find_property. They do
 * not ride along on a Listings search — they live on the PROPERTY record and
 * cost a second REX round trip (getListingDetail does both). And they are
 * frequently blank: about a third of the current book has them recorded.
 */
const propertyDetail: AssistantTool = {
  name: "property_detail",
  description:
    "Get the facts about one listing: bedrooms, bathrooms, receptions, property type, furnishing, council tax band, deposit, rent, availability, EPC and marketing status. Call this when asked anything specific about a property — how many bedrooms, what it rents for, when it's free. Needs a listingId from find_property first. Bedrooms are missing from roughly two thirds of the book; when they come back as 'not recorded in REX', say exactly that rather than estimating.",
  input_schema: {
    type: "object",
    properties: {
      listingId: { type: "string", description: "The listingId returned by find_property." },
    },
    required: ["listingId"],
  },
  label: () => "Reading the property record…",
  async run(input, ctx) {
    const refusal = refuseUnscoped(ctx.scope);
    if (refusal) return refusal;
    const listingId = str(input.listingId);
    if (!listingId) return { error: "I need a listingId — use find_property first." };

    /* Scope is enforced on the BOOK, not on the detail call: REX will happily
       read any listing by id, so the check has to be ours. */
    const book = await bookFor(ctx.scope.rexUserId);
    const listing = book.listings.find((l) => String(l.id) === listingId);
    if (!listing && !ctx.scope.everything) {
      return { error: "That property isn't on your book, so I can't open it. If it should be, ask James to check who it's assigned to in REX." };
    }

    const detail = await getListingDetail(listingId);
    if (!detail && !listing) return { error: "REX wouldn't answer for that property." };

    return {
      listingId,
      address: listing ? `${listing.name}, ${listing.locality}` : "on REX, not on your book",
      bedrooms: orMissing(detail?.bedrooms),
      bathrooms: orMissing(detail?.bathrooms),
      receptions: orMissing(detail?.receptions),
      propertyType: orMissing(detail?.propertyType),
      furnishing: orMissing(detail?.furnishing),
      councilTaxBand: orMissing(detail?.councilTaxBand),
      deposit: orMissing(detail?.deposit),
      rent: listing?.rent ? `£${listing.rent.toLocaleString("en-GB")} ${listing.rentPeriod === "week" ? "pw" : "pcm"}` : "not recorded in REX",
      availableFrom: orMissing(listing?.availableFrom),
      epcExpiry: orMissing(listing?.epcExpiry),
      epcRating: orMissing(listing?.epcRating),
      marketingStatus: listing
        ? listing.letAgreed
          ? "let agreed"
          : listing.publicationStatus === "published"
            ? "published to the portals"
            : "draft — not on the portals"
        : "not recorded in REX",
      photos: listing?.imageCount ?? 0,
      hasWriteUp: Boolean(listing?.advertBody),
    };
  },
};

/** Who to ring. The landlord and the sitting tenant, with their real numbers. */
const propertyContacts: AssistantTool = {
  name: "property_contacts",
  description:
    "Get the landlord and tenant for a property, with email and phone. Call this when somebody asks who owns a property, who lives there, or how to contact either. Needs a listingId from find_property. An empty list means REX wouldn't answer, NOT that the property has no landlord — say so rather than reporting nobody.",
  input_schema: {
    type: "object",
    properties: { listingId: { type: "string", description: "The listingId returned by find_property." } },
    required: ["listingId"],
  },
  label: () => "Looking up the landlord…",
  async run(input, ctx) {
    const refusal = refuseUnscoped(ctx.scope);
    if (refusal) return refusal;
    const listingId = str(input.listingId);
    if (!listingId) return { error: "I need a listingId — use find_property first." };

    const book = await bookFor(ctx.scope.rexUserId);
    if (!book.listings.some((l) => String(l.id) === listingId) && !ctx.scope.everything) {
      return { error: "That property isn't on your book, so I can't show you its contacts." };
    }

    const people = await getListingContacts(listingId);
    if (!people.length) {
      return { listingId, contacts: [], note: "REX returned nothing for this property. That means the lookup failed or nobody is attached — it does NOT mean the property has no landlord. Worth checking in REX directly." };
    }
    return {
      listingId,
      contacts: people.map((c) => ({ name: c.name, role: orMissing(c.role), email: orMissing(c.email), phone: orMissing(c.phone) })),
    };
  },
};

/**
 * COMPLIANCE, WHICH IS THE ONE PEOPLE ACTUALLY GET WRONG.
 *
 * `checked: false` on a property means we could not read it, which is NOT the
 * same as "all clear" — that distinction has caused a live false alarm before
 * and it is preserved all the way out to the answer.
 */
const complianceDue: AssistantTool = {
  name: "compliance_due",
  description:
    "What safety certificates are expired, expiring, or missing. Call this for any question about gas, EICR, EPC, HMO licences, or 'what's due'. Give a listingId for one property, or leave it out for everything outstanding across their book. Certificates that are missing are reported separately from certificates that are expired — they mean different things and are chased differently.",
  input_schema: {
    type: "object",
    properties: {
      listingId: { type: "string", description: "Optional. One property, from find_property. Omit for the whole book." },
      withinDays: { type: "number", description: "Optional. Only include certificates expiring within this many days. Defaults to 60." },
    },
    required: [],
  },
  label: (i) => (str(i.listingId) ? "Checking that property's certificates…" : "Checking what compliance is due…"),
  async run(input, ctx) {
    const refusal = refuseUnscoped(ctx.scope);
    if (refusal) return refusal;
    const within = typeof input.withinDays === "number" && input.withinDays > 0 ? input.withinDays : 60;

    const [{ book: comp, stale }, listings] = await Promise.all([
      getComplianceBook(),
      bookFor(ctx.scope.rexUserId),
    ]);

    /* Compliance hangs off the PROPERTY, and the book is business-wide, so it
       is narrowed to the caller's own properties here rather than trusted. */
    const wanted = str(input.listingId);
    const mineByProperty = new Set(listings.listings.map((l) => String(l.propertyId)));
    const one = wanted ? listings.listings.find((l) => String(l.id) === wanted) : null;
    if (wanted && !one && !ctx.scope.everything) {
      return { error: "That property isn't on your book, so I can't check its certificates." };
    }

    const scoped: CompProperty[] = comp.properties.filter((p) => {
      if (one) return String(p.id) === String(one.propertyId);
      return ctx.scope.everything || mineByProperty.has(String(p.id));
    });

    const rows: { property: string; certificate: string; state: string; daysLeft: number | string }[] = [];
    for (const p of scoped) {
      for (const key of requiredCerts(p)) {
        const cert = p.certs[key];
        const state = statusOf(cert);
        if (state === "ok") continue;
        if (state !== "missing" && state !== "expired" && (cert?.expires ?? 0) > within) continue;
        rows.push({
          property: `${p.name}, ${p.locality}`,
          certificate: key.toUpperCase(),
          state:
            state === "missing"
              ? "no certificate on file at all"
              : state === "expired"
                ? "EXPIRED"
                : `expires in ${cert?.expires} days`,
          daysLeft: cert?.expires ?? "unknown",
        });
      }
    }
    rows.sort((a, b) => (typeof a.daysLeft === "number" ? a.daysLeft : -9999) - (typeof b.daysLeft === "number" ? b.daysLeft : -9999));

    return {
      scope: one ? `${one.name}, ${one.locality}` : ctx.scope.everything ? "the whole business" : `${ctx.scope.label || "your"} book`,
      propertiesChecked: scoped.length,
      outstanding: rows.slice(0, 40),
      total: rows.length,
      ...(stale ? { warning: "This compliance read is more than an hour old." } : {}),
      ...(scoped.length === 0 ? { note: "No compliance records came back for these properties. That is a gap in the record, not a clean bill of health." } : {}),
    };
  },
};

/** Where the advert actually is, and how it's doing. */
const portalPresence: AssistantTool = {
  name: "portal_links",
  description:
    "Get the live advert links for a property on Rightmove, Zoopla and OnTheMarket. Call this when asked where a property is advertised, whether it is live, or for a link to send someone. Needs a listingId. An empty result means the property is not feeding any portal, which is itself worth reporting.",
  input_schema: {
    type: "object",
    properties: { listingId: { type: "string", description: "The listingId returned by find_property." } },
    required: ["listingId"],
  },
  label: () => "Checking the portals…",
  async run(input, ctx) {
    const refusal = refuseUnscoped(ctx.scope);
    if (refusal) return refusal;
    const listingId = str(input.listingId);
    if (!listingId) return { error: "I need a listingId — use find_property first." };
    const book = await bookFor(ctx.scope.rexUserId);
    if (!book.listings.some((l) => String(l.id) === listingId) && !ctx.scope.everything) {
      return { error: "That property isn't on your book." };
    }
    const links = await portalLinksFor(listingId);
    return links.length
      ? { listingId, live: links }
      : { listingId, live: [], note: "Not feeding any portal. Either it's still a draft or the feed has stopped — worth checking before telling anyone it's advertised." };
  },
};

/** The book itself, for "what am I working on" questions. */
const myBook: AssistantTool = {
  name: "my_properties",
  description:
    "Summarise the properties this person is working on — how many, how many are published vs draft, let agreed, missing photos or a write-up. Call this for 'what have I got on', 'how many properties do I have', or any question about their book as a whole rather than one property.",
  input_schema: {
    type: "object",
    properties: {
      only: {
        type: "string",
        enum: ["all", "available", "let-agreed", "draft", "no-photos", "no-write-up"],
        description: "Optional filter. Defaults to all.",
      },
    },
    required: [],
  },
  label: () => "Reading your book…",
  async run(input, ctx) {
    const refusal = refuseUnscoped(ctx.scope);
    if (refusal) return refusal;
    const book = await bookFor(ctx.scope.rexUserId);
    const only = str(input.only) || "all";
    const all = book.listings;
    const pick = all.filter((l) => {
      switch (only) {
        case "available": return !l.letAgreed;
        case "let-agreed": return l.letAgreed;
        case "draft": return l.publicationStatus !== "published";
        case "no-photos": return (l.imageCount ?? 0) === 0;
        case "no-write-up": return !l.advertBody;
        default: return true;
      }
    });
    return {
      whose: ctx.scope.everything ? "the whole business" : ctx.scope.label || "you",
      filter: only,
      counts: book.counts,
      showing: pick.length,
      properties: pick.slice(0, 30).map((l) => ({
        listingId: l.id,
        address: `${l.name}, ${l.locality}`,
        rent: l.rent ? `£${l.rent.toLocaleString("en-GB")}` : "not recorded in REX",
        status: l.letAgreed ? "let agreed" : l.publicationStatus === "published" ? "on the market" : "draft",
        photos: l.imageCount ?? 0,
        hasWriteUp: Boolean(l.advertBody),
      })),
      ...(pick.length > 30 ? { note: `Showing the first 30 of ${pick.length}.` } : {}),
    };
  },
};

/* ==========================================================================
   PROPOSING AN ACTION.

   None of these do anything. Each composes a proposal, which comes back to
   the person as a card with a button on it; pressing the button is what acts.
   The tool result says so explicitly, because a model that thinks it has just
   sent an email will tell somebody it has.
   ========================================================================== */

/** Every proposal tool answers in this shape; the brain picks `__proposal` up. */
function proposed(proposal: ActionProposal, tellTheModel: string) {
  return { __proposal: proposal, done: false, note: tellTheModel };
}

/** Resolve a listing the caller is allowed to touch, or explain why not. */
async function scopedListing(listingId: string, ctx: ToolContext) {
  const refusal = refuseUnscoped(ctx.scope);
  if (refusal) return refusal;
  if (!listingId) return { error: "I need a listingId — use find_property first." };
  const book = await bookFor(ctx.scope.rexUserId);
  const found = book.listings.find((l) => String(l.id) === listingId);
  if (!found && !ctx.scope.everything) {
    return { error: "That property isn't on your book, so I can't act on it." };
  }
  return { listing: found ?? null, address: found ? `${found.name}, ${found.locality}` : `listing ${listingId}` };
}

const proposeNote: AssistantTool = {
  name: "propose_note",
  description:
    "Put a note on a property's file in the OS. Call this when somebody wants something recorded against a property — what a landlord said, what they agreed, what to remember. Composes the note and shows it to them to confirm; it is NOT saved until they press the button. Notes live in the OS, not in REX.",
  input_schema: {
    type: "object",
    properties: {
      listingId: { type: "string", description: "From find_property." },
      text: { type: "string", description: "The note, in their words where you have them." },
    },
    required: ["listingId", "text"],
  },
  label: () => "Writing a note…",
  async run(input, ctx) {
    const got = await scopedListing(str(input.listingId), ctx);
    if ("error" in got) return got;
    const text = str(input.text);
    if (!text) return { error: "The note is empty." };
    return proposed(
      { kind: "note", listingId: str(input.listingId), address: got.address, text },
      "Shown to them for confirmation. Tell them it's ready and to press Save — do NOT say it has been saved."
    );
  },
};

const proposeReminder: AssistantTool = {
  name: "propose_reminder",
  description:
    "Set a reminder in the OS diary. Call this for 'remind me to…', 'chase this on Friday', 'don't let me forget'. Work out the date yourself from what they said and pass it as a full ISO timestamp. Shows it to them to confirm; nothing is saved until they press the button. Reminders are OS-only — they do NOT reach REX or a 365 calendar, and you must say so.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "What to remind them of." },
      startsAt: { type: "string", description: "Full ISO timestamp, e.g. 2026-09-04T09:00:00.000Z." },
      listingId: { type: "string", description: "Optional. The property it concerns, from find_property." },
      mins: { type: "number", description: "Optional. Length in minutes, default 30." },
    },
    required: ["title", "startsAt"],
  },
  label: (i) => `Setting a reminder: ${str(i.title).slice(0, 40) || "…"}`,
  async run(input, ctx) {
    const refusal = refuseUnscoped(ctx.scope);
    if (refusal) return refusal;
    const title = str(input.title);
    const startsAt = str(input.startsAt);
    const when = new Date(startsAt);
    if (!title) return { error: "The reminder needs a name." };
    if (Number.isNaN(when.getTime())) return { error: "That date didn't parse. Give me a full ISO timestamp." };
    if (when.getTime() < Date.now() - 60_000) return { error: "That's in the past — did you mean next year, or a different day?" };

    let address: string | null = null;
    const listingId = str(input.listingId) || null;
    if (listingId) {
      const got = await scopedListing(listingId, ctx);
      if ("error" in got) return got;
      address = got.address;
    }
    const mins = typeof input.mins === "number" && input.mins > 0 ? Math.min(Math.max(input.mins, 15), 480) : 30;
    return proposed(
      { kind: "reminder", listingId, address, title, startsAt: when.toISOString(), mins },
      "Shown to them for confirmation. It is not set until they press the button. Say plainly that it will live in the OS diary only, not REX or their 365 calendar."
    );
  },
};

const proposeWriteUp: AssistantTool = {
  name: "propose_write_up",
  description:
    "Rewrite a property's portal advert. Call this when somebody wants the description improved, rewritten, or written from scratch. Read the property with property_detail first so the copy is true — never invent a bedroom count, a garden, or a feature the record doesn't have. Shows them the new copy to approve; it is NOT saved until they press the button. Saving publishes to Rightmove, Zoopla and OnTheMarket within about five to ten minutes, so say that.",
  input_schema: {
    type: "object",
    properties: {
      listingId: { type: "string", description: "From find_property." },
      heading: { type: "string", description: "The advert headline." },
      body: { type: "string", description: "The full advert body." },
    },
    required: ["listingId", "heading", "body"],
  },
  label: () => "Drafting the advert…",
  async run(input, ctx) {
    const got = await scopedListing(str(input.listingId), ctx);
    if ("error" in got) return got;
    const heading = str(input.heading);
    const body = str(input.body);
    if (!heading || !body) return { error: "An advert needs both a headline and a body." };
    if (body.length > 20_000) return { error: "That write-up is longer than REX will take." };
    return proposed(
      { kind: "write-up", listingId: str(input.listingId), address: got.address, heading, body },
      "Shown to them to approve. It is NOT saved yet. Tell them what you changed and why, and that pressing Save puts it on the portals in about five to ten minutes."
    );
  },
};

const proposeEmail: AssistantTool = {
  name: "propose_email",
  description:
    "Compose an email to a property's landlord or tenant. Call this when somebody wants to write to either. You do not choose the address — name the property and the role, and the real contact is looked up. Shows them the finished message; it is NOT sent by you. Sending through REX is not wired yet, so tell them it is ready to copy rather than that it has gone.",
  input_schema: {
    type: "object",
    properties: {
      listingId: { type: "string", description: "From find_property." },
      to: { type: "string", enum: ["landlord", "tenant"], description: "Which of the two." },
      subject: { type: "string", description: "Subject line." },
      body: { type: "string", description: "The message. Sign it off as them, not as you." },
    },
    required: ["listingId", "to", "subject", "body"],
  },
  label: (i) => `Composing an email to the ${str(i.to) || "landlord"}…`,
  async run(input, ctx) {
    const got = await scopedListing(str(input.listingId), ctx);
    if ("error" in got) return got;
    const to = str(input.to) === "tenant" ? "tenant" : "landlord";
    const subject = str(input.subject);
    const body = str(input.body);
    if (!subject || !body) return { error: "An email needs a subject and a body." };

    /* The address is resolved HERE, from REX, not taken from the model — and
       resolved again at execution. Whatever it thinks it is writing to, the
       card shows the person actually on the record. */
    const people = await getListingContacts(str(input.listingId));
    const want = to === "landlord" ? /landlord|owner|vendor/i : /tenant/i;
    const match = people.find((c) => c.role && want.test(c.role) && c.email);
    if (!match) {
      const roles = people.length ? people.map((c) => c.role ?? "no role").join(", ") : "nothing at all";
      return { error: `I can't find a ${to} with an email on that property. REX returned ${roles}.` };
    }
    return proposed(
      {
        kind: "email",
        listingId: str(input.listingId),
        address: got.address,
        to,
        toName: match.name,
        toEmail: match.email as string,
        subject,
        body,
      },
      `Composed and addressed to ${match.name}. It has NOT been sent — you cannot send. Tell them it is ready and that they can copy it out.`
    );
  },
};

/* Fixed order. The tool list renders BEFORE the system prompt, so reordering
   it — or building it per person — moves every byte after it and throws away
   the prompt cache on every request. It is a constant for that reason. */
export const TOOLS: AssistantTool[] = [
  findProperty,
  propertyDetail,
  propertyContacts,
  complianceDue,
  portalPresence,
  myBook,
  proposeNote,
  proposeReminder,
  proposeWriteUp,
  proposeEmail,
];

/** Pull the proposal out of a tool result, if it made one. */
export function proposalIn(result: unknown): ActionProposal | null {
  const p = (result as { __proposal?: unknown } | null)?.__proposal;
  return p && typeof p === "object" ? (p as ActionProposal) : null;
}

export const TOOL_SCHEMAS: Anthropic.Tool[] = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.input_schema,
}));

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function labelFor(name: string, input: Record<string, unknown>): string {
  const tool = BY_NAME.get(name);
  return tool ? tool.label(input) : "Working…";
}

/**
 * Run one tool. Never throws: a tool that fails returns its failure as data so
 * the model can say what went wrong and carry on, rather than the whole reply
 * collapsing into "something went wrong reaching me".
 */
export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  const tool = BY_NAME.get(name);
  if (!tool) return { error: `No such tool: ${name}` };
  try {
    return await tool.run(input ?? {}, ctx);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "That lookup failed." };
  }
}
