import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { assistantConfigured, budget, systemPromptPreview } from "@/lib/assistant-brain";
import { systemMap } from "@/lib/system-map";
import { listKnowledge } from "@/lib/business/knowledge-store";

/**
 * Whether the assistant can currently answer, and what he has spent today.
 *
 * GET /api/admin/assistant-brain → { live, spent, cap }
 *
 * Deliberately reports the two failure modes separately at the console — no
 * key and over-budget look identical to an agent but need completely
 * different responses from James.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:people"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const b = await budget();

  /* Counted separately from the prompt so the console can distinguish the three
     states that look identical from the outside: entries loaded, table empty,
     table unreadable. An empty knowledge base is normal and only limits what he
     can say about policy; a failed read is a fault. */
  let knowledgeCount = 0;
  let knowledgeReadable = true;
  try {
    knowledgeCount = (await listKnowledge()).length;
  } catch {
    knowledgeReadable = false;
  }

  const prompt = await systemPromptPreview();

  return NextResponse.json({
    live: assistantConfigured() && b.left > 0,
    configured: assistantConfigured(),
    spent: b.spent,
    cap: b.cap,
    knowledgeCount,
    knowledgeReadable,
    /* THE WHOLE PROMPT, not just the map. The map alone looked complete and hid
       the block that was telling him he knew nothing. An assistant whose
       context you cannot read is one you cannot correct — and half of it read
       exactly like all of it. */
    prompt: prompt.text,
    promptBlocks: prompt.blocks,
    promptChars: prompt.chars,
    /* Kept for the existing panel. */
    map: systemMap(),
  });
}
