# Supabase — ontwikkelaarsgids

Deze gids legt uit hoe je als nieuwe developer de Supabase-integratie van Horeca United kunt begrijpen en aanpassen. Supabase is de backend van de app: het beheert de database, authenticatie, bestandsopslag en Edge Functions (serverloze functies).

---

## Wat is Supabase?

Supabase is een open-source alternatief voor Firebase. Het biedt:
- **Database** — PostgreSQL database met tabellen, queries en policies
- **Auth** — inloggen via magic link (e-mail zonder wachtwoord)
- **Storage** — opslag voor bestanden (PDF-uploads van gebruikers)
- **Edge Functions** — serverloze functies die code uitvoeren in de cloud (Deno/TypeScript)

Het project draait op: `https://yyvzqnjumnpotawnrvfw.supabase.co`

---

## Stap 1 — Toegang krijgen tot het project

1. Maak een account aan op [supabase.com](https://supabase.com) als je die nog niet hebt
2. Vraag de projecteigenaar om je uit te nodigen voor het project via **Settings → Team**
3. Na uitnodiging zie je het project op je dashboard

Je hebt twee sleutels nodig voor ontwikkeling (te vinden via **Settings → API**):

| Sleutel | Waar | Gebruik |
|---|---|---|
| `anon` / publishable key | In `src/app.js` (staat al in de code) | Toegang vanuit de browser — veilig om te committen |
| `service_role` key | Alleen lokaal in `.env.local` — **nooit committen** | Bypass RLS in Edge Functions en CLI-tools |

---

## Stap 2 — Lokale omgeving instellen

**Installeer de Supabase CLI:**
```bash
# Via npm
npm install -g supabase

# Of via Homebrew (Mac)
brew install supabase/tap/supabase
```

**Sla je access token op** (te maken via [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)):
```bash
# Maak een .env.local aan (staat al in .gitignore — nooit committen)
echo "SUPABASE_ACCESS_TOKEN=<jouw-access-token>" > .env.local
echo "SUPABASE_SERVICE_ROLE_KEY=<jouw-service-role-key>" >> .env.local
```

**Laad de omgevingsvariabelen:**
```bash
source .env.local
```

---

## Stap 3 — Database begrijpen

De database bevat de volgende tabellen:

| Tabel | Wat staat erin |
|---|---|
| `uploads` | Metadata van geüploade bestanden per gebruiker |
| `transactions` | Verwerkte kostenregels uit PDF-facturen |
| `categories` | Kostencategorieën (Gas, Elektra, Vlees, etc.) |
| `suppliers` | Leveranciers (Hanos, Sligro, etc.) |
| `category_keywords` | Sleutelwoorden voor automatische categorisatie |
| `profiles` | Bedrijfsprofiel per gebruiker (naam, type, omzet) |
| `benchmark_data` | Groepsgemiddelden per categorie (beheerd door admin) |
| `extracted_data` | Ruwe AI-extractie-output en verwerkingsstatus |
| `data_sources` | Databronnen voor het machtigingenmodule |
| `authorizations` | Verleende machtigingen per gebruiker per databron |
| `authorization_events` | Onveranderlijk auditlog van machtigingswijzigingen |

**De database bekijken:**
Ga naar [supabase.com/dashboard](https://supabase.com/dashboard) → jouw project → **Table Editor** of **SQL Editor**.

**Queries uitvoeren:**
Via de SQL Editor in het dashboard kun je direct SQL uitvoeren, bijv.:
```sql
-- Alle transacties van een gebruiker bekijken
SELECT * FROM transactions WHERE email = 'gebruiker@example.com';

-- Overzicht van verwerkingsstatus
SELECT status, count(*) FROM extracted_data GROUP BY status;
```

---

## Stap 4 — Row Level Security (RLS)

Alle tabellen hebben **RLS** (Row Level Security) aan staan. Dit betekent dat gebruikers alleen hun eigen data kunnen zien en aanpassen — de database dwingt dit af, ongeacht hoe de app is geschreven.

De standaard policy werkt zo:
```sql
-- Gebruikers zien alleen rijen waar email overeenkomt met hun JWT-token
email = auth.jwt() ->> 'email'
```

Als je als developer alle data wil zien (bijv. voor debugging), gebruik je de `service_role` key in plaats van de `anon` key. De CLI en Edge Functions gebruiken automatisch de service role.

---

## Stap 5 — Edge Functions aanpassen

Edge Functions staan in `supabase/functions/`. Elke functie is een map met een `index.ts` bestand.

```
supabase/functions/
  extract-pdf/index.ts          ← PDF verwerken via Gemini AI
  send-upload-confirmation/index.ts  ← bevestigingsmail na upload
  notify-proposal/index.ts      ← interne melding bij nieuw voorstel
```

**Een functie lokaal testen:**
```bash
source .env.local
supabase functions serve extract-pdf --project-ref <project-ref>
```

De functie draait dan lokaal op `http://localhost:54321/functions/v1/extract-pdf`. Je kunt hem aanroepen met:
```bash
curl -X POST http://localhost:54321/functions/v1/extract-pdf \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"file_path": "test.pdf", "email": "test@example.com"}'
```

**Een functie deployen naar productie:**
```bash
source .env.local
supabase functions deploy extract-pdf --project-ref <project-ref>
```

Of push naar `main` op GitHub — de GitHub Actions workflow deployt automatisch alle gewijzigde functies.

---

## Stap 6 — Secrets beheren

Edge Functions hebben runtime-geheimen nodig (API-sleutels, wachtwoorden). Deze zijn al ingesteld in het Supabase-project. Je hoeft ze als nieuwe developer dus niet opnieuw in te stellen.

**Huidige secrets (al geconfigureerd):**

| Secret | Doel |
|---|---|
| `GEMINI_API_KEY` | Google Gemini AI voor PDF-extractie |
| `GMAIL_USER` | Gmail-adres voor versturen van e-mails |
| `GMAIL_APP_PASSWORD` | Gmail App Password (geen gewoon wachtwoord) |
| `INTERNAL_NOTIFY_EMAIL` | Intern adres voor meldingen bij nieuwe voorstellen |
| `SUPABASE_SERVICE_ROLE_KEY` | Toegang tot database zonder RLS in Edge Functions |

**Als je een secret wil updaten of toevoegen:**
```bash
source .env.local
supabase secrets set <NAAM>=<waarde> --project-ref <project-ref>
```

Of via het dashboard: **Edge Functions → Secrets**.

In de functiecode lees je secrets via:
```typescript
const apiKey = Deno.env.get("GEMINI_API_KEY")!;
```

---

## Stap 7 — Logs bekijken

Als een functie crasht of onverwacht gedrag vertoont, bekijk de logs via:

**Dashboard:**
Ga naar **Edge Functions** → klik op de functie → **Logs**

**CLI:**
```bash
source .env.local
supabase functions logs extract-pdf --project-ref <project-ref>
```

---

## Veelgemaakte fouten

| Fout | Oorzaak | Oplossing |
|---|---|---|
| `401 Unauthorized` | Geen of verkeerde Authorization header | Stuur `Bearer <anon-key>` mee in de header |
| `403 Forbidden` | RLS blokkeert toegang | Gebruik service role key voor admin-queries |
| `404 Not Found` | Bestand bestaat niet in Storage | Controleer `file_path` in de `uploads` tabel |
| `503 Service Unavailable` | Gemini AI overbelast | Functie probeert automatisch 3x opnieuw; zie `EDGE_FUNCTIONS.md` |
| `function not found` | Functie nog niet gedeployed | Voer `supabase functions deploy <naam>` uit |

---

## Meer informatie

- [Supabase documentatie](https://supabase.com/docs)
- [Edge Functions gids](https://supabase.com/docs/guides/functions)
- [Deno documentatie](https://deno.land/) (de runtime voor Edge Functions)
- Zie ook `EDGE_FUNCTIONS.md` in dit project voor specifieke setup-instructies per functie
