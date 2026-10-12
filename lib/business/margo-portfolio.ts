/**
 * MARGO'S PORTFOLIO (Susan, 12 Oct 2026).
 *
 * Sean McMahon is buying Margo Wilson's Glasgow book for £100,000 over three
 * years, and every month Susan takes that portfolio's income, deducts his loan
 * payment and pays him the balance - so it has to be counted on its own.
 * "It needs to be Sean McMahon (Glasgow). And then anything else outside of
 * those ones can be just Sean McMahon. That's how we do them at the moment."
 *
 * The record is PayProp's responsible agent on the Glasgow (Scotland) agency.
 * On 12 Oct 2026 that was 67 homes still under "Margaret Wilson" and 10 already
 * relabelled "Sean Mcmahon (Glasgow)"; Sean's own homes sit on the E&W agency
 * as plain "Sean McMahon". Both of the Glasgow spellings count, so the figure
 * holds while the relabelling is part done.
 *
 * Client-safe: no server imports, so the property page can use it too.
 */

export const MARGO_PORTFOLIO = "Margo's portfolio";

const LABEL = /margaret\s+wilson|\bmargo\b|\(\s*glasgow\s*\)/i;

/** Is a PayProp home, on this agency with this responsible agent, part of Margo's portfolio? */
export function isMargoHome(account: string, responsibleAgent: string | null | undefined): boolean {
  return account === "scotland" && LABEL.test(responsibleAgent ?? "");
}
