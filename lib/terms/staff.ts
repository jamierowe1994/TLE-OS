import "server-only";
import { edition } from "@/lib/terms/catalogue";
import type { TermsRow } from "@/lib/terms/store";

/**
 * What a staff screen sees of one set of terms: everything but the details
 * each landlord typed in (their address, registration and, on older editions,
 * bank account), with each person's own link to copy. Shared by the terms
 * routes; a route file may only export its handlers.
 */
export function forStaff(t: TermsRow, origin: string) {
  const asked = (edition(t.version)?.details ?? []).filter((f) => f.required).map((f) => f.key);
  return {
    ...t,
    country: edition(t.version)?.country ?? "scotland",
    parties: t.parties.map((p) => ({
      key: p.key,
      name: p.name,
      email: p.email,
      phone: p.phone,
      status: p.status,
      emailedAt: p.emailedAt,
      emailError: p.emailError,
      openedAt: p.openedAt,
      signedAt: p.signedAt,
      link: `${origin}/sign/${p.token}`,
      /* The home address the agent put on the contract, only while it waits for
         the agent's signature: nobody else has typed anything yet, so it is the
         agent's own words, and the send screen draws it back on the paper when
         they come back to sign (James's send screen, 24 Oct 2026). Once it has
         gone, the address is the landlord's to change and stays theirs. */
      homeAddress: t.status === "agent" ? String(p.details?.address ?? "") : null,
      /* Everything this edition asks for is in. */
      detailsIn: asked.length > 0 && asked.every((k) => String(p.details?.[k] ?? "").trim() !== ""),
    })),
  };
}
