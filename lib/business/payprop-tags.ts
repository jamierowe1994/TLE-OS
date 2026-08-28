import { payPropAccounts, payPropGet, payPropGetAll, type PayPropAccountId } from "@/lib/payprop";

/**
 * Rent protection, from PayProp's tags.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * The Portfolio tab's "managed rent protection" figure was typed by a person,
 * and a previous investigation concluded it had no source anywhere. That was
 * wrong, and specifically it was wrong about WHERE to look.
 *
 * `protection()` on the portfolio tab reads `service_level`, on the reasonable
 * assumption that a service level called "Fully managed with RLP" would exist.
 * It does not. `service_level.name` is only ever **Fully managed**, **Let
 * only** or **Rent collect** — the wording never mentions protection at all, so
 * the helper could never match and the typed seed showed through.
 *
 * The record is a **TAG**. Measured on the live Scotland agency, 21 Aug 2026,
 * there are exactly three, named by staff:
 *
 *   Experts Managed Service with RLP     13 properties
 *   Experts Managed Service No RLP       85 properties
 *   Non-resident landlord                 6 properties, 5 beneficiaries
 *
 * Tags attach to **properties**, not tenants — the join is clean, and there are
 * zero tenant tags.
 *
 * ── FOUR THINGS THAT WILL CATCH THE NEXT PERSON ───────────────────────────
 *
 * 1. **E&W CANNOT BE READ YET.** `GET /tags` on the E&W agency returns
 *    403 `Denied (read:entity:tags)`. That is authenticated-but-unscoped, not
 *    empty: E&W's OAuth consent carries 13 scopes and `read:entity:tags` is not
 *    among them, where Scotland's 40-scope key has it. E&W is 503 of the 587
 *    active properties, so **any business-wide protection figure built today is
 *    Scotland-only and must say so.** Fixing it needs a human to re-consent on
 *    production — never locally, because there is one refresher and rotating
 *    its token breaks live E&W.
 *
 * 2. **THE COUNTS ON `/tags` INCLUDE ARCHIVED PROPERTIES.** `No RLP` reports 85
 *    and only 70 of those are live. A live figure means walking the tag's
 *    entities and intersecting with the active book, which is what this does.
 *
 * 3. **"No RLP" CONTAINS "RLP".** The two tags differ by one word. Any match on
 *    /rlp/ catches both, so the negative is excluded explicitly and first.
 *
 * 4. **TAGS CARRY NO DATES.** "Protected" means "tagged right now". There is no
 *    history, so "how many were protected last March" is unanswerable — the
 *    same limitation as the compliance register.
 *
 * The fee category is NOT a substitute, and that was measured rather than
 * assumed: `Rent and Legal Protection` appears on 5 distribution instructions
 * across 5 E&W properties, and on ZERO in Scotland — which nonetheless has 13
 * tagged. The tag is the record.
 */

const WITH_RLP = /with\s*rlp|\brlp\b/i;
const NO_RLP = /\bno\s*rlp\b|without/i;

interface TagRow {
  id?: string;
  name?: string;
  links?: { entities?: { count?: number } };
}

interface TagEntity {
  id?: string;
  name?: string;
  type?: string;
}

export interface AgencyProtection {
  account: PayPropAccountId;
  /** Null when we couldn't read tags at all — distinct from zero. */
  withRlp: number | null;
  withoutRlp: number | null;
  /** Active properties carrying neither service tag. */
  untagged: number | null;
  activeProperties: number;
  /** Every tag name we found, verbatim, so new wording is visible not silent. */
  tagNames: string[];
  /** Set when the agency refused. The exact reason, for the screen. */
  error: string | null;
}

export interface ProtectionBook {
  agencies: AgencyProtection[];
  /** Summed across agencies we could actually read. */
  withRlp: number;
  withoutRlp: number;
  /** Agencies that refused — the reason the totals are short. */
  unreadable: PayPropAccountId[];
  pulledAt: string;
}

/** Every property id carrying a tag. Paged — PayProp clamps rows to 25. */
async function entitiesOf(account: PayPropAccountId, tagId: string): Promise<Set<string>> {
  const rows = await payPropGetAll<TagEntity>(account, `tags/${tagId}/entities`, {}).catch(
    () => [] as TagEntity[]
  );
  return new Set(
    rows.filter((r) => (r.type ?? "property") === "property" && r.id).map((r) => String(r.id))
  );
}

async function protectionFor(account: PayPropAccountId): Promise<AgencyProtection> {
  const empty: AgencyProtection = {
    account,
    withRlp: null,
    withoutRlp: null,
    untagged: null,
    activeProperties: 0,
    tagNames: [],
    error: null,
  };

  // One cheap call first: if the scope is missing this 403s and we stop, rather
  // than paging a book we can't annotate.
  const page = await payPropGet<TagRow>(account, "tags", { entity_type: "property", rows: 25 });
  if (!page) {
    return {
      ...empty,
      error:
        "PayProp refused the tags call. Most likely the agency's consent is missing " +
        "read:entity:tags — re-authorise it on production to fix.",
    };
  }

  const tags = (page.items ?? []) as TagRow[];
  const named = tags.map((t) => String(t.name ?? "")).filter(Boolean);

  const withTag = tags.find((t) => WITH_RLP.test(t.name ?? "") && !NO_RLP.test(t.name ?? ""));
  const withoutTag = tags.find((t) => NO_RLP.test(t.name ?? ""));

  // The active book, so archived properties don't inflate the count.
  const properties = await payPropGetAll<{ id?: string }>(account, "export/properties", {
    is_archived: false,
  }).catch(() => [] as { id?: string }[]);
  const active = new Set(properties.map((p) => String(p.id)).filter(Boolean));

  const withIds = withTag?.id ? await entitiesOf(account, withTag.id) : new Set<string>();
  const withoutIds = withoutTag?.id ? await entitiesOf(account, withoutTag.id) : new Set<string>();

  const liveWith = [...withIds].filter((id) => active.has(id)).length;
  const liveWithout = [...withoutIds].filter((id) => active.has(id)).length;

  return {
    account,
    withRlp: withTag ? liveWith : null,
    withoutRlp: withoutTag ? liveWithout : null,
    untagged: active.size - liveWith - liveWithout,
    activeProperties: active.size,
    tagNames: named,
    error:
      withTag || withoutTag
        ? null
        : "Tags are readable here but none of them mention rent protection.",
  };
}

export async function getProtectionBook(): Promise<ProtectionBook> {
  const accounts = payPropAccounts();
  const agencies = await Promise.all(accounts.map(protectionFor));
  const readable = agencies.filter((a) => a.withRlp != null || a.withoutRlp != null);
  return {
    agencies,
    withRlp: readable.reduce((n, a) => n + (a.withRlp ?? 0), 0),
    withoutRlp: readable.reduce((n, a) => n + (a.withoutRlp ?? 0), 0),
    // Named, because a total that silently omits the larger agency is worse
    // than no total at all.
    unreadable: agencies.filter((a) => a.error).map((a) => a.account),
    pulledAt: new Date().toISOString(),
  };
}
