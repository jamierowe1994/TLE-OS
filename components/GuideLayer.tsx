"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import GuideModal from "@/components/GuideModal";
import { AGENT_GUIDES } from "@/lib/agent-guides";
import { closeGuide, openGuide, useOpenGuideId } from "@/lib/guide-sheet";

/**
 * Draws whichever agent guide is open, over whatever screen the agent is on.
 *
 * Opened by `openGuide(id)` (Steve's Guides tab, the How this works buttons)
 * or by a link carrying `?walkthrough=<id>`, so a guide can be sent to
 * somebody as a URL and still arrive as a pop-up on the right screen. The
 * parameter is taken off the address once read, so closing the guide and
 * reloading does not open it again.
 */
export default function GuideLayer() {
  const id = useOpenGuideId();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();

  const asked = params.get("walkthrough");
  useEffect(() => {
    if (!asked) return;
    if (AGENT_GUIDES.some((g) => g.id === asked)) openGuide(asked);
    const rest = new URLSearchParams(params.toString());
    rest.delete("walkthrough");
    const q = rest.toString();
    router.replace(q ? `${path}?${q}` : path, { scroll: false });
  }, [asked, params, path, router]);

  const g = id ? AGENT_GUIDES.find((x) => x.id === id) : null;
  if (!g) return null;
  return <GuideModal g={g} onClose={closeGuide} />;
}
