/**
 * PLC checks being sent in the background (James, 16 Oct 2026: "allow them
 * to come off the screen, and then it will tell them when it's finished").
 *
 * The wizard's Send answers at once and the reading carries on on the server
 * (app/api/plc/[id] send-status). The packs being read are remembered here,
 * in this browser, so the corner card (components/PlcSendCard) can follow the
 * agent round the OS and say how far each has got, and when it is done.
 */

export type WatchedSend = { id: string; address: string; href: string; startedAt: number };

const KEY = "os-plc-sends";
export const PLC_SENDS_EVENT = "os-plc-sends";

export function watchedSends(): WatchedSend[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string") : [];
  } catch {
    return [];
  }
}

function save(list: WatchedSend[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage refused: the page still shows its own progress */
  }
  window.dispatchEvent(new Event(PLC_SENDS_EVENT));
}

export function watchSend(s: Omit<WatchedSend, "startedAt">): void {
  save([...watchedSends().filter((x) => x.id !== s.id), { ...s, startedAt: Date.now() }]);
}

export function unwatchSend(id: string): void {
  save(watchedSends().filter((x) => x.id !== id));
}
