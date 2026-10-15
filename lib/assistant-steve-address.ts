import "server-only";
import type { AssistantTool, ToolContext } from "@/lib/assistant-tools";
import type { Scope } from "@/lib/scope";
import { findUserById } from "@/lib/users";
import { can } from "@/lib/roles";
import { bookFor } from "@/lib/listings-cache";
import { managedBookFor } from "@/lib/managed-book-cache";
import { searchMatches } from "@/lib/search-match";
import { addressParts, osRecordFor } from "@/lib/os-property-address";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * "HOW DO I EDIT THE ADDRESS ON A PROPERTY?" (Kayleigh Wright, 15 Oct 2026).
 *
 * Steve changes it where the OS holds it - the home's OS record
 * (lib/os-property-address) - after showing the old and the new and asking.
 * Where the OS does not hold the address (it is read from the listings system
 * each time) he says so and where it is changed instead. He never writes to
 * the listings system for this: that would be a new write nobody has agreed.
 *
 * Whose homes: the Portfolio rule (app/api/portfolio/landlord) - an agent's
 * own managed book; owners and the office the whole business.
 */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The book this person may change homes in: theirs, or the business for owners and the office. */
export async function addressBook(scope: Scope, role: string | null | undefined): Promise<{ rex: string | null } | { error: string }> {
  if (scope.everything || can(role, "staff:internal")) return { rex: null };
  if (scope.unlinked || !scope.rexUserId) return { error: "I can't tell which homes are yours, so I won't change any. Ask James to link your account." };
  return { rex: scope.rexUserId };
}

export const proposeAddressChange: AssistantTool = {
  name: "propose_address_change",
  description:
    "Change a home's address in the OS. Call it when somebody asks to edit, correct or fix a property's address (a missing town or postcode, a typo, a flat number). Give the home (listingId, or `find` with the address as they know it; the home open on their screen is used if neither) and newAddress: the WHOLE new address with town and postcode, e.g. 'Flat 2, 5 Canter Close, Liverpool, L9 9JE' - never invent a part. Call it FIRST, as soon as they ask how to change an address, WITHOUT newAddress: it says whether the OS holds this home's address and what it is now, so you never promise a change you cannot make. Then ask for the whole new address and call again with it. Shows the old and new address on a card; nothing changes until they say yes. Some homes' addresses are not held by the OS - it then tells you so and where it is changed instead.",
  input_schema: {
    type: "object",
    properties: {
      listingId: { type: "string", description: "The listing or Portfolio id of the home, if you have it." },
      find: { type: "string", description: "Words to find the home by: the address as they know it." },
      newAddress: { type: "string", description: "The whole new address, with the town and postcode." },
    },
    required: [],
  },
  label: () => "Finding the home…",
  async run(input, ctx: ToolContext) {
    if (!ctx.me?.id) return { error: "I can't tell who you are, so I won't change anything." };
    if (ctx.viewingAs) return { error: "You're viewing the OS as somebody else, so I won't change anything under their name. Stop viewing as them and ask again." };
    const me = await findUserById(ctx.me.id);
    const book = await addressBook(ctx.scope, me?.role);
    if ("error" in book) return book;

    const asked = str(input.newAddress);

    /* Which home: given, on screen, or by words. */
    const onScreen = /^\/(?:listings|portfolio)\/([^/?#]+)/.exec(ctx.path ?? "")?.[1] ?? ctx.openListingId ?? "";
    const id = str(input.listingId) || (str(input.find) ? "" : decodeURIComponent(onScreen));
    const find = str(input.find);
    if (!id && !find) return { error: "Which home? Give me the address as it is now." };

    const [managed, listings] = await Promise.all([
      managedBookFor(book.rex).then((m) => m.book.properties).catch(() => [] as ManagedProperty[]),
      bookFor(book.rex).then((b) => b.listings).catch(() => []),
    ]);
    const homes = managed.filter((p) => (id ? p.listingId === id : searchMatches(find, p.name, p.locality, p.address)));
    const listing = listings.find((l) => (id ? String(l.id) === id : searchMatches(find, l.name, l.locality)));

    if (homes.length > 1) {
      return { candidates: homes.slice(0, 6).map((p) => ({ listingId: p.listingId, address: `${p.name}, ${p.locality}` })), note: "More than one home matched. Ask which, then call again with its listingId." };
    }
    const home = homes[0] ?? null;
    const record = home ? await osRecordFor(home).catch(() => null) : null;

    if (!record) {
      const now = home ? [home.name, home.locality].filter(Boolean).join(", ") : listing ? `${listing.name}, ${listing.locality}` : null;
      if (!now) return { error: "That home isn't on your book, so I can't change its address." };
      return {
        notHeldByTheOs: true,
        addressNow: now,
        note:
          "The OS doesn't keep its own copy of this home's address: the listing, Portfolio and the push to Propoly all read it from the home's property record in the back office - where the home was first set up - fresh each time. So it is changed there, not here, and the OS shows the new one shortly after. Tell them that in plain words, WITHOUT naming the system (never say REX), and offer to note it for James with note_a_gap so it can be changed in the OS later.",
      };
    }

    const before = record.address;
    if (!asked) {
      return {
        heldByTheOs: true,
        addressNow: before,
        note: "The OS holds this home's address, so you can change it. Ask for the whole new address with the town and postcode, then call again with newAddress.",
      };
    }
    const parts = addressParts(asked);
    if ("error" in parts) return parts;
    if (before.replace(/\W/g, "").toLowerCase() === parts.address.replace(/\W/g, "").toLowerCase()) {
      return { error: `That's already the address the OS holds: ${before}.` };
    }
    return {
      __proposal: {
        kind: "address",
        listingId: null,
        address: [home!.name, home!.locality].filter(Boolean).join(", "),
        osPropertyId: record.id,
        homeId: home!.listingId,
        before,
        after: parts,
        alsoElsewhere: record.linked,
        text: `Now: ${before}\nNew: ${parts.address}`,
      },
      done: false,
      note:
        `Shown to them: the old address (${before}) and the new (${parts.address}). Nothing has changed yet. Say both in one short line and end with exactly "Shall I change it?" - a yes, or the Change it button, saves it in the OS.` +
        (record.linked
          ? " This home is also on a property record in the back office (where listings are set up): say that once it is changed in the OS, they should change it there too so the listing and the portals match. Never name REX."
          : ""),
    };
  },
};
