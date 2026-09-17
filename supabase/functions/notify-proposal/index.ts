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

  const { email, categories, type, estimatedSaving } = await req.json();
  if (!email || !categories?.length) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const categoryList = (categories as string[]).join(", ");
  const typeLabel = type === "contract_interest" ? "contractinteresse" : "benchmark-interesse";
  const savingLine = estimatedSaving
    ? `Geschatte besparing: €${estimatedSaving.toLocaleString("nl-NL")}`
    : "";

  const subject = `Nieuwe ${typeLabel}: ${categoryList}`;
  const body = `Nieuwe aanvraag via Horeca United:

Gebruiker:   ${email}
Type:        ${typeLabel}
Categorieën: ${categoryList}
${savingLine}

Log in op het admin dashboard voor meer details.
`;

  await sendEmail(INTERNAL_NOTIFY_EMAIL, subject, body);

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
