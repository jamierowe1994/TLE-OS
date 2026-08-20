/**
 * What the tenant actually receives, shown as it would arrive.
 *
 * Table layout and inline styles on purpose — this is the real markup, not a
 * mock-up of it. Outlook still renders with Word's engine, so flexbox, grid
 * and external CSS are all out; anything built with them looks correct here
 * and falls apart in the client that half the landlords use.
 *
 * One job per email. There is a single button, and it goes to the feedback
 * page already signed in — no "log in and find your viewing", which is where
 * this kind of email normally loses people.
 */

const RED = "#e31f36";

const VIEWING = {
  first: "Sophie",
  property: "Flat 2, Mercer Street",
  locality: "Manchester M4",
  viewedOn: "Tuesday 18 August",
  agent: "Rhiannon Carter",
  agentRole: "Your lettings agent",
  phone: "0115 824 3310",
};

export default function FeedbackEmailPreview() {
  return (
    <main style={{ background: "#f1f1f1", padding: "32px 16px", minHeight: "100vh" }}>
      <p
        style={{
          maxWidth: 600,
          margin: "0 auto 14px",
          fontFamily: "system-ui, sans-serif",
          fontSize: 12,
          color: "#6b6b72",
        }}
      >
        Preview — this is the email, as it arrives. Subject:{" "}
        <strong>How was {VIEWING.property}?</strong>
      </p>

      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        style={{
          maxWidth: 600,
          width: "100%",
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: 14,
          overflow: "hidden",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          boxShadow: "0 14px 34px rgba(0,0,0,.10)",
        }}
      >
        <tbody>
          <tr>
            <td style={{ background: RED, padding: "18px 28px" }}>
              <span style={{ color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
                The Letting Experts
              </span>
            </td>
          </tr>

          <tr>
            <td style={{ padding: "28px 28px 0" }}>
              <h1 style={{ margin: 0, fontSize: 21, lineHeight: 1.3, color: "#1f1f24" }}>
                How was {VIEWING.property}?
              </h1>
              <p style={{ margin: "12px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "#43434a" }}>
                Hi {VIEWING.first},
              </p>
              <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "#43434a" }}>
                Thanks for coming to see {VIEWING.property} on {VIEWING.viewedOn}. Whatever you
                thought — good or not — it genuinely helps. It tells me what to send you next,
                and it tells the landlord how the property is landing.
              </p>
              <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "#43434a" }}>
                It takes about a minute. If you&rsquo;d like to put an offer in, you can do that
                on the same page.
              </p>
            </td>
          </tr>

          <tr>
            <td style={{ padding: "22px 28px 0" }}>
              <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: "100%" }}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        background: "#f6f6f7",
                        borderRadius: 12,
                        padding: "14px 16px",
                        fontSize: 13.5,
                        color: "#43434a",
                      }}
                    >
                      <strong style={{ color: "#1f1f24" }}>{VIEWING.property}</strong>
                      <br />
                      {VIEWING.locality} · viewed {VIEWING.viewedOn}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          {/* One button, one job. */}
          <tr>
            <td style={{ padding: "24px 28px 0" }}>
              <a
                href="/tenant/feedback"
                style={{
                  display: "block",
                  background: RED,
                  color: "#ffffff",
                  textDecoration: "none",
                  textAlign: "center",
                  fontSize: 15,
                  fontWeight: 700,
                  padding: "14px 20px",
                  borderRadius: 10,
                }}
              >
                Give feedback or make an offer
              </a>
              <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.5, color: "#8a8a92", textAlign: "center" }}>
                The link signs you straight in — no password to remember.
              </p>
            </td>
          </tr>

          <tr>
            <td style={{ padding: "26px 28px 28px" }}>
              <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: "100%" }}>
                <tbody>
                  <tr>
                    <td style={{ borderTop: "1px solid #e6e6e9", paddingTop: 18, fontSize: 13.5, lineHeight: 1.6, color: "#43434a" }}>
                      Any questions at all, just reply to this — it comes straight to me.
                      <br />
                      <br />
                      <strong style={{ color: "#1f1f24" }}>{VIEWING.agent}</strong>
                      <br />
                      <span style={{ color: "#8a8a92" }}>
                        {VIEWING.agentRole} · {VIEWING.phone}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </main>
  );
}
