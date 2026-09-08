import PostcardStudio from "@/components/PostcardStudio";
import PageHeader from "@/components/PageHeader";

/**
 * The studio on its own page, for anybody who reaches it by link. The same
 * component Bond hosts in its Designs room, so the two cannot drift.
 */
export const metadata = { title: "Postcard designs" };

export default function DesignsPage() {
  return (
    <>
      <PageHeader
        title="Postcard Designs"
        blurb="The cards Bond sends. Set the words and the picture within the shape that keeps them ours, then send a proof to anybody who should see it first."
      />
      <div className="mt-8">
        <PostcardStudio />
      </div>
    </>
  );
}
