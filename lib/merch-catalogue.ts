/**
 * What the merch shop sells (James, 24 Nov 2026). A list in code for now: the
 * photos are stock stand-ins (Pexels, cut out) until the real kit is shot, and
 * there are no prices until James sets them. When products need changing
 * without a push, this moves to a table with its own Admin screen.
 */

export interface MerchColour {
  name: string;
  hex: string;
}

export interface MerchProduct {
  key: string;
  name: string;
  /** The giant word behind it in the hero. */
  word: string;
  line: string;
  blurb: string;
  image: string;
  colours: MerchColour[];
  sizes: string[];
  /** Price in pounds once James sets it; null shows "Price to come". */
  price: number | null;
  /** How big it sits in the hero, against the jacket. */
  scale: number;
  /** The giant name behind it and the lamp light, picked so the kit stands off the letters. */
  tint: { letters: string; glow: string; rim?: string; edge?: string };
  /** Who makes it (lib/merch-makers): Clothes2Order for clothing, Prodigi for mugs and small things. */
  maker: MakerKey;
  /**
   * The maker's own code for each colour and size, keyed "Colour|Size". Empty
   * until it is read from the maker's product list once the account is open;
   * a line without one cannot be sent and the Orders page says so.
   */
  skus: Record<string, string>;
  /** What goes on it and where. The file is a public path on the OS, which the maker fetches. */
  artwork: MerchArtwork[];
}

export type MakerKey = "c2o" | "prodigi";

export const MAKER_NAMES: Record<MakerKey, string> = { c2o: "Clothes2Order", prodigi: "Prodigi" };

export interface MerchArtwork {
  /** Stays the same for the same design, so the maker sets it up (and charges for it) once. */
  id: string;
  file: string;
  /** Clothes2Order position code (5 left chest, 8 centre back) or Prodigi print area ("default"). */
  place: string;
  /** Width in cm, for Clothes2Order. */
  widthCm?: number;
  type: "embroidery" | "print";
}

export interface MerchLine {
  product: string;
  name: string;
  colour: string;
  size: string;
  qty: number;
}

/** Where an order goes. Agents mostly work from home, so it is the person's own address. */
export interface MerchDelivery {
  name: string;
  line1: string;
  line2: string;
  town: string;
  postcode: string;
  phone: string;
}

export const skuFor = (p: MerchProduct, colour: string, size: string): string | null => p.skus[`${colour}|${size}`] ?? null;

/* The logo the makers stitch or print. The real embroidery file (James's call)
   replaces this before the first live order; Clothes2Order sends no proofs. */
const LOGO_CHEST: MerchArtwork = { id: "TLE-CHEST-V1", file: "/brand/tle-logo.png", place: "5", widthCm: 9, type: "embroidery" };
const LOGO_MUG: MerchArtwork = { id: "TLE-MUG-V1", file: "/brand/tle-logo.png", place: "default", type: "print" };

const CLOTHES = ["XS", "S", "M", "L", "XL", "XXL"];

export const MERCH: MerchProduct[] = [
  {
    key: "puffer",
    name: "The Puffer",
    word: "Warmth",
    line: "Quilted, light, warm.",
    blurb: "For viewings in January and every doorstep in between. Light enough to live in, warm enough to wait for a tenant who is running late.",
    image: "/brand/merch/puffer-v1.webp",
    colours: [{ name: "Black", hex: "#1d1b1a" }],
    sizes: CLOTHES,
    price: null,
    scale: 1,
    tint: { letters: "#EDE3D4", glow: "rgba(196,160,146,.42)", rim: "rgba(214,182,160,.5)", edge: "rgba(245,239,230,.35)" },
    maker: "c2o",
    skus: {},
    artwork: [LOGO_CHEST],
  },
  {
    key: "hoodie",
    name: "The Hoodie",
    word: "Comfort",
    line: "Heavy cotton, soft inside.",
    blurb: "The one for office days and Saturday sign-ups. Heavyweight, brushed inside, and it keeps its shape wash after wash.",
    image: "/brand/merch/hoodie-v1.webp",
    colours: [{ name: "White", hex: "#f4f1ec" }],
    sizes: CLOTHES,
    price: null,
    scale: 1,
    tint: { letters: "#A85A51", glow: "rgba(168,90,81,.42)" },
    maker: "c2o",
    skus: {},
    artwork: [LOGO_CHEST],
  },
  {
    key: "mug",
    name: "The Mug",
    word: "Brew",
    line: "Glazed, 11oz, desk-ready.",
    blurb: "Every good let starts with a cup of tea. Glazed white, dishwasher safe, and nobody will mistake whose it is.",
    image: "/brand/merch/mug-v1.webp",
    colours: [{ name: "White", hex: "#f4f1ec" }],
    sizes: ["One size"],
    price: null,
    scale: 0.62,
    tint: { letters: "#7E8C6E", glow: "rgba(126,148,104,.34)" },
    maker: "prodigi",
    skus: {},
    artwork: [LOGO_MUG],
  },
];
