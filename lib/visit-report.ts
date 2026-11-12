/**
 * A VISIT REPORT MADE SOMEWHERE ELSE, READ INTO OUR BOXES (James, 12 Nov 2026).
 *
 * "A lot of the guys, when they're doing an inventory, use something like
 * Inventory Base. We need to be able to upload the inventory, scan the
 * inventory, and then fill out the boxes for us, and then allow us to fill in
 * any boxes that weren't automatically found, as well as offering options to
 * edit." And Dan Richards the day before (ticket on /inspections): "I've
 * uploaded the property visit report that was completed using Inventory Base
 * but OS still asks me to continue producing a report in OS."
 *
 * This is the shape of what the reader found, shared by the server that reads
 * (lib/visit-report-read) and the screen that shows it beside the report
 * (components/inspections/ReportFromUpload). Nothing here is saved onto the
 * visit until a person has looked at it and pressed save: a box the reader
 * could not fill is left empty and marked, never guessed.
 */

import type { CheckAnswer } from "@/lib/inspection-checks";

export type ReadCondition = "good" | "fair" | "poor";
export type ReadAction = "none" | "monitor" | "works_order" | "tenant" | "landlord";

export interface ReadItem {
  item: string;
  condition: ReadCondition;
  note: string;
  action: ReadAction;
}

export interface ReadRoom {
  room: string;
  condition: ReadCondition | null;
  note: string;
  action: ReadAction;
  /** Things in the room the report singles out as needing something. */
  items: ReadItem[];
}

export interface ReportRead {
  /** What the report calls itself: "Property Visit", "Inventory & Check In". */
  title: string;
  /** YYYY-MM-DD, or "" when no date is printed. */
  visitDate: string;
  inspector: string;
  address: string;
  condition: ReadCondition | null;
  summary: string;
  checks: Record<string, { answer: CheckAnswer; note: string }>;
  readings: Record<string, string>;
  tenantSays: string;
  rooms: ReadRoom[];
  /** One sentence from the reader, only when something needs saying. */
  notes: string;
}

export interface ReadState {
  status: "reading" | "done" | "failed";
  /** The file read, as it is held on the visit. */
  key: string;
  name: string;
  by: string;
  startedAt: string;
  finishedAt?: string;
  /** Pages in the file, and how many of them were read. */
  pages?: number;
  pagesRead?: number;
  error?: string;
  read?: ReportRead;
  /** When what was read was saved onto the visit, and by whom. */
  appliedAt?: string;
  appliedBy?: string;
}

export const emptyRead = (): ReportRead => ({
  title: "",
  visitDate: "",
  inspector: "",
  address: "",
  condition: null,
  summary: "",
  checks: {},
  readings: {},
  tenantSays: "",
  rooms: [],
  notes: "",
});

/** A reader that stopped answering: a read still "reading" after this long is treated as failed. */
export const READ_GIVES_UP_MS = 8 * 60_000;

/** What can be read: a PDF, or a photo of a page. */
export const canRead = (type: string, name: string): boolean =>
  /pdf/i.test(type) || /\.pdf$/i.test(name) || /^image\/(jpeg|png|webp)$/i.test(type) || /\.(jpe?g|png|webp)$/i.test(name);
