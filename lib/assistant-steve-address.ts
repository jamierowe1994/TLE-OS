import "server-only";
import type { AssistantTool, ToolContext } from "@/lib/assistant-tools";
import type { Scope } from "@/lib/scope";
import { findUserById } from "@/lib/users";
import { can } from "@/lib/roles";
import { bookFor } from "@/lib/listings-cache";
import { managedBookFor } from "@/lib/managed-book-cache";
import { searchMatches } from "@/lib/search-match";
import { addressParts, osHomeAddress, osRecordFor } from "@/lib/os-property-address";
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
    "Change a home's address in the OS. Call it when somebody asks to edit, correct or fix a property's address (a missing town or postcode, a typo, a flat number). Give the home (listingId, or `find` with the address as they know it; the home open on their screen is used if neither) and newAddress: the WHOLE new address with town and postcode, e.g. 'Flat 2, 5 Canter Close, Liverpool, L9 9JE' - never invent a part. Call it FIRST, as soon as they ask how to change an address, WITHOUT newAddress: it says whether the OS holds this home's address and what it is now, so you never promise a change you cannot make. Then ask for the whole new address and call again with it. Shows the old and new address on a card; nothing changes until they say yes. Most homes' addresses also live on their back-office property record; it tells you when to say it needs changing there too.",
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

    /* Where the OS keeps it: the managed-home record when there is one,
       otherwise the OS's own address row for the REX property (option A,
       James via the ticket session, 15 Oct 2026). */
    const rexPropertyId = record ? null : String(home?.propertyId ?? listing?.propertyId ?? "") || null;
    const shownNow = home ? [home.name, home.locality].filter(Boolean).join(", ") : listing ? `${listing.name}, ${listing.locality}` : null;
    if (!record && !shownNow) return { error: "That home isn't on your book, so I can't change its address." };
    if (!record && !rexPropertyId) return { error: "I can't tell which home record this is, so I won't change it. It's gone to James." };
    const held = rexPropertyId ? await osHomeAddress(rexPropertyId).catch(() => null) : null;
    const before = record ? record.address : held?.address ?? (shownNow as string);

    if (!asked) {
      return {
        canChange: true,
        addressNow: before,
        note: "You can change this home's address in the OS. Ask for the whole new address with the town and postcode, then call again with newAddress.",
      };
    }
    const parts = addressParts(asked);
    if ("error" in parts) return parts;
    if (before.replace(/\W/g, "").toLowerCase() === parts.address.replace(/\W/g, "").toLowerCase()) {
      return { error: `That's already the address the OS holds: ${before}.` };
    }
    const alsoElsewhere = record ? record.linked : true;
    return {
      __proposal: {
        kind: "address",
        listingId: null,
        address: shownNow ?? before,
        target: record ? { kind: "os-record", osPropertyId: record.id, homeId: home!.listingId } : { kind: "home", rexPropertyId: rexPropertyId as string, listingId: home?.listingId ?? (listing ? String(listing.id) : null) },
        before,
        after: parts,
        alsoElsewhere,
        text: `Now: ${before}\nNew: ${parts.address}`,
      },
      done: false,
      note:
        `Shown to them: the old address (${before}) and the new (${parts.address}). Nothing has changed yet. Say both in one short line and end with exactly "Shall I change it?" - a yes, or the Change it button, saves it in the OS.` +
        (alsoElsewhere
          ? " Say too that this home's address is also on its property record in the back office (where it was set up): once it's changed in the OS, change it there as well so the listing and the portals match. Never name REX."
          : ""),
    };
  },
};
