"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Terms of business on one property — asked for once, read in three places.
 *
 * The status pill in the header, the Documents tab and the send pop-out are
 * three views of the same question, and they used to be one component that
 * sat open on the screen at all times. James's point: by the time a property
 * is in Listings the terms are signed, so a panel about sending them is a
 * permanent box asking a question nobody has. The answer is a pill; the copy
 * lives in Documents; sending is a pop-out you open on purpose.
 *
 * Three views means three fetches unless the call lives in one place, so it
 * lives here.
 */

export type TermsRequest = {
  id: number;
  status: "completed" | "partially_signed" | "incomplete" | "unknown";
  statusText: string;
  templateName: string;
  sentBy: string;
  sentAt: string | null;
  completedAt: string | null;
  envelopeId: string | null;
  error: string | null;
  signers: { role: string; name: string; email: string }[];
};

export type TermsDoc = {
  id: number;
  name: string;
  sizeMb: number;
  createdAt: string | null;
  /** Through the OS's proxy — never the CDN address underneath. */
  open: string;
};

export type TermsTemplate = { id: number; name: string; module: string | null };

export type TermsState = {
  status: "loading" | "ready" | "off";
  requests: TermsRequest[];
  docs: TermsDoc[];
  templates: TermsTemplate[];
  outstanding: TermsRequest[];
  /**
   * Signed, as the header pill means it: a completed request OR a signed
   * document on the record.
   *
   * Both halves matter. A request only joins to a listing when it was SENT
   * against that listing, and plenty were sent from the property or the
   * contact instead — so a record can hold a signed contract with no request
   * behind it. A pill that read "no terms" over the top of a signed PDF is
   * the one thing it must never do.
   */
  signed: boolean;
  reload: () => void;
};

export function useListingTerms(listingId: string | number | null): TermsState {
  const [status, setStatus] = useState<TermsState["status"]>("loading");
  const [requests, setRequests] = useState<TermsRequest[]>([]);
  const [docs, setDocs] = useState<TermsDoc[]>([]);
  const [templates, setTemplates] = useState<TermsTemplate[]>([]);

  const reload = useCallback(() => {
    if (listingId == null) return;
    fetch(`/api/esign?listingId=${encodeURIComponent(String(listingId))}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return setStatus("off");
        setRequests(j.requests ?? []);
        setDocs(j.documents ?? []);
        setStatus("ready");
      })
      .catch(() => setStatus("off"));
  }, [listingId]);

  useEffect(() => {
    setStatus("loading");
    setRequests([]);
    setDocs([]);
    reload();
  }, [reload]);

  useEffect(() => {
    fetch("/api/esign/templates")
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates ?? []))
      .catch(() => {});
  }, []);

  const outstanding = requests.filter((r) => r.status !== "completed");

  return {
    status,
    requests,
    docs,
    templates,
    outstanding,
    signed: docs.length > 0 || requests.some((r) => r.status === "completed"),
    reload,
  };
}
