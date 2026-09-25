import { noDashes } from "@/lib/no-dashes";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { whoIs } from "@/lib/admin";
import { getAppraisal } from "@/lib/appraisal-store";
import { SERVICE_LEVELS } from "@/lib/market-appraisal";
import { readAnswers } from "@/lib/property-answers-store";
import { presentationsFor } from "@/lib/present-store";
import { epcForAddress } from "@/lib/epc";
import { listPhotos, photoUrl } from "@/lib/property-photos";
import { takeOnDetails } from "@/lib/takeon";

/**
 * THE ADVERT, WRITTEN FROM THE FILE (James, 17 Sep 2026).
 *
 * The panel used to call the listing's own writer with links to our photo
 * route - which needs a session, so the model was handed a sign-in page and
 * answered "the file format is invalid or unsupported". The photographs are
 * signed here instead, on the server, for an hour.
 *
 * And it is written from everything the file holds rather than an address and
 * a rent: what the landlord answered about the property, the figure, the EPC
 * (theirs or the register's), and whether anybody is living there and from
 * when - "trying to give context to essentially anything that we can get hold
 * of".
 *
 *   POST { steer }            → the advert
 *   POST { action: "gaps" }   → what is missing, as suggestions to confirm
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

const MODEL = process.env.ADVERT_WRITER_MODEL ?? "claude-opus-5";

const ADVERT: Anthropic.Tool = {
  name: "write_advert",
  description: "Hand back the finished portal advert.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["heading", "body"],
    properties: {
      heading: { type: "string", description: "One line, under 80 characters, the line the portals show first." },
      body: { type: "string", description: "The advert, 150 to 260 words, plain paragraphs separated by blank lines. No headings, no bullets, no markdown." },
    },
  },
};

const GAPS: Anthropic.Tool = {
  name: "fill_gaps",
  description: "Suggest values for the details nobody has recorded yet. Leave anything you cannot see out.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["fields"],
    properties: {
      fields: {
        type: "array",
        description: "One entry per detail you can suggest. Only from the photographs or the facts given.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "value", "why"],
          properties: {
            id: { type: "string", description: "The field's id, exactly as it was given." },
            value: { type: "string", description: "The suggested value, short." },
            why: { type: "string", description: "Where you got it: which photograph, or which fact." },
          },
        },
      },
    },
  },
};

const say = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { steer?: string; current?: string | null; action?: "advert" | "gaps"; known?: Record<string, string>; missing?: Array<{ id: string; label: string }> };

  const answers: Record<string, unknown> = await readAnswers(id).catch(() => ({}));
  const refs = [...new Set([ma.leadId, ma.id].filter((r): r is string => Boolean(r)))];
  const decks = (await Promise.all(refs.map((r) => presentationsFor(r).catch(() => [])))).flat();
  const property = decks.find((d) => d.deck.property?.beds != null)?.deck.property ?? decks[0]?.deck.property ?? null;
  const [registerEpc, saved] = await Promise.all([epcForAddress(ma.address, ma.postcode ?? "").catch(() => null), takeOnDetails(id)]);
  const level = SERVICE_LEVELS.find((s) => s.id === ma.serviceLevel)?.label ?? null;

  const occupancy = say(answers.occupancy);
  const facts = [
    `Address: ${ma.address}${ma.postcode ? `, ${ma.postcode}` : ""}`,
    ma.valuation != null ? `Asking rent: £${ma.valuation.toLocaleString("en-GB")} per calendar month` : null,
    level ? `Service: ${level}` : null,
    property?.propertyType ? `Property type: ${property.propertyType}` : null,
    property?.beds != null ? `Bedrooms: ${property.beds}` : null,
    property?.baths != null ? `Bathrooms: ${property.baths}` : null,
    occupancy === "tenant" ? "Currently let to a tenant" : occupancy === "owner" ? "The owner lives there at the moment" : occupancy === "empty" ? "Empty now" : null,
    say(answers["available-from"]) ? `Available from: ${say(answers["available-from"])}` : null,
    say(answers.heating) ? `Heating: ${say(answers.heating).replace(/-/g, " ")}` : null,
    say(answers.parking) ? `Parking: ${say(answers.parking)}` : null,
    say(answers.garden) ? `Garden looked after by: ${say(answers.garden)}` : null,
    say(answers.furnishing) ? `Furnishing: ${say(answers.furnishing)}` : null,
    say(answers.pets) ? `Pets: ${say(answers.pets) === "open" ? "considered" : say(answers.pets)}` : null,
    say(answers["council-tax-band"]) ? `Council tax band: ${say(answers["council-tax-band"])}` : null,
    say(answers.shared) ? `Shared with neighbours: ${say(answers.shared)}` : null,
    property?.epc ? `EPC rating: ${property.epc}` : registerEpc?.band ? `EPC rating: ${registerEpc.band} (national register, ${registerEpc.registeredOn.slice(0, 4)})` : null,
    ...Object.entries(saved?.fields ?? {}).map(([k, v]) => (v ? `${k}: ${v}` : null)),
  ].filter(Boolean) as string[];

  /* The photographs, signed for an hour so the model can actually fetch
     them. Six is plenty for an advert and keeps the call quick. */
  const photos = await listPhotos(id);
  const urls = (await Promise.all(photos.slice(0, 6).map((p) => photoUrl(id, p.id)))).filter((u): u is string => Boolean(u));

  const images: Anthropic.ContentBlockParam[] = urls.map((url) => ({ type: "image", source: { type: "url", url } }));

  try {
    const client = new Anthropic();
    if (body.action === "gaps") {
      const missing = (body.missing ?? []).slice(0, 20);
      if (!missing.length) return NextResponse.json({ ok: true, fields: [] });
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        tools: [GAPS],
        messages: [
          {
            role: "user",
            content: [
              ...images,
              {
                type: "text",
                text:
                  `A letting agent has just photographed this property and is filling in what we hold about it.\n\n` +
                  `What we already know:\n${facts.map((f) => `- ${f}`).join("\n")}\n\n` +
                  `Still missing:\n${missing.map((m) => `- ${m.id}: ${m.label}`).join("\n")}\n\n` +
                  `Suggest only what the photographs or the facts actually support - a room you can count, a heating type you can see, parking on a drive in shot. Leave out anything you would be guessing at. Use the fill_gaps tool.`,
              },
            ],
          },
        ],
      });
      const call = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use" && c.name === "fill_gaps");
      const out = (call?.input as { fields?: Array<{ id: string; value: string; why: string }> } | undefined)?.fields ?? [];
      return NextResponse.json({
        ok: true,
        fields: out.filter((f) => missing.some((m) => m.id === f.id)).map((f) => ({ ...f, value: noDashes(f.value ?? "") })),
      });
    }

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      tools: [ADVERT],
      messages: [
        {
          role: "user",
          content: [
            ...images,
            {
              type: "text",
              text:
                `Write the portal advert for this rental property, for Rightmove and Zoopla, on behalf of The Letting Experts.\n\n` +
                `What we know:\n${facts.map((f) => `- ${f}`).join("\n")}\n\n` +
                (images.length
                  ? `${images.length} photograph${images.length === 1 ? "" : "s"} of the property are attached. Describe only what you can actually see in them.\n\n`
                  : "No photographs are available.\n\n") +
                (body.current ? `There is an existing draft. Improve on it rather than repeating it:\n"""\n${body.current}\n"""\n\n` : "") +
                (body.steer?.trim()
                  ? `The agent who visited asked for this, and they saw the property:\n"""\n${body.steer.trim().slice(0, 1200)}\n"""\nFollow it where it does not conflict with the facts or the photographs. It does not permit inventing anything.\n\n`
                  : "") +
                `Rules: British English. Warm, plain, confident; no clichés like "stunning" or "must-see"; never use an em dash. Say what is there, room by room where the photographs show it, then the practical facts a tenant asks about - what is included, parking, the garden, council tax band, EPC, and when it is available (say so plainly if it is let until a date). Do not invent rooms, dimensions, transport links or schools. Close with how to arrange a viewing with The Letting Experts. Use the write_advert tool.`,
            },
          ],
        },
      ],
    });
    if (res.stop_reason === "refusal") return NextResponse.json({ ok: false, error: "The writer declined this one. Write it by hand." }, { status: 502 });
    const call = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use" && c.name === "write_advert");
    if (!call) return NextResponse.json({ ok: false, error: "The writer answered in prose rather than an advert. Try again." }, { status: 502 });
    const out = call.input as { heading: string; body: string };
    return NextResponse.json({ ok: true, heading: noDashes(out.heading).trim(), body: noDashes(out.body).trim(), photos: images.length, facts: facts.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "The writer could not be reached.";
    console.error("[advert]", msg);
    return NextResponse.json({ ok: false, error: msg.slice(0, 300) }, { status: 502 });
  }
}
