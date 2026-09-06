"use client";

import { useSyncExternalStore } from "react";

/**
 * The document sheet: one place, page-wide, that shows a certificate.
 *
 * James, 6 Sep 2026: opening a file should not leave the screen. Click the
 * certificate and the drawer you were in slides off to the right while the
 * document comes up from the bottom; close it and the document goes back
 * down as the drawer slides in again. Every drawer reads `useDocumentOpen`
 * to know when to move aside; PropertyFile calls `openDocument`.
 */

export interface SheetDocument {
  /** The vault key: documents/compliance-<property>-<certKey>/<file>. */
  key: string;
  name: string;
  /** What it is: "Gas safety (CP12)". */
  label: string;
  /** The home it belongs to, when the caller knows it. */
  property?: string | null;
  /** Where to load it from (the signed redirect). */
  url: string;
}

let current: SheetDocument | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openDocument(doc: SheetDocument) {
  current = doc;
  emit();
}

export function closeDocument() {
  current = null;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function useDocument(): SheetDocument | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** True while a document is up, so a drawer can slide out of the way. */
export function useDocumentOpen(): boolean {
  return useSyncExternalStore(subscribe, () => current != null, () => false);
}
