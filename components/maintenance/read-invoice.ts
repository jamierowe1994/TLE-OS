/**
 * Read an invoice the moment it is attached (lib/invoice-read, 20 Oct 2026),
 * for a form to fill in for the agent to check. Null when it can't be read:
 * the agent types the figure, as before.
 */
export type InvoiceFigures = { total: number | null; ref: string | null; date: string | null; from: string | null };

export async function readInvoiceFile(file: File): Promise<InvoiceFigures | null> {
  const fd = new FormData();
  fd.append("file", file);
  const j = await fetch("/api/contractors/invoice/read", { method: "POST", body: fd }).then((r) => r.json()).catch(() => null);
  return j?.ok ? (j.read as InvoiceFigures) : null;
}

/** "£240.50 · invoice HCM-1182", or null when nothing useful was read. */
export function readLine(r: InvoiceFigures | null): string | null {
  if (!r || (r.total == null && !r.ref)) return null;
  const money = r.total != null ? `£${r.total.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
  return [money, r.ref ? `invoice ${r.ref}` : null].filter(Boolean).join(" · ");
}
