/**
 * PHOTOS ONTO A VISIT, from the browser (Dan Richards, ticket f30276b7,
 * 21 Nov 2026: "photos arent uploading to the property visit reports").
 *
 * THE CAUSE (found 23 Nov 2026, proven in Chrome): the room's "Add photos"
 * button on Record the Visit read the picker's file list, cleared the picker,
 * and only then looked at the list. The list is live, so clearing the picker
 * emptied it: two photos picked, none left, nothing sent, no error. Not one
 * visit photo had ever reached storage, for anyone. The list is now copied
 * out before the picker is cleared (RecordVisit, InspectionsBoard).
 *
 * Two weaknesses were put right at the same time, since a phone photo is 5 to
 * 25MB now and the photo scope refuses anything over 15MB:
 *
 *   - Pictures went up full size, one after the other, and the upload stopped
 *     at the first that failed, dropping the ones that had already landed.
 *   - A reply that was not ours (a page from the host instead of an answer)
 *     came back as a code-word error, or none.
 *
 * So each photo is made smaller here first - the long edge to 2000px as a
 * JPEG, plenty for a printed report and a deposit dispute, and usually under
 * 1MB - the ones that make it are always kept, and the ones that do not are
 * named. A photo the browser cannot open (a HEIC on Windows) goes as it is,
 * and the server judges it as before.
 *
 * No "server-only": this runs in the browser.
 */

export type VisitPhoto = { key: string; name: string };

const LONG_EDGE = 2000;
const QUALITY = 0.85;

/** The photo at most 2000px on its long edge as a JPEG, or the file as it was when the browser cannot open it or it is small already. */
export async function shrinkPhoto(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, LONG_EDGE / Math.max(bmp.width, bmp.height));
    /* Already small and already a JPEG: nothing to gain. */
    if (scale === 1 && file.type === "image/jpeg" && file.size < 2 * 1024 * 1024) return file;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = c.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", QUALITY));
    if (!blob || blob.size === 0 || blob.size >= file.size) return file;
    const name = /\.[a-z0-9]{1,6}$/i.test(file.name) ? file.name.replace(/\.[a-z0-9]{1,6}$/i, ".jpg") : `${file.name || "photo"}.jpg`;
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bmp.close();
  }
}

/**
 * Every photo in `files` into storage under the visit, smaller first.
 * `added` is what landed and must be saved on the record; `failed` is one
 * sentence per photo that did not, naming it. Never throws.
 */
export async function uploadVisitPhotos(
  inspectionId: string,
  files: FileList | File[],
  onProgress?: (done: number, of: number) => void
): Promise<{ added: VisitPhoto[]; failed: string[] }> {
  const list = Array.from(files);
  const added: VisitPhoto[] = [];
  const failed: string[] = [];
  for (const [n, original] of list.entries()) {
    onProgress?.(n, list.length);
    const name = original.name || "That photo";
    try {
      const file = await shrinkPhoto(original);
      const body = new FormData();
      body.set("scope", "photo");
      body.set("ref", `inspection-${inspectionId}`);
      body.set("file", file);
      const r = await fetch("/api/r2/upload", { method: "POST", body });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; key?: string; error?: string } | null;
      if (j?.ok && j.key) added.push({ key: j.key, name: original.name || file.name });
      else failed.push(j?.error ?? `${name} did not upload (the server said ${r.status}). Try it again.`);
    } catch {
      failed.push(`${name} did not upload - the connection dropped. Try it again.`);
    }
  }
  onProgress?.(list.length, list.length);
  return { added, failed };
}
