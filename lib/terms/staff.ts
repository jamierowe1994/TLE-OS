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
      /* Everything this edition asks for is in. */
      detailsIn: asked.length > 0 && asked.every((k) => String(p.details?.[k] ?? "").trim() !== ""),
    })),
  };
}
