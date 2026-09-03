const fs = require("fs");
const path = require("path");
const { CONFIRMATION_FROM_EMAIL, EVENT_LOCATION } = require("./config");
const { sendMail } = require("./graph");

const EVENT_NAME = "ILS Open House";
const EVENT_DATE_LABEL = "Saturday, October 17, 2026";
const EVENT_TIME_LABEL = "8:00 AM – 1:00 PM";
// Oct 17, 2026 falls during EDT (UTC-4) — 8am/1pm Eastern in plain UTC,
// avoids needing a VTIMEZONE block for calendar apps to interpret correctly.
const EVENT_START_UTC = "20261017T120000Z";
const EVENT_END_UTC = "20261017T170000Z";

// Same static event, every family — the "Add to Apple Calendar" button just
// links straight to this file (index.html/checkin.html's own site, next to
// assets/crest.png); tapping a .ics URL opens Calendar directly on iOS/Mac.
// The personalized copy still goes out as a real attachment below.
const APPLE_CALENDAR_URL = "https://openhouse.ilsroyals.com/assets/ILS-Open-House.ics";

const CREST_PATH = path.join(__dirname, "assets", "crest-email.png");
const CREST_CONTENT_ID = "ils-crest";

// ILS brand palette — same tokens index.html/checkin.html use.
const GREEN = "#004B23";
const GREEN_PALE = "#f2f7f4";
const GOLD = "#FFC20E";

function escapeIcs(s) {
  return String(s).replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
}

function buildIcs(uid, description) {
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Immaculata-La Salle High School//Open House//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@openhouse.ilsroyals.com`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${EVENT_START_UTC}`,
    `DTEND:${EVENT_END_UTC}`,
    `SUMMARY:${escapeIcs(EVENT_NAME)}`,
    `LOCATION:${escapeIcs(EVENT_LOCATION)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function googleCalendarLink(description) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: EVENT_NAME,
    dates: `${EVENT_START_UTC}/${EVENT_END_UTC}`,
    details: description,
    location: EVENT_LOCATION,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Best-effort: a failed send should never fail the registration itself, and
// this no-ops entirely until CONFIRMATION_FROM_EMAIL is provisioned (same
// graceful-degradation pattern as Turnstile).
async function sendConfirmationEmail({ submissionId, students, parentFirstName, parentLastName, email }) {
  if (!CONFIRMATION_FROM_EMAIL) return;

  const description = `Thank you for registering for the ${EVENT_NAME}. We look forward to seeing you and your family!`;
  const studentRows = students
    .map((s) => `<li>${[s.firstName, s.lastName].filter(Boolean).join(" ")} — ${s.gradeLevel}</li>`)
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937;background:${GREEN_PALE};padding:0;">
      <div style="background:${GREEN};padding:24px 20px;text-align:center;border-radius:8px 8px 0 0;">
        <img src="cid:${CREST_CONTENT_ID}" alt="Immaculata-La Salle High School crest" width="80" height="80" style="border-radius:50%;border:3px solid ${GOLD};background:#fff;">
      </div>
      <div style="background:#fff;padding:28px 24px;border-radius:0 0 8px 8px;">
        <h2 style="color:${GREEN};margin:0 0 16px;">You're registered for the ${EVENT_NAME}!</h2>
        <p>Dear ${parentFirstName} ${parentLastName},</p>
        <p>Thank you for registering the following student(s):</p>
        <ul>${studentRows}</ul>
        <p style="background:${GREEN_PALE};border-left:4px solid ${GOLD};padding:12px 16px;border-radius:4px;">
          <strong style="color:${GREEN};">Date:</strong> ${EVENT_DATE_LABEL}<br>
          <strong style="color:${GREEN};">Time:</strong> ${EVENT_TIME_LABEL}<br>
          <strong style="color:${GREEN};">Location:</strong> ${EVENT_LOCATION}
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
          <tr>
            <td style="padding-right:10px;">
              <a href="${googleCalendarLink(description)}" style="display:inline-block;background:${GREEN};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;">Add to Google Calendar</a>
            </td>
            <td>
              <a href="${APPLE_CALENDAR_URL}" style="display:inline-block;background:#fff;color:${GREEN};padding:8px 17px;border:2px solid ${GREEN};border-radius:6px;text-decoration:none;font-weight:bold;">Add to Apple Calendar</a>
            </td>
          </tr>
        </table>
        <p style="font-size:12px;color:#777;">A calendar invite is also attached — open it to add this event to Outlook or any other calendar app.</p>
        <p>We look forward to seeing you and your family!</p>
        <p style="color:${GREEN};font-weight:bold;">Immaculata-La Salle High School</p>
      </div>
    </div>`;

  const message = {
    subject: `You're registered for the ${EVENT_NAME} — ${EVENT_DATE_LABEL}`,
    body: { contentType: "HTML", content: html },
    toRecipients: [{ emailAddress: { address: email, name: `${parentFirstName} ${parentLastName}` } }],
    from: { emailAddress: { address: CONFIRMATION_FROM_EMAIL, name: "ILS Admissions" } },
    attachments: [
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: CREST_CONTENT_ID + ".png",
        contentType: "image/png",
        contentId: CREST_CONTENT_ID,
        isInline: true,
        contentBytes: fs.readFileSync(CREST_PATH).toString("base64"),
      },
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: "ILS-Open-House.ics",
        contentType: "text/calendar",
        contentBytes: Buffer.from(buildIcs(submissionId, description), "utf-8").toString("base64"),
      },
    ],
  };

  await sendMail(CONFIRMATION_FROM_EMAIL, message);
}

module.exports = { sendConfirmationEmail };
