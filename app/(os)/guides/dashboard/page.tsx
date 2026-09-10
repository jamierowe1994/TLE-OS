import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { Aside, Shot, Step, Ui } from "@/components/GuideBits";
import { DASHBOARD_TILES, guideBySlug } from "@/lib/guides";

/**
 * Your Dashboard - the written walkthrough.
 *
 * ── Who this is for ───────────────────────────────────────────────────────
 *
 * Somebody on their first morning who has never used the OS and does not know
 * what a "widget" is. James, 1 Sep: treat them "not as if they're stupid, but
 * as if they don't know what this is". So: no jargon without naming it once,
 * every button pointed at in a picture, and the reason for a behaviour given
 * alongside the behaviour - a person who knows WHY a tile waits a second
 * before it moves does not report it as a fault.
 *
 * ── The one thing this guide exists to say ────────────────────────────────
 *
 * The pause. A tile does not swap places the instant you drag over a spot; it
 * waits for the pointer to settle there for about a second (DWELL_MS in
 * BentoDash). Without that sentence the board reads as unresponsive and the
 * first thing a new agent does is drag harder, which moves nothing. It gets
 * its own step AND its own aside for that reason.
 *
 * ── Why the screenshots are not decoration ────────────────────────────────
 *
 * They are the specification of where a button is. Each was driven and
 * captured on the real dashboard rather than mocked, which means they date:
 * anything that moves on the board needs re-shooting. They live in
 * public/guides/dashboard and were taken at 1400px wide, 2x, then sized down
 * to 1800px - readable at full width without a 5MB page.
 */

export const dynamic = "force-dynamic";

const IMG = "/guides/dashboard";

