import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * WRITE THE ADVERT FOR ME (James, 11 Sep 2026).
 *
 * The portal write-up, drafted from what the record holds: the address,
 * the rent, the facts the agent has set, and the photographs themselves -
 * Claude looks at up to four of them, so the copy can say "bay window" and
 * "fitted kitchen" because it has seen them, not guessed. It comes back as
 * a DRAFT into the editor; nothing is written to REX until the agent saves.
 *
 * Nothing invented: the prompt is told to write only from what it is given
 * and what it can see, and to leave out anything it cannot.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.ADVERT_WRITER_MODEL ?? "claude-opus-5";

const TOOL: Anthropic.Tool = {
  name: "write_advert",
  description: "Hand back the finished portal advert.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["heading", "body"],
    properties: {
      heading: { type: "string", description: "One line, under 80 characters, the line the portals show first." },
      body: { type: "string", description: "The advert, 150 to 260 words, plain paragraphs separated by blank lines. No headings, no bullet points, no markdown." },
    },
  },
};

export async function POST(req: NextRequest) {
  const actor = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    name?: string;
    locality?: string;
    rent?: number | null;
    rentPeriod?: string | null;
    availableFrom?: string | null;
    type?: string;
    beds?: number;
    baths?: number;
    receptions?: number;
    furnished?: string;
    epcRating?: string | null;
    photos?: string[];
    current?: string | null;
  };
  if (!b.name) return NextResponse.json({ ok: false, error: "Which property?" }, { status: 400 });

  const facts = [
    `Address: ${b.name}${b.locality ? `, ${b.locality}` : ""}`,
    b.rent != null ? `Rent: £${b.rent.toLocaleString("en-GB")} ${b.rentPeriod === "week" ? "per week" : "per calendar month"}` : null,
    b.availableFrom ? `Available from: ${b.availableFrom}` : "Available now",
    b.type ? `Property type: ${b.type}` : null,
    b.beds ? `Bedrooms: ${b.beds}` : null,
    b.baths ? `Bathrooms: ${b.baths}` : null,
    b.receptions ? `Reception rooms: ${b.receptions}` : null,
    b.furnished ? `Furnishing: ${b.furnished}` : null,
    b.epcRating ? `EPC rating: ${b.epcRating}` : null,
  ].filter(Boolean);

  /* Up to four photographs, by URL, so the copy describes what is actually
     there. REX's CDN serves them publicly, which is what lets the model
     fetch them. */
  const photos = (b.photos ?? []).filter((u) => /^https?:\/\//.test(u)).slice(0, 4);
  const content: Anthropic.ContentBlockParam[] = [
    ...photos.map((url): Anthropic.ImageBlockParam => ({ type: "image", source: { type: "url", url } })),
    {
      type: "text",
      text:
        `Write the portal advert for this rental property, for Rightmove and Zoopla, on behalf of The Letting Experts.\n\n` +
        `What we know:\n${facts.map((f) => `- ${f}`).join("\n")}\n\n` +
        (photos.length ? `${photos.length} photograph${photos.length === 1 ? "" : "s"} of the property are attached. Describe only what you can actually see in them.\n\n` : "No photographs are available.\n\n") +
        (b.current ? `There is an existing draft, which may be out of date. Improve on it rather than repeating it:\n"""\n${b.current}\n"""\n\n` : "") +
        `Rules: British English. Warm, plain, confident; no clichés like "stunning" or "must-see". Do not invent rooms, features, dimensions, transport links or schools that are not in the facts or visible in the photographs; if you do not know the number of bedrooms, do not state one. Say what is there, then who it suits, then how to arrange a viewing with The Letting Experts. Use the write_advert tool to hand the advert back.`,
    },
  ];

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      tools: [TOOL],
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal") {
      return NextResponse.json({ ok: false, error: "The writer declined this one. Write it by hand." }, { status: 502 });
    }
    const call = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use" && c.name === "write_advert");
    if (!call) {
      const text = res.content.find((c): c is Anthropic.TextBlock => c.type === "text")?.text ?? "";
      return NextResponse.json({ ok: false, error: text ? "The writer answered in prose rather than an advert. Try again." : "Nothing came back." }, { status: 502 });
    }
    const out = call.input as { heading: string; body: string };
    return NextResponse.json({ ok: true, heading: out.heading.trim(), body: out.body.trim(), model: res.model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "The writer could not be reached.";
    const plain = /credit balance/i.test(msg)
      ? "The writer's Anthropic account has run out of credit - top it up at console.anthropic.com."
      : msg;
    return NextResponse.json({ ok: false, error: plain }, { status: 502 });
  }
}
