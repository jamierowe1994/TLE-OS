"use client";

import { useState } from "react";
import AssistantCharacter, { type Mood } from "@/components/AssistantCharacter";

/**
 * Every face Steve can pull, in one place.
 *
 * He only ever shows one at a time in the corner, and most of them are tied to
 * something you have to do first - so without this, the only way to check a
 * new expression was to go and provoke it. Lives on the admin Steve page.
 *
 * A tile replays its gesture when clicked: the one-shots (the hop, the yawn,
 * the bow) are over in a second, and the way to see one again is to remount
 * the character, which is what bumping its key does.
 */
const MOODS: Array<{ mood: Mood; name: string; when: string }> = [
  { mood: "idle", name: "Idle", when: "Most of the time. Hovering, blinking, following the cursor." },
  { mood: "wave", name: "Wave", when: "When you open him." },
  { mood: "thinking", name: "Thinking", when: "While a question is with him." },
  { mood: "talking", name: "Talking", when: "The moment an answer lands." },
  { mood: "happy", name: "Happy", when: "When somebody says thanks, or sends an idea." },
  { mood: "sad", name: "Sad", when: "When something is reported broken." },
  { mood: "confused", name: "Confused", when: "When something is reported confusing." },
  { mood: "idea", name: "Idea", when: "When the feedback is an idea." },
  { mood: "nod", name: "Nod", when: "After a bug or a confusion is sent. Thanks for telling us." },
  { mood: "bored", name: "Bored", when: "Left alone for a while. Bounces a bit." },
  { mood: "yawn", name: "Yawn", when: "About a minute in, just before the phone." },
  { mood: "texting", name: "Texting", when: "Left alone for a minute." },
  { mood: "asleep", name: "Asleep", when: "Left alone for two." },
  { mood: "surprised", name: "Surprised", when: "Woken by a click." },
  { mood: "sorry", name: "Sorry", when: "When he has no answer." },
  { mood: "flex", name: "Flex", when: "While the tour is showing him off." },
];

export default function SteveRepertoire() {
  const [plays, setPlays] = useState<Record<string, number>>({});
  return (
    <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {MOODS.map((m) => (
        <li key={m.mood}>
          <button
            type="button"
            onClick={() => setPlays((p) => ({ ...p, [m.mood]: (p[m.mood] ?? 0) + 1 }))}
            className="flex w-full items-center gap-3 rounded-xl border border-line/70 bg-panel p-3 text-left transition-colors hover:border-ink/40"
          >
            <span className="shrink-0 text-ink">
              <AssistantCharacter key={plays[m.mood] ?? 0} mood={m.mood} size={64} track={false} />
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px]">{m.name}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">{m.when}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
