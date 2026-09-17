# Edge Functions — setup guide

## Overzicht

| Functie | Doel |
|---|---|
| `send-upload-confirmation` | Stuur bevestigingsmail aan gebruiker na upload |
| `notify-proposal` | Stuur intern bericht bij nieuw voorstel- of contractverzoek |
| `extract-pdf` | Lees PDF uit storage, extraheer kostendata via Gemini, sla op als transacties |

Alle functies worden automatisch gedeployed via GitHub Actions wanneer je naar `main` pusht en bestanden onder `supabase/functions/` zijn gewijzigd.

---

## Stap 1 — Supabase toegang instellen

Je hebt een **Supabase Personal Access Token** nodig om functies te deployen.

1. Ga naar [supabase.com/dashboard](https://supabase.com/dashboard) → rechtsboven op je avatar → **Account**
2. Kies **Access Tokens** → **Generate new token**
3. Geef het een naam (bijv. `github-actions`) en kopieer de token (je ziet hem maar één keer)

---

## Stap 2 — Gmail App Password aanmaken

De functies gebruiken een Gmail-account om e-mail te versturen via de Gmail API met een **App Password** (geen OAuth-flow nodig).

1. Log in op het Gmail-account dat je wilt gebruiken (bijv. `info@horeca-united.nl`)
2. Ga naar [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   - Vereist dat 2-stapsverificatie aan staat
3. Kies **Andere (aangepaste naam)** → typ `supabase-edge-functions` → **Maken**
4. Kopieer het 16-cijferige wachtwoord

---

## Stap 3 — Secrets toevoegen in GitHub

Ga naar de repo op GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Voeg de volgende secrets toe:

| Naam | Waarde |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token uit stap 1 |
| `SUPABASE_PROJECT_REF` | `yyvzqnjumnpotawnrvfw` |

---

## Stap 4 — Secrets toevoegen in Supabase

De functies zelf hebben runtime-secrets nodig. Stel deze in via de Supabase dashboard of CLI.

**Via dashboard:**
1. Ga naar [supabase.com/dashboard](https://supabase.com/dashboard) → jouw project → **Edge Functions** → **Secrets**
2. Voeg toe:

| Naam | Waarde |
|---|---|
| `GMAIL_USER` | Het Gmail-adres (bijv. `info@horeca-united.nl`) |
| `GMAIL_APP_PASSWORD` | App Password uit stap 2 |
| `INTERNAL_NOTIFY_EMAIL` | Adres voor interne meldingen (bijv. `paul@horeca-united.nl`) |

Voor `extract-pdf` voeg ook toe:

| Naam | Waarde |
|---|---|
| `GEMINI_API_KEY` | API key van [aistudio.google.com](https://aistudio.google.com) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key uit Supabase → Settings → API |

**Via CLI (alternatief):**
```bash
supabase secrets set GMAIL_USER=<jouw-gmail> --project-ref <project-ref>
supabase secrets set GMAIL_APP_PASSWORD=<app-password> --project-ref <project-ref>
supabase secrets set INTERNAL_NOTIFY_EMAIL=<intern-adres> --project-ref <project-ref>
supabase secrets set GEMINI_API_KEY=<gemini-key> --project-ref <project-ref>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key> --project-ref <project-ref>
```

---

## Stap 5 — Eerste deploy uitvoeren

Na het instellen van alle secrets, push naar `main` om de GitHub Actions workflow te triggeren:

```bash
git push origin main
```

Of deploy handmatig via CLI (sla access token op in `.env.local`, staat in `.gitignore`):

```bash
source .env.local   # bevat SUPABASE_ACCESS_TOKEN=<jouw-token>
supabase functions deploy send-upload-confirmation --project-ref <project-ref>
supabase functions deploy notify-proposal --project-ref <project-ref>
supabase functions deploy extract-pdf --project-ref <project-ref>
```

---

## Verificatie

Na de deploy kun je de functies testen via de Supabase dashboard:
1. Ga naar **Edge Functions** in je project
2. Klik op een functie → **Test**
3. Stuur een POST request met een testbody (zie hieronder)

**Test body voor `send-upload-confirmation`:**
```json
{
  "email": "test@example.com",
  "name": "Test Gebruiker",
  "fileNames": ["factuur-jan.pdf"],
  "fileCount": 1
}
```

**Test body voor `notify-proposal`:**
```json
{
  "email": "klant@example.com",
  "categories": ["Vlees"],
  "type": "contract_interest"
}
```

**Test body voor `extract-pdf`:**
```json
{
  "file_path": "<email-gebruiker>/<timestamp>_<bestandsnaam>.pdf",
  "upload_id": "<uuid-uit-uploads-tabel>",
  "email": "gebruiker@example.com",
  "name": "Bedrijfsnaam"
}
```

---

## Admin: PDF opnieuw verwerken

Als een PDF al verwerkt is en je wil hem opnieuw door Gemini sturen (bijv. na een prompt-update), gebruik dan `"force": true`. Dit **verwijdert eerst de bestaande transacties** voor die upload en verwerkt hem opnieuw.

```json
{
  "file_path": "<email-gebruiker>/<timestamp>_<bestandsnaam>.pdf",
  "upload_id": "<uuid-uit-uploads-tabel>",
  "email": "gebruiker@example.com",
  "name": "Bedrijfsnaam",
  "force": true
}
```

Zonder `force` geeft de functie `{"skipped": true, "existing": N}` terug als er al transacties zijn.

---

## Monitoring overbelasting

Als Gemini overbelast is (HTTP 503) probeert de functie automatisch 3 keer met 8s en 16s wachttijd. Als alle pogingen mislukken wordt een rij aangemaakt in `extracted_data` met `status = 'overload_retry'` zodat je dit kunt monitoren:

```sql
SELECT email, upload_id, notes, created_at
FROM extracted_data
WHERE status = 'overload_retry'
ORDER BY created_at DESC;
```

Herverwijk mislukte uploads daarna handmatig met de `force`-optie hierboven.
