import DoodleIcon from "@/components/DoodleIcon";

/**
 * Where a lead came from, as a mark rather than a word.
 *
 * A source column is read by shape, not by reading: five rows of "Rightmove"
 * is a wall of text saying the same thing, where five teal houses is a glance.
 * So the portals and the ad channels wear their own brand, and the channels
 * that are ours — the website, a referral, someone ringing up — wear the
 * app's own doodle ink, which keeps them clearly OURS and not a portal.
 *
 * Every mark carries the source name as its tooltip and as screen-reader text,
 * because an icon nobody can name is worse than the word it replaced.
 */

/** Real brand icons, as supplied. Never given `.art` — dark mode must not
 *  invert a logo. */
const LOGO: Record<string, string> = {
  rightmove: "/brand/rightmove.png",
  zoopla: "/brand/zoopla.png",
};

/** Ours, in the app's own hand. */
const DOODLE: Record<string, string> = {
  website: "link",
  referral: "star",
  direct: "mail",
  phone: "call",
  email: "mail",
  walkin: "home",
};

/** Portals we have no icon file for yet: their initials, in their colour. */
const LETTERS: Record<string, { text: string; bg: string; fg: string }> = {
  getagent: { text: "GA", bg: "#0a2540", fg: "#ffffff" },
};

const SIZE = 20;

function key(source: string): string {
  return source.toLowerCase().replace(/[^a-z]/g, "");
}

/** Which family a source belongs to — the matching is deliberately loose,
 *  because REX hands back "Rightmove", live leads say "rightmove.com", and
 *  the sample book says "Instagram ad". */
function classify(source: string) {
  const k = key(source);
  if (k.includes("rightmove")) return { kind: "logo", id: "rightmove" } as const;
  if (k.includes("zoopla") || k.includes("zpg")) return { kind: "logo", id: "zoopla" } as const;
  if (k.includes("instagram")) return { kind: "instagram" } as const;
  if (k.includes("facebook") || k.includes("meta")) return { kind: "facebook" } as const;
  if (k.includes("onthemarket")) return { kind: "onthemarket" } as const;
  if (k.includes("getagent")) return { kind: "letters", id: "getagent" } as const;
  for (const id of Object.keys(DOODLE)) if (k.includes(id)) return { kind: "doodle", id } as const;
  return { kind: "unknown" } as const;
}

function Instagram() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" aria-hidden>
      <defs>
        {/* The app icon's own corner-to-corner ramp: amber, through magenta,
            into indigo. */}
        <linearGradient id="ig-ramp" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F9CE34" />
          <stop offset="0.35" stopColor="#EE2A7B" />
          <stop offset="0.7" stopColor="#8134AF" />
          <stop offset="1" stopColor="#515BD4" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#ig-ramp)" />
      <rect
        x="6.4" y="6.4" width="11.2" height="11.2" rx="3.4"
        fill="none" stroke="#fff" strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="#fff" strokeWidth="1.7" />
      <circle cx="16.1" cy="7.9" r="1.15" fill="#fff" />
    </svg>
  );
}

function Facebook() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#1877F2" />
      <path
        d="M16 7.4h-2c-2.2 0-3.7 1.5-3.7 3.7v1.5H8.2v2.9h2.1V22h3.1v-6.5h2.2l.4-2.9h-2.6v-1.2c0-.8.2-1.1 1-1.1H16V7.4Z"
        fill="#fff"
      />
    </svg>
  );
}

/**
 * OnTheMarket's pin, redrawn from the supplied logo as a path rather than
 * shipped as the file: theirs is a JPEG on a white square, and a white tile is
 * a hole in this page's warm paper — worse on the dark theme. The coral is
 * their own, sampled off that file (#EB5C5E).
 */
function OnTheMarket() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 22c0 0 8.2-8.1 8.2-13A8.2 8.2 0 1 0 3.8 9c0 4.9 8.2 13 8.2 13Z"
        fill="none"
        stroke="#EB5C5E"
        strokeWidth="2.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Letters({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[6px] font-semibold"
      style={{
        width: SIZE,
        height: SIZE,
        background: bg,
        color: fg,
        fontSize: text.length > 2 ? 7.5 : 9,
        letterSpacing: "-0.02em",
        // These are dark chips on what is a dark page in dark mode; without a
        // hairline the chip's edge vanishes and the letters float.
        boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.14)",
      }}
    >
      {text}
    </span>
  );
}

export default function SourceMark({ source, className = "" }: { source: string; className?: string }) {
  const c = classify(source);
  const label = source || "Unknown";

  const mark = (() => {
    switch (c.kind) {
      case "logo":
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={LOGO[c.id]}
            alt=""
            width={SIZE}
            height={SIZE}
            className="rounded-[6px]"
            style={{ width: SIZE, height: SIZE }}
          />
        );
      case "instagram":
        return <Instagram />;
      case "facebook":
        return <Facebook />;
      case "onthemarket":
        return <OnTheMarket />;
      case "letters":
        return <Letters {...LETTERS[c.id]} />;
      case "doodle":
        return (
          <span className="inline-flex items-center justify-center rounded-[6px] bg-accent-soft/60 text-ink" style={{ width: SIZE, height: SIZE }}>
            <DoodleIcon name={DOODLE[c.id]} size={13} />
          </span>
        );
      default:
        // An unmapped source still has to say something: its own first letter,
        // quietly, rather than a blank cell.
        return <Letters text={label.slice(0, 1).toUpperCase()} bg="var(--accent-soft)" fg="var(--ink)" />;
    }
  })();

  return (
    <span className={`inline-flex items-center ${className}`} title={label}>
      {mark}
      <span className="sr-only">{label}</span>
    </span>
  );
}
