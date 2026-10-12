/** The reasons a let can be cancelled for, and the words typed to confirm it
 *  (lib/let-cancel). Shared by the page and the route. */
export const CANCEL_REASONS = [
  "The tenant pulled out",
  "The landlord pulled out",
  "Failed referencing",
  "No guarantor",
  "The home isn't ready",
  "Something else",
] as const;

/** What has to be typed before it goes. Checked on the server as well. */
export const CANCEL_WORDS = "Cancel deal";
