import MoreHomesList from "@/components/tenant/MoreHomesList";

/** The list a home page links back to: the same as the landing page. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Homes to rent · The Letting Experts" };

export default async function MoreHomesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <MoreHomesList token={token} />;
}
