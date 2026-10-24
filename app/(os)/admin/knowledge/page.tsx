"use client";

import { useNewLook } from "@/lib/use-new-look";
import { KnowledgeHubOld, useKnowledgeHub } from "@/components/knowledge/KnowledgeHubBody";
import KnowledgeNew from "@/components/new-look/admin/KnowledgeNew";
import { Loading } from "@/components/new-look/admin/bits";

/**
 * Admin > Content > Knowledge (24 Oct 2026): the same hub as /knowledge,
 * inside the Admin frame. Same data, same edit:knowledge check (the API
 * refuses anybody else and the screen says so). The workspace route keeps
 * its own door for Susan, Francesca, Michael and Kirstie.
 */
export default function AdminKnowledge() {
  const hub = useKnowledgeHub();
  const look = useNewLook("admin");
  if (look === null) return <Loading label="Opening Knowledge…" page />;
  if (!look) return <KnowledgeHubOld hub={hub} />;
  return <KnowledgeNew hub={hub} />;
}
