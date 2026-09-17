# Edge Functions — setup guide

## Overzicht

| Functie | Doel |
|---|---|
| `send-upload-confirmation` | Stuur bevestigingsmail aan gebruiker na upload |
| `notify-proposal` | Stuur intern bericht bij nieuw voorstel- of contractverzoek |

Beide functies worden automatisch gedeployed via GitHub Actions wanneer je naar `main` pusht en bestanden onder `supabase/functions/` zijn gewijzigd.

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

**Via CLI (alternatief):**
```bash
supabase secrets set GMAIL_USER=info@horeca-united.nl --project-ref yyvzqnjumnpotawnrvfw
supabase secrets set GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx --project-ref yyvzqnjumnpotawnrvfw
supabase secrets set INTERNAL_NOTIFY_EMAIL=paul@horeca-united.nl --project-ref yyvzqnjumnpotawnrvfw
```

---

## Stap 5 — Eerste deploy uitvoeren

Na het instellen van alle secrets, push naar `main` om de GitHub Actions workflow te triggeren:

```bash
git push origin main
```

Of deploy handmatig via CLI:

```bash
supabase functions deploy send-upload-confirmation --project-ref yyvzqnjumnpotawnrvfw
supabase functions deploy notify-proposal --project-ref yyvzqnjumnpotawnrvfw
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
