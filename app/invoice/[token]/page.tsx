import { notFound } from "next/navigation";
import { getInvoiceByToken } from "@/lib/invoices";
import InvoiceDoc from "@/components/InvoiceDoc";
import PrintButton from "@/app/invoice/[token]/print";

/**
 * The invoice, as the person it is to sees it: the document, on white,
 * with a button to print or save it as a PDF. Reached by the unguessable
 * token in the email; no sign-in, no chrome.
 */
export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getInvoiceByToken(token);
  if (!inv || inv.status === "draft") notFound();
  return (
    <main style={{ minHeight: "100vh", background: "#f2f0eb", padding: "24px 12px 48px", fontFamily: "Montserrat, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 800, margin: "0 auto 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }} className="inv-bar">
        <span style={{ fontSize: 12, color: "#6b6b70" }}>{inv.from.companyName} · Invoice {inv.number}</span>
        <PrintButton />
      </div>
      <div style={{ maxWidth: 800, margin: "0 auto", background: "#fff", borderRadius: 12, boxShadow: "0 24px 60px -40px rgba(0,0,0,0.35)" }}>
        <InvoiceDoc inv={inv} />
      </div>
      <style>{`@media print { body { background: #fff !important; } .inv-bar { display: none !important; } main { padding: 0 !important; background: #fff !important; } }`}</style>
    </main>
  );
}
