/**
 * ONE MESSAGE ABOUT A JOB, TO THE LANDLORD AND THE TENANTS (Sean McMahon,
 * ticket 055aeda4, 10 Nov 2026: "Ability to message / email landlords and/or
 * tenants on maintenance needs addressing").
 *
 * A job could email one person at a time from their name, through the
 * general window, with templates about lettings rather than the job, and
 * the email was filed on the person - so the job's own timeline never said
 * anybody had been told. Telling a landlord and three tenants that the
 * plumber is coming Thursday was four windows and four retypes.
 *
 * Now the job has its own: pick who (the landlord, any of the tenants who
 * still live there), pick what (an update, the visit booked, access needed,
 * the job done, or a blank one), and each person gets their own copy with
 * their own name, from the agent's own Outlook where it is connected. One
 * line on the job's timeline says who was written to and what about.
 *
 * Client-safe: the window reads the templates, the route fills them.
 */

export type JobMessageTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  /** A template that needs a fact the job may not have yet ({{date}}, {{contractor}}). */
  needs?: Array<"date" | "contractor">;
};

export const JOB_MESSAGE_TEMPLATES: JobMessageTemplate[] = [
  {
    id: "update",
    name: "An update on the job",
    subject: "{{job}} at {{address}}",
    body: "Hi {{firstName}},\n\nA quick update on the {{job}} at {{address}}.\n\n\n\nAny questions, just reply to this email.\n\nKind regards,\n{{agent}}",
  },
  {
    id: "booked",
    name: "The visit is booked",
    subject: "{{job}} at {{address}} - visit booked",
    body: "Hi {{firstName}},\n\n{{contractor}} is booked to come to {{address}} on {{date}} for the {{job}}.\n\nIf that time does not work, reply to this email and we will move it.\n\nKind regards,\n{{agent}}",
    needs: ["date", "contractor"],
  },
  {
    id: "access",
    name: "We need access",
    subject: "{{job}} at {{address}} - access needed",
    body: "Hi {{firstName}},\n\n{{contractor}} needs to get into {{address}} to do the {{job}}.\n\nPlease reply with the days and times that suit you, and say if there are keys we can use.\n\nKind regards,\n{{agent}}",
    needs: ["contractor"],
  },
  {
    id: "done",
    name: "The job is done",
    subject: "{{job}} at {{address}} - done",
    body: "Hi {{firstName}},\n\nThe {{job}} at {{address}} has been done.\n\nIf anything is not right, reply to this email and we will get it looked at.\n\nKind regards,\n{{agent}}",
  },
  {
    id: "blank",
    name: "Write my own",
    subject: "{{job}} at {{address}}",
    body: "Hi {{firstName}},\n\n\n\nKind regards,\n{{agent}}",
  },
];

/** The fields a job message can use, for the hint under the box. */
export const JOB_MERGE_HINT = "{{firstName}} {{name}} {{address}} {{job}} {{date}} {{contractor}} {{agent}}";

export type JobMessagePerson = {
  /** "landlord" or "tenant:<n>": the route sends only to people on the job, never to a typed address. */
  key: string;
  role: "landlord" | "tenant";
  name: string;
  email: string | null;
  /** Why they are not ticked to start with, or cannot be: "No email on file", "Not involved in this job". */
  note: string | null;
};
