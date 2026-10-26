/**
 * Illustrated covers for Tools > Learning (James, 26 Oct 2026: the old tiles
 * looked "half-cooked", "not just that we stuck an icon on a thing"). Flat,
 * layered drawings in the learning palette (app/new-look/learning.css), one
 * line weight throughout (vector-effect keeps it the same at any size).
 *
 * Each drawing is built in three layers, cv-a (back), cv-b (middle) and cv-c
 * (front), plus a cv-f piece that floats. Hovering the tile lifts the layers
 * by different amounts, a small parallax; reduced motion keeps them still.
 * The layer groups never carry a transform attribute of their own, because the
 * CSS transform would replace it; any tilt sits on a group inside.
 *
 * Shape classes (styled in learning.css under .nl-cv):
 *   p paper + line · m mid tone + line · d deep tone + line · c coral + line
 *   q soft tone + line · s soft tone, no line · l line only · k solid ink
 *   w solid paper · h ground shadow · t type in the heading face
 */

export type CoverTone = "clay" | "sage" | "brown" | "coral";

function Frame({ tone, children }: { tone: CoverTone; children: React.ReactNode }) {
  return (
    <svg className={`nl-cv is-${tone}`} viewBox="0 0 360 170" preserveAspectRatio="xMidYMid meet" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

/** A four-point sparkle centred on (x, y). */
function Spark({ x, y, r = 7 }: { x: number; y: number; r?: number }) {
  const q = r * 0.28;
  return <path className="c" d={`M${x},${y - r} Q${x + q},${y - q} ${x + r},${y} Q${x + q},${y + q} ${x},${y + r} Q${x - q},${y + q} ${x - r},${y} Q${x - q},${y - q} ${x},${y - r} Z`} />;
}

/** A tick inside a coral disc. */
function Tick({ x, y, r = 9 }: { x: number; y: number; r?: number }) {
  return (
    <>
      <circle className="c" cx={x} cy={y} r={r} />
      <path className="l" d={`M${x - r * 0.42},${y + r * 0.02} L${x - r * 0.1},${y + r * 0.36} L${x + r * 0.46},${y - r * 0.32}`} />
    </>
  );
}

/* ── Learning: the two doors ─────────────────────────────────────────────── */

/** Guides: a fanned stack of TLE booklets, the front one with a bookmark. */
export function GuidesCover() {
  return (
    <Frame tone="clay">
      <circle className="s" cx="180" cy="168" r="118" />
      <circle className="s" cx="62" cy="44" r="9" />
      <circle className="s" cx="310" cy="112" r="6" />
      <ellipse className="h" cx="182" cy="154" rx="96" ry="6" />
      <g className="cv-a">
        <g transform="rotate(-14 140 150)">
          <rect className="m" x="94" y="36" width="84" height="112" rx="6" />
          <path className="l" d="M104,36 V148" />
          <rect className="w" x="114" y="56" width="50" height="5" rx="2.5" />
          <rect className="w" x="114" y="66" width="34" height="5" rx="2.5" />
        </g>
      </g>
      <g className="cv-b">
        <g transform="rotate(-4 170 150)">
          <rect className="p" x="126" y="28" width="86" height="118" rx="6" />
          <path className="l" d="M136,28 V146" />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect className="q" x="146" y={50 + i * 20} width="10" height="10" rx="2.5" />
              <path className="l" d={`M148.5,${55 + i * 20} l2.5,2.5 l4,-5`} />
              <rect className="k" x="162" y={53 + i * 20} width={i === 1 ? 26 : 36} height="4" rx="2" />
            </g>
          ))}
          <rect className="s" x="146" y="114" width="52" height="4" rx="2" />
          <rect className="s" x="146" y="124" width="38" height="4" rx="2" />
        </g>
      </g>
      <g className="cv-c">
        <g transform="rotate(7 214 150)">
          <rect className="p" x="166" y="30" width="92" height="120" rx="6" />
          <path className="m" d="M172,30 H252 A6,6 0 0 1 258,36 V92 H166 V36 A6,6 0 0 1 172,30 Z" />
          <path className="l" d="M176,30 V150" />
          <path className="l" d="M199,68 L215,54 L231,68 M202,66 V82 H228 V66 M211.5,82 V74 H218.5 V82" />
          <text className="t" x="186" y="111">TLE</text>
          <rect className="k" x="186" y="118" width="54" height="4" rx="2" />
          <rect className="s" x="186" y="128" width="40" height="4" rx="2" />
          <path className="c" d="M238,146 V160 L243,155.5 L248,160 V146 Z" />
        </g>
      </g>
      <g className="cv-f">
        <Spark x={288} y={42} r={9} />
        <Spark x={96} y={22} r={5} />
      </g>
    </Frame>
  );
}

