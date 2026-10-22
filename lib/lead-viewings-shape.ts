/**
 * One viewing on the Leads board's Viewing column (lib/lead-viewings).
 * Client-safe: the keys the board already holds, the time, and the home.
 */
export interface LeadViewingRow {
  /** rex-<calendar event> or os-<appointment>. */
  id: string;
  /** Lower-cased; empty when the viewing names nobody by email. */
  email: string;
  /** The REX contact the viewing is with. */
  contactId: string | null;
  /** The lead it was booked from, when it was booked in the OS. */
  leadId: string | null;
  startsAt: string;
  address: string;
  agent: string | null;
  /** Booked from the OS rather than straight into REX. */
  bookedHere: boolean;
}
