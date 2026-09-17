import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER")!;
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD")!;
const INTERNAL_NOTIFY_EMAIL = Deno.env.get("INTERNAL_NOTIFY_EMAIL") ?? GMAIL_USER;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { email, name, fileNames, fileCount } = await req.json();
  if (!email || !fileCount) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const displayName = name || email;
  const fileList = Array.isArray(fileNames) && fileNames.length
    ? fileNames.map((f: string) => `  - ${f}`).join("\n")
    : `  - ${fileCount} bestand(en)`;

  const subject = `Bevestiging: ${fileCount} bestand(en) ontvangen — Horeca United`;
  const body = `Hoi ${displayName},

Bedankt voor het uploaden van je documenten! We hebben het volgende ontvangen:

${fileList}

We verwerken je gegevens en nemen contact op als we meer informatie nodig hebben.

Met vriendelijke groet,
Team Horeca United
`;

  await sendEmail(email, subject, body);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function sendEmail(to: string, subject: string, body: string) {
  const credentials = btoa(`${GMAIL_USER}:${GMAIL_APP_PASSWORD}`);
  const res = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: btoa(
        `To: ${to}\r\nFrom: Horeca United <${GMAIL_USER}>\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
      ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send failed: ${err}`);
  }
}
