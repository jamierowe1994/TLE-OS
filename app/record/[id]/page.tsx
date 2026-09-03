import RecordSession from "@/components/RecordSession";

/**
 * /record/<appraisal> — straight into the recorder.
 *
 * Behind the sign-in door like the rest of the OS. The link in the nudge
 * carries its own key (lib/record-link), so an agent coming from their
 * inbox never sees the door; anyone else is sent to sign in and brought
 * back here.
 */
export const dynamic = "force-dynamic";

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordSession appraisalId={id} />;
}
