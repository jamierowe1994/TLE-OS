/**
 * What the merch shop sells (James, 24 Nov 2026). A list in code for now, with
 * no prices until James sets them. The photos are Gelato's own previews of
 * each item with our logo on it, from test drafts on 25 Nov 2026, cut out. When products need changing without a push, this
 * moves to a table with its own Admin screen.
 *
 * Everything is made by Gelato (James, 25 Nov 2026: "switch it"). Both garments
 * are made in Gelato's UK hubs as well as abroad, and the logo is embroidered
 * on the left chest: Gelato embroiders chest, sleeves and wrists only.
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
  /** Who makes it (lib/merch-makers). */
  maker: MakerKey;
  /**
   * The maker's own code for each colour and size, keyed "Colour|Size". A line
   * without one cannot be sent and the Orders page says so.
   */
  skus: Record<string, string>;
  /** What goes on it and where. The file is a public path on the OS, which the maker fetches. */
  artwork: MerchArtwork[];
}

export type MakerKey = "gelato";

export const MAKER_NAMES: Record<MakerKey, string> = { gelato: "Gelato" };

export interface MerchArtwork {
  /** Our name for the design, so the same file is recognised as the same design. */
  id: string;
  file: string;
  /** Gelato's print area: "chest-left-embroidery" on clothing, "default" on a mug. */
  place: string;
  type: "embroidery" | "print";
  /** Embroidery thread colours from Gelato's 15 (up to 6); left out, Gelato picks the nearest. */
  threads?: string[];
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

/* Gelato's product codes run colour and size through one pattern, e.g.
   ..._gsi_l_gco_black_... ("Charcoal Grey" -> "charcoal-grey"). Sizes are not
   written the same on every garment (the softshell's 2XL is "xxl", the
   hoodie's "2xl"), so a product can name its own. Every code here was checked
   against Gelato's product list on 25 Nov 2026. */
const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
function codes(pattern: string, colours: MerchColour[], sizes: string[], sizeCode: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of colours) for (const s of sizes) out[`${c.name}|${s}`] = pattern.replace("{size}", sizeCode[s] ?? slug(s)).replace("{colour}", slug(c.name));
  return out;
}

/* The logo Gelato stitches or prints. Gelato digitises an embroidery file
   once, on the first order, and sends no proof, so the first live order is one
   item to check the stitching. Threads are set, not left to Gelato: on a test
   draft it picked black for the lettering, which vanished on the black
   softshell, so dark kit gets white lettering. Red #cb333b is Gelato's nearest
   thread to the pin. */
const LOGO_CHEST: MerchArtwork = { id: "TLE-CHEST-V1", file: "/brand/tle-logo.png", place: "chest-left-embroidery", type: "embroidery", threads: ["#000000", "#cb333b"] };
const LOGO_CHEST_DARK: MerchArtwork = { id: "TLE-CHEST-DARK-V1", file: "/brand/merch/print/tle-chest-dark-v1.png", place: "chest-left-embroidery", type: "embroidery", threads: ["#ffffff", "#cb333b"] };
const LOGO_MUG: MerchArtwork = { id: "TLE-MUG-V1", file: "/brand/merch/print/mug-wrap-v1.png", place: "default", type: "print" };

const CLOTHES = ["S", "M", "L", "XL", "2XL", "3XL"];

const SOFTSHELL_COLOURS: MerchColour[] = [{ name: "Black", hex: "#25282a" }];
const HOODIE_COLOURS: MerchColour[] = [{ name: "White", hex: "#f4f1ec" }];
const MUG_COLOURS: MerchColour[] = [{ name: "White", hex: "#f4f1ec" }];
/* White, not natural: natural read yellow on James's screen (25 Nov 2026). */
const TEE_COLOURS: MerchColour[] = [{ name: "White", hex: "#f7f7f5" }];

/* The Ask Steve tee (James, 25 Nov 2026): a small TLE on the left chest as
   worn (the right of the front sheet, as far out as Gelato's print area goes);
   on the back ASK STEVE wrapped round Steve in a fun font (Shantell Sans,
   terracotta with a brown outline and block shadow), Steve as he looks in the
   OS: the shaded brown orb with two linen pill eyes. Each file
   is a 3:4 sheet, the shape of Gelato's regular print area, which it fills
   (anything off the sheet's shape is cropped, not shrunk). */
