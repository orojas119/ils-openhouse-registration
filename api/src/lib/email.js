const { CONFIRMATION_FROM_EMAIL, EVENT_LOCATION } = require("./config");
const { sendMail } = require("./graph");

const EVENT_NAME = "ILS Open House";
const EVENT_DATE_LABEL = "Saturday, October 17, 2026";
const EVENT_TIME_LABEL = "8:00 AM – 1:00 PM";
// Oct 17, 2026 falls during EDT (UTC-4) — 8am/1pm Eastern in plain UTC,
// avoids needing a VTIMEZONE block for calendar apps to interpret correctly.
const EVENT_START_UTC = "20261017T120000Z";
const EVENT_END_UTC = "20261017T170000Z";

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
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937;">
      <h2 style="color:#004B23;">You're registered for the ${EVENT_NAME}!</h2>
      <p>Dear ${parentFirstName} ${parentLastName},</p>
      <p>Thank you for registering the following student(s):</p>
      <ul>${studentRows}</ul>
      <p>
        <strong>Date:</strong> ${EVENT_DATE_LABEL}<br>
        <strong>Time:</strong> ${EVENT_TIME_LABEL}<br>
        <strong>Location:</strong> ${EVENT_LOCATION}
      </p>
      <p><a href="${googleCalendarLink(description)}" style="display:inline-block;background:#004B23;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Add to Google Calendar</a></p>
      <p style="font-size:12px;color:#777;">A calendar invite is also attached — open it to add this event to Outlook, Apple Calendar, or any other calendar app.</p>
      <p>We look forward to seeing you and your family!</p>
      <p>Immaculata-La Salle High School</p>
    </div>`;

  const message = {
    subject: `You're registered for the ${EVENT_NAME} — ${EVENT_DATE_LABEL}`,
    body: { contentType: "HTML", content: html },
    toRecipients: [{ emailAddress: { address: email, name: `${parentFirstName} ${parentLastName}` } }],
    attachments: [
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
