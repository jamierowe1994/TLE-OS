/**
 * The frame every door wears: sign in, joining, a forgotten password, the
 * office code.
 *
 * One card, the form on the left and a painting on the right (James, 13 Sep
 * 2026). They were four separate centred boxes with a line-drawing on one of
 * them, and the first thing anybody sees of the OS is a door - so all four
 * now read as the same building.
 *
 * Two kinds of art, because James's own pictures come in two kinds. A SCENE
 * (the street, the house, the block of flats) fills its half edge to edge; a
 * CUT-OUT with no background (the desk) stands on the bottom edge of a sage
 * panel, the way a lead or an appraisal hero carries its picture.
 */

type Art = "street" | "desk" | "house" | "building";

const ART: Record<Art, { src: string; scene: boolean; position?: string }> = {
  /* Held to the right so the door and the bicycle survive the crop. */
  street: { src: "/brand/art/sign-in.webp", scene: true, position: "78% center" },
  house: { src: "/brand/art/lead-house.webp", scene: false },
  building: { src: "/brand/art/lead-building.webp", scene: false },
  desk: { src: "/brand/art/desk.webp", scene: false },
};

export default function DoorFrame({
  art = "street",
  children,
}: {
  art?: Art;
  children: React.ReactNode;
}) {
  const a = ART[art];
  return (
    <main className="os-type flex min-h-screen items-center justify-center bg-page px-5 py-10">
      <div className="w-full max-w-[1020px] overflow-hidden rounded-[28px] border border-line/50 bg-card shadow-[0_40px_90px_-50px_rgba(0,0,0,0.35)]">
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
          <div className="min-w-0 p-8 sm:p-11">
            {/* The logo itself, not the words. Two files because the wordmark
                is ink: the dark theme gets the white copy. */}
            <div className="mb-7">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tle-os-logo.png" alt="TLE OS" className="art-light h-auto w-[188px] object-contain" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/tle-os-logo-dark.png" alt="" aria-hidden className="art-dark h-auto w-[188px] object-contain" />
            </div>
            {children}
            <p className="mt-7 text-[11px] text-muted">The Letting Experts</p>
          </div>

          {/* Under md the panel drops away: on a phone the form is the whole
              job, and 300px of picture above it just pushes it off screen. */}
          <div className={`relative hidden min-h-[360px] overflow-hidden md:block ${a.scene ? "" : "bg-sage/25"}`}>
            {a.scene ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={a.src}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: a.position ?? "center" }}
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={a.src}
                alt=""
                aria-hidden
                className="pointer-events-none absolute bottom-0 left-1/2 w-[118%] max-w-none -translate-x-1/2"
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
