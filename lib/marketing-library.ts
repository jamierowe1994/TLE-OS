import "server-only";
import { listKnowledge, type KnowledgeEntry } from "@/lib/business/knowledge-store";

/**
 * THE MARKETING LIBRARY, READ (Susan via James, 13 Oct 2026).
 *
 * Every file on Francesca's File Store was read (text, or the page images
 * where a guide is all pictures) and written up as a knowledge entry on the
 * "Marketing library" shelf: what it is, who it is for, England and Wales or
 * Scotland, its key points, when to offer it, and the file it is. Francesca
 * sees and edits them on the Knowledge screen like any other entry.
 *
 * They are too many to send Steve whole with every question, so his prompt
 * carries one line each (libraryIndex) and find_file pulls up the full entry
 * of whatever matches, so he can say a line about it and hand the PDF over.
 */

export const LIBRARY_SECTION = "Marketing library";

export type LibraryEntry = { id: string; title: string; content: string; key: string | null; file: string | null; audience: string; what: string };

function parse(e: KnowledgeEntry): LibraryEntry {
  const line = (label: string) => e.content.match(new RegExp(`^${label}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? null;
  return {
    id: e.id,
    title: e.title,
    content: e.content,
    key: line("File key"),
    file: line("File"),
    audience: line("For") ?? "",
    what: e.content.split(/\n\s*\n/)[0]?.trim() ?? "",
  };
}

export async function libraryEntries(all?: KnowledgeEntry[]): Promise<LibraryEntry[]> {
  const entries = all ?? (await listKnowledge());
  return entries.filter((e) => e.section === LIBRARY_SECTION).map(parse);
}

/** One line a file, for Steve's prompt. */
export function libraryIndex(entries: LibraryEntry[]): string {
  return entries
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((e) => `- ${e.title} (${e.audience}): ${e.what.split(/(?<=\.)\s/)[0]}`)
    .join("\n");
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
const stem = (w: string) => (w.length > 5 ? w.slice(0, -2) : w.replace(/s$/, ""));
const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "for", "on", "in", "about", "guide", "file", "pdf", "our", "me", "my", "any", "do", "we", "have", "is", "it", "with"]);

/** The entries a question is about, best first: title words count most. */
export function searchLibrary(entries: LibraryEntry[], query: string, limit = 4): LibraryEntry[] {
  const words = norm(query).split(" ").filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
  if (!words.length) return [];
  const scored = entries.map((e) => {
    const t = norm(`${e.title} ${e.file ?? ""}`);
    const c = norm(e.content);
    let score = 0;
    for (const w of words) {
      if (t.includes(w)) score += 3;
      else if (c.includes(w)) score += 1;
    }
    return { e, score };
  });
  const best = Math.max(0, ...scored.map((s) => s.score));
  return scored
    .filter((s) => s.score > 0 && s.score >= Math.min(best, Math.ceil(words.length * 0.6)))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.e);
}
