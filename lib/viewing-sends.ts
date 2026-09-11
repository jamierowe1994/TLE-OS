/**
 * The viewing screens' own sends are OFF for the pilot (11 Sep 2026).
 *
 * Cancel & tell them, Send the offer, the booker's "who do we tell?", the
 * no-show email and Reschedule all went through SendFlow or a local log line
 * with no send behind them: the screen said "sent" and nothing left. An agent
 * cancelling a viewing would have had the applicant turn up anyway. Until they
 * are wired to the agent's own mailbox (MASTER-LIST D16), the buttons are
 * hidden and the screen says to do it in REX or Outlook. Flip to true only
 * once every one of them really sends.
 */
export const VIEWING_SENDS_LIVE = false;

/**
 * Booking a viewing FROM A LISTING is off for the pilot (11 Sep 2026).
 *
 * Its "Who's viewing?" list was the sample applicants in lib/leads-sample
 * (Sarah Johnson, Tom Williams...), the agent was always "Kirstie", and the
 * booking lived only on that screen. Booking from a lead is the real path.
 * Flip to true once the listing feeds the booker its real REX enquiries
 * (MASTER-LIST D17).
 */
export const LISTING_BOOKER_LIVE = false;
