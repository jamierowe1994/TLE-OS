import "server-only";

/**
 * A PHOTO SMALL ENOUGH TO BE READ (10 Nov 2026).
 *
 * The certificate reader's route took a file up to 12MB and sent it to the
 * model whole. The model's own ceiling for a picture is lower, and it is
 * measured on the picture as it is sent - base64, a third bigger than the
 * file. Tried against the live API on 10 Nov 2026 with photos of 2.4MB to
 * 17.7MB: 5.3MB was read, 7.5MB and everything above it came back
 * "image exceeds 10 MB maximum". So a phone photo of about 7.5MB or more -
 * an ordinary full-size photo from a recent phone - could never be read, and
 * the screen said only that the reader "couldn't read this one".
 *
 * So a large photo is made smaller before it is read: turned the right way
 * up (a phone stores its photos sideways and says so in the file), brought
 * down to 2,600 pixels on its long side - past which the model sees no more
 * anyway - and saved as a JPEG. Only the copy that is read. The file that is
 * kept, filed and sent on is the one that was uploaded, untouched.
 *
 * It uses sharp, which Next installs for its own image work. It is loaded by
 * name at run time rather than imported, so a machine without it still builds
 * and still reads every photo that is small enough as it is.
 */

/** The model's ceiling is 10MB of base64, which is this much file. */
const READER_MAX_BYTES = Math.floor((10 * 1024 * 1024 * 3) / 4) - 64 * 1024;
/** Above this a photo is made smaller first: quicker to send, and nothing the model can see is lost. */
const SHRINK_OVER_BYTES = 4 * 1024 * 1024;
const LONG_SIDE = 2600;

type Sharp = (input: Buffer, opts?: { failOn?: string; limitInputPixels?: number }) => {
  rotate(): ReturnType<Sharp>;
  resize(o: { width: number; height: number; fit: "inside"; withoutEnlargement: boolean }): ReturnType<Sharp>;
  jpeg(o: { quality: number }): ReturnType<Sharp>;
  toBuffer(): Promise<Buffer>;
};

async function loadSharp(): Promise<Sharp | null> {
  try {
    const name = "sharp";
    const mod = (await import(/* webpackIgnore: true */ name)) as { default?: Sharp } | Sharp;
    return (typeof mod === "function" ? mod : mod.default) ?? null;
  } catch {
    return null;
  }
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;

export type ReaderImage =
  | { ok: true; bytes: Buffer; media: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; shrunk: boolean }
  | { ok: false; error: string };

/**
 * The picture to hand the reader: itself when it is small, a smaller copy
 * when it is not, or the sentence that says why it cannot be read.
 */
export async function imageForReader(bytes: Buffer, media: "image/jpeg" | "image/png" | "image/webp" | "image/gif", name: string): Promise<ReaderImage> {
  if (bytes.length <= SHRINK_OVER_BYTES) return { ok: true, bytes, media, shrunk: false };
  const sharp = await loadSharp();
  if (sharp) {
    try {
      const small = await sharp(bytes, { failOn: "none" })
        .rotate()
        .resize({ width: LONG_SIDE, height: LONG_SIDE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      if (small.length <= READER_MAX_BYTES) return { ok: true, bytes: small, media: "image/jpeg", shrunk: true };
    } catch (e) {
      console.error("[reader-image] could not make a smaller copy of", name, (e as Error)?.message);
    }
  }
  if (bytes.length <= READER_MAX_BYTES) return { ok: true, bytes, media, shrunk: false };
  return {
    ok: false,
    error: `${name || "That photo"} is ${mb(bytes.length)}, and the reader can only open a photo up to ${mb(READER_MAX_BYTES)}. It can still be filed as it is: type the dates in. To have them read, save a smaller copy or a PDF and choose that.`,
  };
}
