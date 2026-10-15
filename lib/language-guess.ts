/**
 * Does this read as something other than English? A cheap guess on the
 * screen, so the Translate link (components/TranslateText) is offered on the
 * messages that need it and not on every "Thanks, see you then".
 *
 * Two tells: letters from another script (Arabic, Cyrillic, Chinese,
 * Devanagari...), or a message of a few words where almost none of them are
 * the small English words every English sentence is full of. Accented Latin
 * letters alone are not a tell - "café" and "Zoë" turn up in English. A wrong
 * guess costs a link nobody presses, or a press that says "already English".
 */

const COMMON = new Set(
  ("the a an and or but to of in on at for with from by is are was were be been am i you we they he she it my your our " +
    "me us them this that there here have has had do does did can could would will should not no yes please thanks thank " +
    "hi hello dear regards if as so what when where how which who about would like want looking flat house home property " +
    "viewing rent available still interested").split(" ")
);

export function looksForeign(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (t.length < 12) return false;
  /* Anything outside Latin, Greek-free punctuation and emoji: another script. */
  if (/[Ѐ-ӿ֐-׿؀-ۿऀ-෿฀-๿぀-ヿ㐀-鿿가-힯]/.test(t)) return true;
  const words = t.toLowerCase().match(/[a-zà-ÿąćęłńóśźżčďěňřšťůžőűăâîșțğışçãõñ]+/g) ?? [];
  if (words.length < 4) return false;
  const common = words.filter((w) => COMMON.has(w)).length;
  return common / words.length < 0.12;
}
