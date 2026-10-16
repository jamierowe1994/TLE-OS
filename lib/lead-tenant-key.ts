/** How one applicant is known across reads, page and server alike (lib/lead-tenant): their contact id, else email, else name. */
export function applicantKey(p: { name: string; email: string | null; contactId: string | null }): string {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  if (p.contactId) return `c:${p.contactId}`;
  if (p.email) return `e:${norm(p.email)}`;
  return `n:${norm(p.name)}`;
}