/** Systems: the OS on a desktop window, a phone behind, a done notice in front. */
export function SystemsCover() {
  return (
    <Frame tone="sage">
      <circle className="s" cx="180" cy="168" r="118" />
      <circle className="s" cx="54" cy="60" r="8" />
      <ellipse className="h" cx="190" cy="154" rx="110" ry="6" />
      <g className="cv-a">
        <g transform="rotate(8 270 120)">
          <rect className="m" x="248" y="40" width="52" height="98" rx="10" />
          <rect className="p" x="254" y="52" width="40" height="74" rx="4" />
          <rect className="s" x="260" y="60" width="28" height="18" rx="3" />
          <rect className="k" x="260" y="84" width="22" height="3.5" rx="1.75" />
          <rect className="s" x="260" y="92" width="16" height="3.5" rx="1.75" />
        </g>
      </g>
      <g className="cv-b">
        <rect className="p" x="78" y="28" width="196" height="120" rx="10" />
        <path className="m" d="M78,47 H122 V148 H88 A10,10 0 0 1 78,138 Z" />
        <path className="l" d="M78,47 H274" />
        <circle className="c" cx="90" cy="37.5" r="3" />
        <circle className="q" cx="100" cy="37.5" r="3" />
        <circle className="q" cx="110" cy="37.5" r="3" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} className={i === 1 ? "c" : "w"} x="86" y={58 + i * 14} width="28" height="6" rx="3" />
        ))}
        <rect className="q" x="132" y="58" width="62" height="36" rx="6" />
        <rect className="k" x="140" y="67" width="28" height="4" rx="2" />
        <rect className="w" x="140" y="77" width="40" height="8" rx="2" />
        <rect className="q" x="202" y="58" width="62" height="36" rx="6" />
        {[10, 18, 13, 24].map((h, i) => (
          <rect key={i} className={i === 3 ? "c" : "m"} x={211 + i * 12} y={88 - h} width="7" height={h} rx="2" />
        ))}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <circle className="q" cx="138" cy={108 + i * 13} r="3.5" />
            <rect className={i === 0 ? "k" : "s"} x="147" y={106 + i * 13} width={i === 2 ? 56 : 84} height="4" rx="2" />
          </g>
        ))}
      </g>
      <g className="cv-c">
        <rect className="p" x="204" y="114" width="104" height="36" rx="11" />
        <Tick x={222} y={132} r={9} />
        <rect className="k" x="238" y="125" width="54" height="4.5" rx="2.25" />
        <rect className="s" x="238" y="135" width="36" height="4.5" rx="2.25" />
      </g>
      <g className="cv-f">
        <path className="p" d="M176,92 V112 L181,107 L185.5,116 L189.5,114 L185,105 L192,105 Z" />
        <Spark x={300} y={28} r={7} />
      </g>
    </Frame>
  );
}

/* ── Systems: the three journeys ─────────────────────────────────────────── */

/** The landlord: a home, the signed terms beside it, and the keys. */
function LandlordCover() {
  return (
    <Frame tone="clay">
      <circle className="s" cx="180" cy="168" r="118" />
      <circle className="s" cx="300" cy="40" r="10" />
      <ellipse className="h" cx="184" cy="152" rx="118" ry="6" />
      <g className="cv-a">
        <path className="l" d="M84,150 V116" />
        <circle className="m" cx="84" cy="102" r="20" />
        <circle className="q" cx="66" cy="132" r="12" />
      </g>
      <g className="cv-b">
        <rect className="m" x="180" y="38" width="13" height="26" rx="2" />
        <rect className="p" x="110" y="74" width="98" height="76" />
        <path className="m" d="M99,80 L159,32 L219,80 Z" />
        <circle className="p" cx="159" cy="62" r="7.5" />
        <path className="c" d="M148,150 V121 A11,11 0 0 1 170,121 V150 Z" />
        <circle className="k" cx="165" cy="136" r="1.6" />
        <rect className="q" x="120" y="92" width="20" height="20" rx="3" />
        <path className="l" d="M130,92 V112 M120,102 H140" />
        <rect className="q" x="178" y="92" width="20" height="20" rx="3" />
        <path className="l" d="M188,92 V112 M178,102 H198" />
      </g>
      <g className="cv-c">
        <g transform="translate(10 -4) rotate(8 262 110)">
          <rect className="p" x="226" y="54" width="74" height="96" rx="5" />
          <text className="t" x="236" y="72">Terms</text>
          <rect className="k" x="236" y="80" width="52" height="3.5" rx="1.75" />
          <rect className="s" x="236" y="88" width="46" height="3.5" rx="1.75" />
          <rect className="s" x="236" y="96" width="50" height="3.5" rx="1.75" />
          <rect className="s" x="236" y="104" width="30" height="3.5" rx="1.75" />
          <path className="l" d="M236,128 C242,116 246,132 252,122 C256,116 258,130 264,124" />
          <path className="l" d="M236,134 H270" />
          <circle className="c" cx="284" cy="132" r="8" />
          <path className="l" d="M280.5,132 l2.5,2.5 l4.5,-5" />
        </g>
      </g>
      <g className="cv-f">
        <circle className="l" cx="214" cy="140" r="9" />
        <g transform="rotate(24 226 146)">
          <circle className="c" cx="226" cy="146" r="7.5" />
          <circle className="w" cx="226" cy="146" r="2.4" />
          <path className="l" d="M233.5,146 H254 M246,146 v5 M251,146 v4" />
        </g>
      </g>
    </Frame>
  );
}

