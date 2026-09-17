import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

const SYSTEM_PROMPT = `Je bent een expert in het extraheren van kostendata uit Nederlandse bedrijfsdocumenten voor horecaondernemers.

Analyseer het document en extraheer ALLE kosten, contracten en relevante bedragen. Geef altijd een JSON-array terug met transactieobjecten.

Voor elk gevonden item, geef:
- category: één van [Gas, Elektra, Water, Telecom, Internet, Verzekering, Afval, Vlees, Vis, Zuivel, Groente & Fruit, Bier, Wijn, Frisdrank, Koffie & Thee, Schoonmaak, Verpakking, Personeelskosten, Huur, Accountant, Inkoop (overig)]
- supplier: naam van leverancier/provider zoals vermeld in document
- product_name: omschrijving van product of dienst
- amount: totaalbedrag in euro (excl. BTW indien mogelijk)
- amount_is_excl_btw: true als excl. BTW, false als incl. BTW
- quantity: hoeveelheid (optioneel)
- unit: eenheid zoals m3, kWh, liter, kg (optioneel)
- period_start: begindatum periode YYYY-MM-DD (optioneel)
- period_end: einddatum periode YYYY-MM-DD (optioneel)
- transaction_date: factuurdatum YYYY-MM-DD (optioneel)
- is_contract: true als dit een contract/abonnement is
- monthly_amount: maandelijks bedrag als is_contract=true (optioneel)
- contract_term_months: minimale contractduur in maanden (optioneel)
- notice_period_months: opzegtermijn in maanden (optioneel)
- notice_period_text: leesbare opzegmogelijkheid bijv. "3 maanden voor einde contractjaar" (optioneel)
- auto_renews: true als contract automatisch verlengt (optioneel)
- renewal_date: verlengingsdatum YYYY-MM-DD (optioneel)
- action_deadline: uiterste actiedatum YYYY-MM-DD (optioneel)
- notes: extra relevante informatie

Voorbeeld voor een Odido-factuur:
[{"category":"Telecom","supplier":"Odido","product_name":"Zakelijk abonnement","amount":49.95,"amount_is_excl_btw":true,"transaction_date":"2024-03-01","is_contract":true,"monthly_amount":49.95,"contract_term_months":24,"notice_period_months":1,"auto_renews":true}]

Geef ALLEEN de JSON-array terug, geen uitleg.`;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();

  // Accepteer zowel directe aanroep als Supabase database webhook (body.record)
  const record = body.record ?? body;
  const { file_path, upload_id, email, name, force } = {
    file_path: record.file_path,
    upload_id: record.id ?? record.upload_id,
    email: record.email,
    name: record.name,
    force: body.force === true, // admin-only: verwijder bestaande transacties en verwerk opnieuw
  };

  if (!file_path || !email) {
    return new Response(JSON.stringify({ error: "file_path en email zijn verplicht" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Sla niet-PDF bestanden stilletjes over (webhook vuurt ook voor Excel)
  if (!file_path.toLowerCase().endsWith(".pdf")) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Download PDF from Supabase Storage
  const { data: fileData, error: downloadError } = await sb.storage
    .from("client-uploads")
    .download(file_path);

  if (downloadError || !fileData) {
    return new Response(JSON.stringify({ error: "Bestand niet gevonden: " + downloadError?.message }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fileBytes = await fileData.arrayBuffer();
  const uint8 = new Uint8Array(fileBytes);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
  }
  const base64File = btoa(binary);
  const mimeType = file_path.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg";

  // Call Gemini with retry on 503 overload (max 3 attempts, exponential backoff)
  const MAX_RETRIES = 3;
  let geminiData: Record<string, unknown> | null = null;
  let overloadCount = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const geminiResponse = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: SYSTEM_PROMPT },
          { inline_data: { mime_type: mimeType, data: base64File } },
        ]}],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    });

    if (geminiResponse.ok) {
      geminiData = await geminiResponse.json();
      break;
    }

    const errBody = await geminiResponse.json().catch(() => ({})) as Record<string, unknown>;
    const errCode = (errBody?.error as Record<string, unknown>)?.code;

    if (errCode === 503) {
      overloadCount++;
      // Log overload event for monitoring
      await sb.from("extracted_data").upsert({
        email,
        upload_id: upload_id ?? null,
        status: "overload_retry",
        notes: `Gemini overbelast: poging ${attempt}/${MAX_RETRIES} (${new Date().toISOString()})`,
        submitted_at: new Date().toISOString().slice(0, 10),
      }, { onConflict: "upload_id" });

      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, attempt * 8000)); // 8s, 16s
        continue;
      }
      return new Response(JSON.stringify({
        error: "Gemini overbelast na 3 pogingen",
        overload_retries: overloadCount,
      }), { status: 503, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Gemini fout", details: errBody }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawText = (geminiData as Record<string, unknown>)
    ?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

  let extracted: Record<string, unknown>[];
  try {
    extracted = JSON.parse(rawText);
    if (!Array.isArray(extracted)) extracted = [extracted];
  } catch {
    return new Response(JSON.stringify({ error: "Kon Gemini-response niet parsen", raw: rawText }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (extracted.length === 0) {
    return new Response(JSON.stringify({ ok: true, inserted: 0, message: "Geen transacties gevonden" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Voorkom dubbele verwerking
  if (upload_id) {
    const { count } = await sb.from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("upload_id", upload_id);
    if (count && count > 0) {
      if (!force) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "Al verwerkt", existing: count }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      // force=true: verwijder bestaande transacties en verwerk opnieuw
      await sb.from("transactions").delete().eq("upload_id", upload_id);
    }
  }

  // Look up category IDs
  const { data: categories } = await sb.from("categories").select("id, name");
  const categoryMap = Object.fromEntries((categories ?? []).map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id]));
  const FALLBACK_CATEGORY_ID = categoryMap["inkoop (overig)"] ?? Object.values(categoryMap)[0];

  // Look up or create supplier IDs
  const { data: suppliers } = await sb.from("suppliers").select("id, name");
  const supplierMap = Object.fromEntries((suppliers ?? []).map((s: { id: string; name: string }) => [s.name.toLowerCase(), s.id]));

  const toInsert = extracted.map((item) => {
    const catName = String(item.category ?? "").toLowerCase();
    const categoryId = categoryMap[catName] ?? FALLBACK_CATEGORY_ID;

    const supplierName = String(item.supplier ?? "").toLowerCase();
    const supplierId = supplierMap[supplierName] ?? null;

    return {
      email,
      name: name ?? null,
      upload_id: upload_id ?? null,
      category_id: categoryId,
      supplier_id: supplierId,
      product_name: item.product_name ?? null,
      amount: item.amount ?? null,
      amount_is_excl_btw: item.amount_is_excl_btw ?? true,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      period_start: item.period_start ?? null,
      period_end: item.period_end ?? null,
      transaction_date: item.transaction_date ?? null,
      is_contract: item.is_contract ?? false,
      monthly_amount: item.monthly_amount ?? null,
      contract_term_months: item.contract_term_months ?? null,
      notice_period_months: item.notice_period_months ?? null,
      notice_period_text: item.notice_period_text ?? null,
      auto_renews: item.auto_renews ?? null,
      renewal_date: item.renewal_date ?? null,
      action_deadline: item.action_deadline ?? null,
      notes: item.notes ?? null,
      source: "gemini-extract",
      raw_data: { gemini_output: item, file_path },
    };
  });

  const { error: insertError } = await sb.from("transactions").insert(toInsert);
  if (insertError) {
    return new Response(JSON.stringify({ error: "DB insert fout: " + insertError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Mark extracted_data as processed if upload_id provided
  if (upload_id) {
    await sb.from("extracted_data")
      .update({ processed_to_transactions: true, status: "processed" })
      .eq("upload_id", upload_id);
  }

  return new Response(JSON.stringify({ ok: true, inserted: toInsert.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
