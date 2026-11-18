/**
 * Was the OS updated underneath this page? (Ticket a38f4a95, 17 Nov 2026.)
 *
 * A deploy went live at 12:12 and at 12:34 Rhiannon's /viewings filed
 * "e[a] is not a function. (In 'e[a](n,n.exports,r)', 'e[a]' is undefined)":
 * Safari's words for a tab still running the old build asking for a piece of
 * code the new build has renamed. Chrome and Firefox say the same thing as
 * "e[a] is not a function" with no detail, or name __webpack_modules__.
 * Nothing in the code is wrong, and the answer is to load the page again.
 *
 * The wording alone is not proof - a real fault in our own minified code can
 * read "t[n] is not a function" too - so the server is asked which build it
 * is running (/api/build). Only when that differs from the tab's own build
 * is it put down to the update. Anything else is reported as before.
 */

const OLD_CODE = [
  /\w\(\w,\w\.exports,\w\)/,
  /__webpack_modules__/,
  /^\w{1,3}\[\w{1,3}\] is not a function/,
  /^undefined is not an object \(evaluating '\w{1,3}\[\w{1,3}\]\.call'\)/,
  /^Cannot read properties of undefined \(reading 'call'\)/,
];

export function looksLikeOldCode(message: string): boolean {
  return OLD_CODE.some((r) => r.test(message));
}

const TAB_BUILD = process.env.NEXT_PUBLIC_BUILD ?? "dev";

/** True only when the server answers with a build that isn't this tab's. */
export async function newBuildIsLive(): Promise<boolean> {
  if (TAB_BUILD === "dev") return false;
  try {
    const res = await fetch("/api/build", { cache: "no-store" });
    if (!res.ok) return false;
    const j = (await res.json().catch(() => null)) as { build?: string } | null;
    return Boolean(j?.build && j.build !== "dev" && j.build !== TAB_BUILD);
  } catch {
    return false;
  }
}