const TEE_FRONT: MerchArtwork = { id: "TLE-TEE-FRONT-V3", file: "/brand/merch/print/tee-front-v3.png", place: "default", type: "print" };
const TEE_BACK: MerchArtwork = { id: "TLE-TEE-BACK-V3", file: "/brand/merch/print/tee-back-v3.png", place: "back", type: "print" };

export const MERCH: MerchProduct[] = [
  {
    key: "softshell",
    name: "The Softshell",
    word: "Weather",
    line: "Windproof, fleece-lined, sharp.",
    blurb: "For viewings in the rain and every doorstep in between. Windproof and water-resistant on the outside, soft fleece on the inside, and smart enough to meet a landlord in.",
    image: "/brand/merch/softshell-v2.webp",
    colours: SOFTSHELL_COLOURS,
    sizes: CLOTHES,
    price: null,
    scale: 1,
    tint: { letters: "#EDE3D4", glow: "rgba(196,160,146,.42)", rim: "rgba(214,182,160,.5)", edge: "rgba(245,239,230,.35)" },
    maker: "gelato",
    /* SOL'S Falcon 03827, men's cut. Made in GB, SE and IT. */
    skus: codes("apparel_product_gca_jacket-and-vest_gcu_mens_gqa_organic_gsi_{size}_gco_{colour}_gpr_chstl-emb_sols_03827", SOFTSHELL_COLOURS, CLOTHES, { "2XL": "xxl" }),
    artwork: [LOGO_CHEST_DARK],
  },
  {
    key: "hoodie",
    name: "The Hoodie",
    word: "Comfort",
    line: "Cotton blend, brushed inside.",
    blurb: "The one for office days and Saturday sign-ups. Soft brushed fleece inside, a roomy hood and a front pocket, and it keeps its shape wash after wash.",
    image: "/brand/merch/hoodie-v2.webp",
    colours: HOODIE_COLOURS,
    sizes: CLOTHES,
    price: null,
    scale: 1,
    tint: { letters: "#A85A51", glow: "rgba(168,90,81,.42)" },
    maker: "gelato",
    /* Gildan 18500, the left-chest embroidered version. Made in GB and abroad. */
    skus: codes("apparel_product_gca_hoodie_gsc_pullover_gcu_unisex_gqa_classic_gsi_{size}_gco_{colour}_gpr_chstl-emb_gildan_18500", HOODIE_COLOURS, CLOTHES),
    artwork: [LOGO_CHEST],
  },
  {
    key: "tee",
    name: "The Tee",
    word: "Steve",
    line: "TLE on the chest. Ask Steve on the back.",
    blurb: "Soft cotton in crisp white, a small TLE on the chest and Ask Steve wrapped round Steve on the back. For Fridays, team days and anyone who has ever asked him to find a missing certificate.",
    image: "/brand/merch/tee-v3.webp",
    colours: TEE_COLOURS,
    sizes: CLOTHES,
    price: null,
    scale: 1.25,
    tint: { letters: "#C4A092", glow: "rgba(196,160,146,.4)" },
    maker: "gelato",
    /* Bella+Canvas 3001, printed front and back. Made in GB. */
    skus: codes("apparel_product_gca_t-shirt_gsc_crewneck_gcu_unisex_gqa_prm_gsi_{size}_gco_{colour}_gpr_4-4_bella-and-canvas_3001", TEE_COLOURS, CLOTHES),
    artwork: [TEE_FRONT, TEE_BACK],
  },
  {
    key: "mug",
    name: "The Mug",
    word: "Brew",
    line: "Glazed, 11oz, desk-ready.",
    blurb: "Every good let starts with a cup of tea. Glazed white, dishwasher safe, and nobody will mistake whose it is.",
    image: "/brand/merch/mug-v2.webp",
    colours: MUG_COLOURS,
    sizes: ["One size"],
    price: null,
    scale: 0.62,
    tint: { letters: "#7E8C6E", glow: "rgba(126,148,104,.34)" },
    maker: "gelato",
    skus: { "White|One size": "mug_product_msz_11-oz_mmat_ceramic-white_cl_4-0" },
    artwork: [LOGO_MUG],
  },
];
