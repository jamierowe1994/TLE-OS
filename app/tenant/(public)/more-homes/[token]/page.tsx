import MoreHomesList from "@/components/tenant/MoreHomesList";

/** Show Me Other Homes, from "it's been let" (lib/more-homes-page). */

export const dynamic = "force-dynamic";
export const metadata = { title: "Homes to rent · The Letting Experts" };

export default async function MoreHomesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <MoreHomesList token={token} />;
}
