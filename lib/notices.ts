/**
 * A notice: one line in the bell.
 *
 * Client-safe shape. The server half that gathers them from the event
 * tables is lib/notifications.ts. A notice is never its own record - it is a
 * reading of something that already happened somewhere (a deal moved, money
 * landed, a pack was decided, a campaign step needs a person) - so the id is
 * "<source>:<row id>" and the same happening reads the same way every time.
 */

export type NoticeKind = "deal" | "money" | "plc" | "campaign" | "handover" | "chase";

export interface Notice {
  id: string;
  kind: NoticeKind;
  /** ISO. */
  at: string;
  title: string;
  body: string;
  href: string | null;
  tone: "ok" | "warn" | "none";
}

export const NOTICE_ICON: Record<NoticeKind, string> = {
  deal: "target",
  money: "coin",
  plc: "shield",
  campaign: "mail",
  handover: "key",
  chase: "clock",
};