/** The tenant: their passport, and the phone they fill it in on. */
function TenantCover() {
  return (
    <Frame tone="sage">
      <circle className="s" cx="180" cy="168" r="118" />
      <circle className="s" cx="60" cy="110" r="7" />
      <ellipse className="h" cx="182" cy="154" rx="104" ry="6" />
      <g className="cv-a">
        <circle className="l dash" cx="100" cy="46" r="19" />
        <circle className="l" cx="100" cy="46" r="13" />
        <path className="l" d="M93,48 L100,41 L107,48 M95,47 V53 H105 V47" />
      </g>
      <g className="cv-b">
        <g transform="rotate(-8 140 100)">
          <rect className="p" x="102" y="38" width="88" height="114" rx="6" />
          <rect className="d" x="96" y="34" width="90" height="116" rx="7" />
          <circle className="lw" cx="141" cy="80" r="17" />
          <path className="lw" d="M131,84 L141,74 L151,84 M134,82 V91 H148 V82" />
          <rect className="w" x="117" y="110" width="48" height="4" rx="2" />
          <rect className="w faded" x="125" y="120" width="32" height="3.5" rx="1.75" />
          <text className="t on-deep" x="128" y="140">TLE</text>
        </g>
      </g>
      <g className="cv-c">
        <g transform="rotate(7 238 104)">
          <rect className="p" x="206" y="28" width="66" height="126" rx="13" />
          <rect className="q" x="212" y="40" width="54" height="102" rx="7" />
          <rect className="k" x="230" y="33" width="18" height="3" rx="1.5" />
          <circle className="m" cx="239" cy="62" r="11" />
          <circle className="w" cx="239" cy="59" r="3.6" />
          <path className="w" d="M232.5,69 C234,64.5 244,64.5 245.5,69 Z" />
          <rect className="k" x="222" y="82" width="34" height="4" rx="2" />
          <rect className="w" x="222" y="92" width="34" height="8" rx="3" />
          <rect className="w" x="222" y="104" width="34" height="8" rx="3" />
          <rect className="c" x="220" y="122" width="38" height="12" rx="6" />
        </g>
      </g>
      <g className="cv-f">
        <Tick x={282} y={42} r={12} />
        <Spark x={318} y={118} r={5} />
      </g>
    </Frame>
  );
}

/** The agent: the desk, with the board on screen, the diary and a new lead. */
function AgentCover() {
  return (
    <Frame tone="brown">
      <circle className="s" cx="180" cy="168" r="118" />
      <circle className="s" cx="306" cy="40" r="9" />
      <rect className="m" x="36" y="148" width="288" height="7" rx="3.5" />
      <g className="cv-a">
        <rect className="p" x="58" y="60" width="72" height="86" rx="6" />
        <path className="m" d="M64,60 H124 A6,6 0 0 1 130,66 V76 H58 V66 A6,6 0 0 1 64,60 Z" />
        <path className="l" d="M74,54 V66 M94,54 V66 M114,54 V66" />
        {[0, 1, 2].map((r) =>
          [0, 1, 2, 3].map((c) => <circle key={`${r}${c}`} className={r === 1 && c === 2 ? "c" : "s"} cx={70 + c * 16} cy={90 + r * 16} r={r === 1 && c === 2 ? 5.5 : 4} />)
        )}
      </g>
      <g className="cv-b">
        <path className="l" d="M186,124 V140 M204,124 V140" />
        <rect className="m" x="172" y="138" width="46" height="9" rx="3" />
        <rect className="p" x="118" y="24" width="154" height="102" rx="9" />
        {[0, 1, 2].map((col) => (
          <g key={col}>
            <rect className="m" x={128 + col * 47} y="36" width="40" height="7" rx="3.5" />
            {[0, 1, 2].slice(0, col === 2 ? 2 : 3).map((row) => (
              <rect key={row} className={col === 1 && row === 0 ? "c" : "q"} x={128 + col * 47} y={50 + row * 22} width="40" height="16" rx="3.5" />
            ))}
          </g>
        ))}
      </g>
      <g className="cv-c">
        <rect className="c" x="40" y="118" width="24" height="29" rx="4" />
        <path className="l" d="M64,124 C73,124 73,138 64,138" />
        <rect className="p" x="222" y="84" width="102" height="58" rx="11" />
        <circle className="m" cx="243" cy="105" r="10" />
        <circle className="w" cx="243" cy="102" r="3.4" />
        <path className="w" d="M237,111 C238.5,106.5 247.5,106.5 249,111 Z" />
        <rect className="k" x="259" y="99" width="48" height="4.5" rx="2.25" />
        <rect className="s" x="259" y="109" width="32" height="4.5" rx="2.25" />
        <rect className="c" x="234" y="123" width="34" height="11" rx="5.5" />
        <rect className="q" x="274" y="123" width="34" height="11" rx="5.5" />
      </g>
      <g className="cv-f">
        <path className="l" d="M47,110 C43,104 51,100 47,94 M57,110 C53,104 61,100 57,94" />
        <Spark x={300} y={70} r={6} />
      </g>
    </Frame>
  );
}

