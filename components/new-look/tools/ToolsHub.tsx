"use client";

import PageHeader from "@/components/PageHeader";
import ToolsGrid from "@/components/ToolsGrid";
import ToolsNew from "@/components/new-look/tools/ToolsNew";
import { useNewLook } from "@/lib/use-new-look";

/** Tools as it is, or in the new look while lib/new-look "tools" is on for this person. */
export default function ToolsHub() {
  const look = useNewLook("tools");
  if (look === null) {
    return (
      <p className="flex items-center gap-2 py-16 text-[12.5px] text-muted">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
        Opening Tools…
      </p>
    );
  }
  if (look) return <ToolsNew />;
  return (
    <>
      <PageHeader title="Tools" blurb="The kit that sits alongside your book. Some comes with your package, some is bought separately." />
      <ToolsGrid />
    </>
  );
}
