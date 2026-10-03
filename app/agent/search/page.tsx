"use client";

import { useState } from "react";
import { PhoneTop, SearchBox } from "../bits";
import SearchResults from "./results";

/**
 * SEARCH EVERYTHING (3 Oct 2026): Home's search box, from James's mockup -
 * "Search properties, tenants, landlords..." - asks the two phone finders at
 * once and shows both. A person rings from here; a property opens on the
 * Properties tab with the same words. Home's box now floats up and shows the
 * same results in place (./results); this page stays for the + sheet.
 */

export default function PhoneSearch() {
  const [needle, setNeedle] = useState("");
  return (
    <main>
      <PhoneTop title="Search" back="/agent" />
      <SearchBox value={needle} onChange={setNeedle} placeholder="Properties, tenants, landlords..." autoFocus />
      <SearchResults needle={needle} />
    </main>
  );
}
