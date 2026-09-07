"use client";

/** Print, or save as PDF - the browser's own dialogue does both. */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{ border: "1px solid #101014", background: "#101014", color: "#fff", borderRadius: 999, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
    >
      Print or save as PDF
    </button>
  );
}
