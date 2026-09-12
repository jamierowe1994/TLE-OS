import Link from "next/link";
import PassportForm, { type PassportQuestion } from "@/components/PassportForm";
import { EMPTY_PASSPORT } from "@/lib/passport-shape";

/**
 * The tenant passport, for somebody with the share link.
 *
 * The real form, in demo mode: every field works, the passport on the right
 * fills in and turns over as you type, and nothing is written anywhere. The
 * token in the URL belongs to no passport, which is why the saving has to be
 * stubbed - otherwise the autosave would 404 and sit there saying "not
 * saved" through the whole demonstration.
 *
 * ── Dressed exactly as the tenant sees it ─────────────────────────────────
 *
 * This is the link James sends Susan for approval (12 Sep 2026), so it wears
 * the tenant shell's masthead and colours rather than the preview's OS
 * chrome, and it pins the light palette: the preview follows the viewer's
 * theme and the clock, and a tenant's passport is never dark.
 *
 * ── It carries example custom questions ───────────────────────────────────
 *
 * The three at the end are what an agent's own questions look like to a
 * tenant: a yes/no, a pick-from-a-list, and one marked as having to be
 * answered. Invented here rather than read from anybody's account.
 */

const SAMPLE_QUESTIONS: PassportQuestion[] = [
  { id: "sample-pets", label: "Do you have a pet?", kind: "yesno", options: [], required: false },
  { id: "sample-parking", label: "How many parking spaces will you need?", kind: "select", options: ["None", "One", "Two or more"], required: false },
  { id: "sample-notice", label: "How much notice do you have to give where you are now?", kind: "text", options: [], required: true },
];

/* The light palette, pinned. The tenant shell's tokens (globals.css). */
const LIGHT = {
  "--ink": "#101014",
  "--muted": "#6b6b70",
  "--line": "#c9c9c9",
  "--page": "#ffffff",
  "--card": "#ffffff",
  "--panel": "#fbfbfa",
  "--box": "#fcfcfc",
} as React.CSSProperties;

export default async function PreviewPassport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <div data-surface="tenant" className="min-h-screen font-sans text-[#16181d]" style={LIGHT}>
      <header className="border-b border-black/10">
        <div className="flex h-16 w-full items-center justify-between px-5 sm:px-8 lg:px-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/tle-logo.png" alt="The Letting Experts" className="h-11 w-auto" />
          <nav className="flex items-center gap-4 text-[12.5px] font-medium text-black/60">
            <span className="hidden sm:inline">A sample passport. Type in it freely - nothing is saved and it is about nobody.</span>
            <Link href={`/preview/${token}`} className="rounded-full border border-black/15 px-3.5 py-1.5 transition-colors hover:border-black/40 hover:text-black">
              Back
            </Link>
          </nav>
        </div>
      </header>
      <main className="w-full">
        <PassportForm
          demo
          token="sample"
          initial={{ ...EMPTY_PASSPORT, legalName: "Alex Sample", email: "alex.sample@example.com" }}
          submittedAt={null}
          questions={SAMPLE_QUESTIONS}
          agentName="Sam"
        />
      </main>
    </div>
  );
}