export default function DashboardGuide() {
  const guide = guideBySlug("dashboard")!;

  return (
    <article className="py-2">
      <Link
        href="/admin/guides"
        className="text-[11.5px] text-muted underline decoration-line underline-offset-2 transition-colors hover:text-ink"
      >
        ← All guides
      </Link>

      <header className="fade-up mt-4 max-w-[62ch]">
        <div className="flex items-center gap-2.5">
          <DoodleIcon name={guide.icon} size={20} className="text-accent-dark" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            {guide.section} · {guide.minutes} min read
          </span>
        </div>
        <h1 className="hand mt-2 text-[30px] leading-tight">{guide.title}</h1>
        <p className="mt-3 text-[13.5px] leading-[1.75] text-muted">
          The dashboard is the first thing you see when you sign in, and it is the one
          screen in the whole system that is genuinely yours. Nobody else has to look at
          it, so it does not have to suit anybody else. This guide walks through what is
          on it and how to rearrange it until it shows the things you actually want to
          see first thing in the morning.
        </p>
        <p className="mt-3 text-[13.5px] leading-[1.75] text-muted">
          You cannot break anything in here. Everything on this page can be undone, and
          there is a button that puts it all back exactly as it started.
        </p>
      </header>

      {/* ── 1 ─────────────────────────────────────────────────────────── */}
      <Step n={1} title="What You Are Looking At">
        <p>
          The dashboard is made of <strong className="font-semibold text-ink">tiles</strong>.
          Each tile is a small summary of one part of your business - how many leads came
          in today, how much of your book is let, what is in your diary this afternoon.
          They are not pictures of numbers. Each one is pulled live when the page loads,
          so what you are reading is what is true right now.
        </p>
        <p className="mt-3">
          This is the board everybody starts with. Eight tiles: four counts across the
          top, three working boxes underneath, and a strip along the bottom showing the
          whole journey from a new lead to a managed property.
        </p>
        <Shot
          src={`${IMG}/01-board.webp`}
          alt="The TLE OS dashboard as it appears on first sign-in, showing eight tiles."
          width={1800}
          height={1299}
          caption="The board everyone starts with. Yours will show your own numbers, not these."
        />
        <p className="mt-4">
          Most tiles are also a door. Clicking one takes you to the full screen behind it
          - the count of applications opens Applications, the diary opens your calendar.
        </p>
        <Aside title="If a tile says it cannot tell who you are">
          <p>
            One or two tiles read your figures out of REX, our estate agency system. Until
            your OS account has been linked to your REX login they cannot tell which
            agent&apos;s numbers to show, so rather than showing you somebody else&apos;s
            they say so and show nothing. That is a one-off bit of setup - tell James and
            it is done in a minute.
          </p>
        </Aside>
      </Step>

      {/* ── 2 ─────────────────────────────────────────────────────────── */}
      <Step n={2} title="Turning On Customise">
        <p>
          Everything in the rest of this guide happens in one mode, and there is one
          button that turns it on. It is at the right-hand end of the row with the search
          box in it, just above the tiles, and it is labelled{" "}
          <Ui>✨ Customise</Ui>.
        </p>
        <Shot
          src={`${IMG}/02-customise-button.webp`}
          alt="The row above the dashboard tiles, with the Customise button at the far right."
          width={1800}
          height={143}
          caption="Top right, on the same line as the search box. Nothing changes until you press it."
        />
        <p className="mt-4">
          Press it and the board changes appearance. That is how you know you are in
          customise mode:
        </p>
        <ul className="mt-2.5 flex list-disc flex-col gap-1.5 pl-4">
          <li>Every tile gets a dashed outline and starts to jiggle gently.</li>
          <li>A small ✕ appears in the top-left corner of each tile.</li>
          <li>A curved bracket appears in the bottom-right corner of each tile.</li>
          <li>
            A little label at the bottom-left of each tile shows its size as two numbers,
            like <span className="text-ink">1×1</span> or{" "}
            <span className="text-ink">2×2</span> - that is how many columns wide by how
            many rows tall it is.
          </li>
          <li>A tray of drawers slides up along the bottom of the screen.</li>
          <li>
            The button you pressed turns into a solid <Ui>Done</Ui>.
          </li>
        </ul>
        <Shot
          src={`${IMG}/03-customise-on.webp`}
          alt="The dashboard in customise mode: dashed tile outlines, remove badges, resize corners and size labels."
          width={1800}
          height={1080}
          caption="Customise mode. The dashed outlines and the ✕ badges are the giveaway."
        />
        <p className="mt-4">
          The tiles stop showing their normal hover behaviour while you are in here, and
          clicking one no longer takes you anywhere. That is deliberate - in customise
          mode a tile is a thing you are arranging, not a link.
        </p>
      </Step>

      {/* ── 3 ─────────────────────────────────────────────────────────── */}
      <Step n={3} title="Changing How Big A Tile Is">
        <p>
          There are two ways, and they do the same job. Use whichever you find easier.
        </p>
        <p className="mt-3">
          <strong className="font-semibold text-ink">The quick way.</strong> Tap a tile
          once - a short press with no dragging - and three sizes appear on top of it:
          Small, Medium and Large. Each has a little shape next to it showing what you
          will get. Pick one and the tile changes immediately.
        </p>
        <Shot
          src={`${IMG}/04-sizes.webp`}
          alt="A tile tapped in customise mode, showing the Small, Medium and Large options."
          width={1800}
          height={461}
          caption="Tap a tile - do not drag it - and the three sizes appear. The highlighted one is its current size."
        />
        <p className="mt-4">
          <strong className="font-semibold text-ink">The precise way.</strong> Press the
          curved bracket in the bottom-right corner of a tile and pull. A dashed outline
          follows your finger or mouse so you can see the shape you are making, and the
          tile snaps to the nearest whole size as you go. You can go up to four columns
          wide and three rows tall.
        </p>
        <Shot
          src={`${IMG}/05-resize.webp`}
          alt="A tile being resized by its corner, with a dashed outline tracking the pull."
          width={1800}
          height={868}
          caption="Pull the corner. The dashed outline is where you are; the tile behind it has already snapped to 2×2."
        />
        <Aside title="Bigger tiles show more, not the same thing larger">
          <p>
            This is the part worth knowing, because it is what makes the sizing worth
            bothering with. Every tile is written to fill whatever room you give it. On
            Market at its smallest is one number. Give it two columns by two rows and it
            splits into available, under offer and let agreed, and lists the properties
            that have been sitting longest with the reason each one might be stuck. Same
            tile, considerably more use.
          </p>
        </Aside>
      </Step>

      {/* ── 4 ─────────────────────────────────────────────────────────── */}
      <Step n={4} title="Moving A Tile - And The Pause">
        <p>
          Press and hold anywhere on a tile, then drag. The tile lifts off the board and
          follows you, and a message appears across the top of the screen telling you
          what will happen when you let go.
        </p>
        <p className="mt-3">
          Move over the spot you want it and the tile already there lights up with a
          coloured outline. That outline is the system telling you where your tile is
          about to land.
        </p>
        <Shot
          src={`${IMG}/06-drag.webp`}
          alt="A tile lifted and following the pointer, with the target tile outlined in accent colour."
          width={1800}
          height={1080}
          caption="Leads Today, in hand. The outlined Applications tile is where it will go. The faded tile is where it came from."
        />
        <Aside title="Hold still for about a second">
          <p>
            The board does not rearrange the instant you pass over a spot. You have to
            settle there and hold for roughly a second before the other tiles shuffle
            aside to make room. It is very easy to read this as the drag not working -
            it is not, it is waiting for you.
          </p>
          <p className="mt-2">
            It works this way on purpose. Without the pause, dragging a tile from one end
            of the board to the other would shove every tile you swept past into a new
            position on the way, and you would arrive at a board you did not recognise.
            Waiting means only the place you actually stopped counts.
          </p>
          <p className="mt-2">
            So: pick it up, move to where you want it, and stop. Do not drag harder or
            wiggle - just wait a moment, watch the tiles move apart, then let go.
          </p>
        </Aside>
        <p className="mt-4">
          All of this works exactly the same with a finger on a touchscreen as it does
          with a mouse. There is only one way it behaves, so there is nothing different to
          learn on a tablet.
        </p>
      </Step>

      {/* ── 5 ─────────────────────────────────────────────────────────── */}
      <Step n={5} title="Taking A Tile Off Your Board">
        <p>Two ways again, and neither one deletes anything.</p>
        <p className="mt-3">
          The quick one is the small ✕ in the tile&apos;s top-left corner. Press it and the
          tile goes.
        </p>
        <p className="mt-3">
          The other is to pick the tile up and drag it off the board entirely - out over
          the menu on the left, or past the edge. The message along the top changes to
          tell you the tile will be removed, and the tile you are holding shrinks and
          tilts to show it is on its way out. Let go and it is gone.
        </p>
        <Shot
          src={`${IMG}/07-remove.webp`}
          alt="A tile dragged off the board over the sidebar, with the banner reading Let go to remove it from your view."
          width={1800}
          height={1080}
          caption="Dragged clear of the board. The message at the top changes to tell you what letting go will do."
        />
        <Aside title="Removed is not deleted">
          <p>
            Taking a tile off only takes it off <em>your</em> view. The tile goes straight
            back into the tray along the bottom, and you can drag it back on whenever you
            like. Nothing is lost, no data is touched, and nobody else&apos;s dashboard
            changes.
          </p>
        </Aside>
      </Step>

      {/* ── 6 ─────────────────────────────────────────────────────────── */}
      <Step n={6} title="Adding Tiles From The Tray">
        <p>
          The tray is the row of drawers along the bottom of the screen while customise is
          on. It holds every tile that is not currently on your board, sorted into groups:
          Performance, Social &amp; ads, The book, People &amp; diary, Management,
          Compliance and News.
        </p>
        <p className="mt-3">
          The small number under each drawer name is how many tiles are inside it. A
          drawer with nothing left in it disappears from the tray rather than sitting there
          empty.
        </p>
        <p className="mt-3">
          Tap a drawer and its tiles pop up above it. Each one says{" "}
          <span className="text-ink">drag me on</span>, which is exactly what to do - press
          one and drag it onto the board, then use the same settle-and-wait from step four
          to drop it where you want it.
        </p>
        <Shot
          src={`${IMG}/08-tray.webp`}
          alt="The tray at the bottom of the screen with the Management drawer open, showing four tiles."
          width={1800}
          height={563}
          caption="The Management drawer, open. Press a tile and drag it up onto the board."
        />
      </Step>

      {/* ── 7 ─────────────────────────────────────────────────────────── */}
      <Step n={7} title="Starting Again, And Finishing">
        <p>
          At the right-hand end of the tray there is <Ui>Reset to default</Ui>. It puts the
          board back to the eight tiles everybody starts with, in their original sizes and
          places. If you have made a mess of it, this is the way out - and it is the reason
          you can experiment freely.
        </p>
        <Shot
          src={`${IMG}/09-reset.webp`}
          alt="The Reset to default button at the right-hand end of the customise tray."
          width={1144}
          height={548}
          caption="Far right of the tray. One press and the board is back to how it started."
        />
        <p className="mt-4">
          When you are happy, press <Ui>Done</Ui> - the same button you pressed to start,
          now solid and in the same place. The dashed outlines and the tray disappear and
          the tiles go back to being links.
        </p>
        <Shot
          src={`${IMG}/10-done.webp`}
          alt="The Done button in the row above the tiles."
          width={1380}
          height={344}
          caption="Done sits exactly where Customise was."
        />
        <Aside title="There is no Save button, and that is not an oversight">
          <p>
            Your board saves itself as you go. There is nothing to remember to press and
            nothing to lose by closing the tab.
          </p>
          <p className="mt-2">
            It saves to <em>you</em> rather than to the computer you are sitting at, so
            the board you build on your laptop at home is the board waiting for you on the
            office machine in the morning.
          </p>
        </Aside>
      </Step>

      {/* ── 8 ─────────────────────────────────────────────────────────── */}
      <Step n={8} title="Every Tile You Can Choose From">
        <p>
          These are all the tiles available, in the drawers the tray puts them in.
          Remember that most of them show more the more room you give them, so it is worth
          making one big before deciding it is not for you.
        </p>

        <div className="mt-5 flex flex-col gap-4">
          {DASHBOARD_TILES.map((group) => (
            <section key={group.group} className="rounded-2xl border border-line/80 bg-panel p-5">
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                <DoodleIcon name={group.icon} size={14} className="text-accent-dark" />
                {group.group}
              </p>
              <dl className="mt-3 flex flex-col gap-2.5">
                {group.tiles.map((t) => (
                  <div key={t.label}>
                    <dt className="text-[12.5px] font-semibold text-ink">{t.label}</dt>
                    <dd className="max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
                      {t.what}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Step>

      {/* ── 9 ─────────────────────────────────────────────────────────── */}
      <Step n={9} title="Two Honest Notes">
        <p>
          <strong className="font-semibold text-ink">The board is built for a laptop
          screen.</strong>{" "}
          On a phone it is cramped and the tiles get clipped. That is a known problem and
          it is on the list to fix - if you are arranging your dashboard, do it at a
          desk.
        </p>
        <p className="mt-3">
          <strong className="font-semibold text-ink">A tile that looks wrong probably
          is.</strong>{" "}
          If a number does not match what you know to be true, or a tile is empty when it
          should not be, that is worth telling us about rather than working around. Steve,
          the character in the bottom-right corner of every screen, has a{" "}
          <Ui>Give feedback</Ui> button. It takes a picture of what you were looking at and
          sends it straight over, so you do not have to explain where you were or what was
          on screen. Use it more than you think you should.
        </p>
      </Step>

      <div className="fade-up mt-9 border-t border-line/70 pt-6">
        <Link
          href="/admin/guides"
          className="text-[12px] text-muted underline decoration-line underline-offset-2 transition-colors hover:text-ink"
        >
          ← All guides
        </Link>
      </div>
    </article>
  );
}
