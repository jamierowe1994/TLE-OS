import "server-only";
import type { OsUser } from "@/lib/users";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { sendAsAgent, type AgentSendResult } from "@/lib/send-as-agent";
import { logDone } from "@/lib/tenant-email-send";
import { bookFor } from "@/lib/listings-cache";
import { bedsFrom, blurbFrom, homeCardsHtml } from "@/lib/home-cards";
import { SITE } from "@/lib/email/tle-documents";

/**
 * HOMES THAT FIT, from an agent to one tenant - the one send behind both
 * buttons that put homes in front of people (17 Sep 2026):
 *
 *   Email properties on a lead    one person, the homes the agent ticked
 *   Mail the database on a listing   one home, everybody it suits
 *
 * Hoisted out of app/api/leads/email-properties so the two cannot drift: the
 * same email, the same passport button, the same entry on the tenant email
 * log (which is what lets Anything Close? follow up four days later).
 */

export type FitHome = {
  id?: string | null;
  name: string;
  locality?: string | null;
  rent?: number | null;
  rentPeriod?: string | null;
  /* The card's extras (Howard, 1 Oct 2026). Filled from the listing book by
     id when the caller does not have them - see withListingFacts. */
  image?: string | null;
  beds?: string | null;
  propertyType?: string | null;
  blurb?: string | null;
};

/**
 * The photo, beds and one line for each home, from the listing book (the
 * shared cache: no REX read when it is warm). The picker on a lead only sends
 * name, place and rent; a home the book no longer holds keeps what it came
 * with and is drawn without a photo rather than not at all.
 */
async function withListingFacts(homes: FitHome[]): Promise<FitHome[]> {
  if (!homes.some((h) => h.id && (h.image === undefined || h.blurb === undefined))) return homes;
  const book = await bookFor(null).catch(() => null);
  const byId = new Map((book?.listings ?? []).map((l) => [String(l.id), l]));
  return homes.map((h) => {
    const l = h.id ? byId.get(String(h.id)) : undefined;
    if (!l) return h;
    return {
      ...h,
      image: h.image ?? l.image ?? l.images?.[0] ?? null,
      beds: h.beds ?? bedsFrom(l.advertHeading, l.advertBody, l.name),
      propertyType: h.propertyType ?? l.propertyType ?? null,
      blurb: h.blurb ?? blurbFrom(l.advertHeading, l.advertBody),
    };
  });
}

function vars(p: { name: string; homes: FitHome[]; agentName: string; link: string }) {
  /* A card per home: photo, rent, address, beds and a line from the advert. */
  const homesList = homeCardsHtml(p.homes, SITE);
  return {
    firstName: p.name.trim().split(/\s+/)[0] || "there",
    count: String(p.homes.length),
    introLine:
      p.homes.length === 1
        ? "Here's a home on with us right now that I think fits what you're after."
        : "Here are the homes on with us right now that I think fit what you're after.",
    homesList,
    agentName: p.agentName,
    link: p.link,
  };
}

export async function renderHomesThatFit(p: { name: string; homes: FitHome[]; agentName: string; link: string }) {
  const { subject, html } = await renderTleEmailLive("tenant-matches", vars({ ...p, homes: await withListingFacts(p.homes) }));
  /* One home reads "1 homes" in the catalogue's subject. */
  return { subject: p.homes.length === 1 ? subject.replace(/^1 homes that fit/, "A home that fits") : subject, html };
}

/** Render, send as the agent, log it. No passport: that only goes when the agent presses Send passport (1 Oct 2026). */
export async function sendHomesThatFit(p: { me: OsUser; name: string; to: string; homes: FitHome[]; origin: string }): Promise<AgentSendResult> {
  const to = p.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { sent: false, via: null, timeline: false, reason: "no_address", detail: "There is no usable email address on their record, so nothing was sent." };
  }

  const { subject, html } = await renderHomesThatFit({
    name: p.name,
    homes: p.homes,
    agentName: p.me.name || "The Letting Experts",
    link: `${p.origin}/tenant/welcome`,
  });
  const r = await sendAsAgent({ me: p.me, to, toName: p.name, subject, html });
  if (r.sent) {
    /* On the tenant email log, with the homes, so Anything Close? can follow
       up in four days with what has come on near them since. */
    await logDone(`tenant-matches:${to.toLowerCase()}:${Date.now()}`, "tenant-matches", to, "sent", r.detail, {
      name: p.name,
      agentId: p.me.id,
      homes: p.homes.map((h) => ({ id: h.id ?? null, name: h.name, locality: h.locality ?? null, rent: h.rent ?? null })),
    }).catch(() => null);
  }
  return r;
}
