import { notFound } from "next/navigation";
import TourNew from "@/components/new-look/learning/TourNew";
import type { ShowroomSide } from "@/lib/showroom/content";
import { previewToken } from "@/lib/preview-token";

/**
 * One journey on the Systems tour. Server-side for the same reason as the
 * Showroom: the demo screens open under the preview token, which never leaves
 * the server except inside the frames' addresses.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Systems tour" };

const SIDES: ShowroomSide[] = ["landlord", "tenant", "agent"];

export default async function TourPage({ params, searchParams }: { params: Promise<{ side: string }>; searchParams: Promise<{ stop?: string }> }) {
  const { side } = await params;
  if (!SIDES.includes(side as ShowroomSide)) notFound();
  const { stop } = await searchParams;
  return <TourNew side={side as ShowroomSide} token={previewToken()} start={stop ?? null} />;
}
