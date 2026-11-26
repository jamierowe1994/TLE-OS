"use client";

import Link from "next/link";
import { useLandlordLink } from "@/components/landlord/useLandlordLink";

/**
 * THE LANDLORD'S FRONT DOOR, CALM (James, 26 Nov 2026, with Nook's welcome
 * page: "adapt the landlord sign-in page to look something like this, to look
 * just a little bit more professional"; "down-to-earth and not too overly
 * done").
 *
 * A page on its own - the portal's bar and footer stand down (app/landlord-
 * calm.css, .lsi). A quiet white column: the logo, one title, one box, one
 * button. Beside it, a photograph of ordinary brick homes in the house grade
 * with one line over it saying what is behind the door. Same words and the
 * same link by email as the classic page (useLandlordLink).
 *
 * The line on the photograph is a statement of what the portal holds, not a
 * customer's words: there is no testimonial to put there.
 */
const Arrow = () => (
  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
);
const Tick = () => (
  <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export default function SignInCalm() {
  const { email, setEmail, busy, sent, dev, submit, again } = useLandlordLink();

  return (
    <div className="lsi">
      <div className="lsi-left">
        <Link href="https://thelettingexperts.co.uk" className="lsi-logo" aria-label="The Letting Experts">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/tle-logo.png" alt="The Letting Experts" />
        </Link>

        <div className="lsi-mid">
          <p className="llh-label">Landlord account</p>
          <h1>Your property file</h1>
          <p className="lsi-sub">
            Type the email address we hold for you and we&rsquo;ll send you a link. No password to remember: the link signs you in, works once, and lasts a day.
          </p>

          {sent ? (
            <div className="lsi-sent" role="status">
              <h2>Check your email</h2>
              <p>{sent}</p>
              <p className="lsi-small">
                Nothing arrived after a few minutes? Check your junk folder, or{" "}
                <button type="button" onClick={again}>try a different address</button>.
              </p>
              {dev && (
                <div className="lsi-dev">
                  <b>Not sent, because this isn&rsquo;t production.</b>
                  <p>{dev.note}</p>
                  <a href={dev.link}>Open the link here instead</a>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="lsi-form">
              <label>
                <span className="llh-label">Your email</span>
                <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <button type="submit" disabled={busy} className="lsi-go">
                {busy ? "Sending…" : "Send me my link"}
                {!busy && <Arrow />}
              </button>
              <p className="lsi-small">We&rsquo;ll use the address on your file with us. If you&rsquo;re not sure which that is, ask your agent.</p>
            </form>
          )}
        </div>

        <p className="lsi-foot">
          <a href="https://thelettingexperts.co.uk/privacy-policy" target="_blank" rel="noreferrer">Privacy and your data</a>
          <a href="https://thelettingexperts.co.uk/contact-us" target="_blank" rel="noreferrer">Contact us</a>
          <a href="https://thelettingexperts.co.uk/complaints-handling" target="_blank" rel="noreferrer">Complaints</a>
        </p>
      </div>

      <div className="lsi-right">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/photo/landlord-door.webp" alt="" />
        <div className="lsi-say">
          <p className="llh-label">Behind the door</p>
          <p className="q">Your home, your rent and your paperwork, in one place.</p>
          <ul className="lsi-does">
            {["Rent and statements", "Certificates and documents", "Repairs, tracked to done"].map((t) => (
              <li key={t}>
                <Tick />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