export function JourneyCover({ id }: { id: "landlord" | "tenant" | "agent" }) {
  return id === "landlord" ? <LandlordCover /> : id === "tenant" ? <TenantCover /> : <AgentCover />;
}

/* ── Guides: the book covers ─────────────────────────────────────────────── */

export type Audience = "you" | "landlords" | "tenants";
const AUDIENCE_TONE: Record<Audience, CoverTone> = { you: "brown", landlords: "clay", tenants: "sage" };

/** A small motif per audience, drawn for the right of a guide's cover. */
export function BookMotif({ audience }: { audience: Audience }) {
  const body =
    audience === "you" ? (
      <>
        <ellipse className="h" cx="50" cy="70" rx="30" ry="3" />
        <g className="cv-b">
          <rect className="m" x="26" y="12" width="46" height="56" rx="5" />
          <rect className="p" x="31" y="19" width="36" height="44" rx="2.5" />
          <rect className="d" x="39" y="8" width="20" height="9" rx="3" />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <path className="l" d={`M36,${30 + i * 11} l2.5,2.5 l4,-5`} />
              <rect className={i === 0 ? "k" : "s"} x="46" y={29.5 + i * 11} width={i === 2 ? 12 : 16} height="3.5" rx="1.75" />
            </g>
          ))}
        </g>
        <g className="cv-f">
          <g transform="rotate(35 80 40)">
            <rect className="c" x="76" y="22" width="8" height="32" rx="2" />
            <path className="p" d="M76,54 L80,62 L84,54 Z" />
          </g>
        </g>
      </>
    ) : audience === "landlords" ? (
      <>
        <ellipse className="h" cx="46" cy="70" rx="32" ry="3" />
        <g className="cv-b">
          <rect className="p" x="22" y="36" width="46" height="32" />
          <path className="m" d="M16,40 L45,14 L74,40 Z" />
          <path className="c" d="M39,68 V55 A6,6 0 0 1 51,55 V68 Z" />
          <rect className="q" x="27" y="44" width="9" height="9" rx="2" />
          <rect className="q" x="55" y="44" width="9" height="9" rx="2" />
        </g>
        <g className="cv-f">
          <g transform="rotate(-30 80 52)">
            <circle className="c" cx="80" cy="52" r="6" />
            <circle className="w" cx="80" cy="52" r="2" />
            <path className="l" d="M86,52 H98 M93,52 v4 M97,52 v3" />
          </g>
        </g>
      </>
    ) : (
      <>
        <ellipse className="h" cx="48" cy="70" rx="32" ry="3" />
        <g className="cv-b">
          <path className="m" d="M20,36 L32,26 H72 L80,36 Z" />
          <rect className="p" x="20" y="36" width="60" height="32" rx="2" />
          <path className="l" d="M50,36 V68" />
          <rect className="c" x="44" y="36" width="12" height="10" />
          <rect className="s" x="28" y="56" width="14" height="3.5" rx="1.75" />
        </g>
        <g className="cv-f">
          <path className="l" d="M62,26 C62,16 74,14 76,10" />
          <rect className="c" x="72" y="2" width="14" height="10" rx="2.5" transform="rotate(18 79 7)" />
        </g>
      </>
    );
  return (
    <svg className={`nl-cv is-${AUDIENCE_TONE[audience]}`} viewBox="0 0 100 74" preserveAspectRatio="xMidYMax meet" aria-hidden focusable="false">
      {body}
    </svg>
  );
}

/** A stable 0, 1 or 2 from a guide's id, so the shelf varies its cover pattern without changing between visits. */
export function coverPattern(seed: string): 0 | 1 | 2 {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 3) as 0 | 1 | 2;
}

/** The TLE line mark: type only, over a thin rule. */
export function TleMark() {
  return (
    <span className="nl-lr-mark">
      <b>TLE</b>
      <i />
    </span>
  );
}
