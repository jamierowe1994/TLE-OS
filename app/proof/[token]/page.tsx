import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { designByToken } from "@/lib/postcard-store";
import { PostcardPair } from "@/components/Postcard";

/**
 * A postcard, shown to somebody who has no account.
 *
 * James, 8 Sep 2026: "be able to create a postcard and then be able to send
 * it out to Susan so she can then look at it." So: a link, both sides at
 * print size, and nothing else on the page to argue with.
 *
 * The link is the credential, like every other proof surface in the OS, and
 * it reaches this card and nothing else.
 */

export const metadata: Metadata = {
  title: "A postcard to look at",
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = "force-dynamic";

export default async function Proof({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const design = await designByToken(token);
  if (!design) notFound();

  return (
    <main style={{ minHeight: "100vh", background: "#f2f0eb", padding: "40px 20px 64px", fontFamily: "Montserrat, system-ui, sans-serif", color: "#101014" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b6b70", margin: 0 }}>
          The Letting Experts · a proof
        </p>
        <h1 style={{ fontSize: 27, fontWeight: 500, margin: "8px 0 0", letterSpacing: 0 }}>{design.name}</h1>
        <p style={{ margin: "6px 0 28px", fontSize: 13, color: "#6b6b70", maxWidth: "60ch", lineHeight: 1.6 }}>
          Both sides, at the size it prints: A6, 148 by 105mm. The name and address are an example - each card is filled in for the
          landlord it goes to. Nothing has been posted.
        </p>
        <PostcardPair design={design} width={460} />
        <p style={{ marginTop: 32, fontSize: 11.5, color: "#8b8781" }}>
          Seen something wrong? Reply to the email this came in and it gets fixed before anything is printed.
        </p>
      </div>
    </main>
  );
}
