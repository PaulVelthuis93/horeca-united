/**
 * Horeca United — Supabase integratietest
 *
 * Gebruik:
 *   node test_supabase.mjs
 *
 * Test wat er getest wordt:
 *   1. INSERT in extracted_data (anon RLS)
 *   2. INSERT in uploads (anon RLS)
 *   3. Edge Function extract-pdf bereikbaar
 *   4. Opruimen (DELETE testrijen)
 */

const URL  = 'https://yyvzqnjumnpotawnrvfw.supabase.co';
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5dnpxbmp1bW5wb3Rhd25ydmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MDkyOTYsImV4cCI6MjEwMzI4NTI5Nn0.z3wcCWOKIIKvuEVZvbqKEdE9m5klgYZuVJumbod-4aA';

const HEADERS_JSON = {
  'apikey':        KEY,
  'Authorization': `Bearer ${KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation'
};

const HEADERS_READ = {
  'apikey':        KEY,
  'Authorization': `Bearer ${KEY}`
};

let passed = 0;
let failed = 0;

function ok(label, detail = '')  { passed++; console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); }
function fail(label, detail = '') { failed++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }

// ── Test 1: INSERT extracted_data ────────────────────────────────────────────
console.log('\n[1] INSERT extracted_data');
const insRes = await fetch(`${URL}/rest/v1/extracted_data`, {
  method:  'POST',
  headers: HEADERS_JSON,
  body: JSON.stringify({
    email:              'test@horeca.nl',
    name:               'Test Restaurant (geautomatiseerde test)',
    volume_bier:        1350,
    volume_elektra_kwh: 4800,
    volume_gas_m3:      920,
    volume_frisdrank:   280,
    vuilnis_kosten:     215.50,
    status:             'partial',
    submitted_at:       new Date().toISOString().slice(0, 10),
    notes:              'Automatische integratietest — mag worden verwijderd'
  })
});
const insData = await insRes.json();

let recordId = null;
if (!insRes.ok) {
  fail('INSERT extracted_data', insData.message);
  console.error('     HTTP', insRes.status, JSON.stringify(insData));
  console.error('\n  Mogelijke oorzaak: RLS policy of GRANT ontbreekt.');
  console.error('  Voer dit uit in de Supabase SQL editor:\n');
  console.error(`    ALTER TABLE public.extracted_data ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow public insert extracted_data" ON public.extracted_data;
    CREATE POLICY "Allow public insert extracted_data"
      ON public.extracted_data FOR INSERT TO anon, authenticated WITH CHECK (true);
    GRANT USAGE ON SCHEMA public TO anon;
    GRANT INSERT ON TABLE public.extracted_data TO anon;
    NOTIFY pgrst, 'reload schema';`);
} else {
  recordId = Array.isArray(insData) ? insData[0]?.id : insData?.id;
  ok('INSERT extracted_data', `id: ${recordId}`);
}

// ── Test 2: INSERT uploads ───────────────────────────────────────────────────
console.log('\n[2] INSERT uploads');
const uplRes = await fetch(`${URL}/rest/v1/uploads`, {
  method:  'POST',
  headers: HEADERS_JSON,
  body: JSON.stringify({
    email:     'test@horeca.nl',
    name:      'Test Restaurant (geautomatiseerde test)',
    file_name: 'test.pdf',
    file_path: 'test_horeca.nl/test.pdf'
  })
});
const uplData = await uplRes.json();
let uploadId = null;
if (!uplRes.ok) {
  fail('INSERT uploads', uplData.message);
  console.error('     HTTP', uplRes.status, JSON.stringify(uplData));
  console.error('\n  Mogelijke oorzaak: RLS policy of GRANT ontbreekt.');
  console.error('  Voer dit uit in de Supabase SQL editor:\n');
  console.error(`    DROP POLICY IF EXISTS "Allow public insert" ON public.uploads;
    CREATE POLICY "Allow public insert"
      ON public.uploads FOR INSERT TO anon, authenticated WITH CHECK (true);
    GRANT INSERT ON TABLE public.uploads TO anon;
    NOTIFY pgrst, 'reload schema';`);
} else {
  uploadId = Array.isArray(uplData) ? uplData[0]?.id : uplData?.id;
  ok('INSERT uploads', `id: ${uploadId}`);
}

// ── Test 3: Edge Function extract-pdf ────────────────────────────────────────
console.log('\n[3] Edge Function extract-pdf');
const aiRes = await fetch(`${URL}/functions/v1/extract-pdf`, {
  method:  'POST',
  headers: HEADERS_JSON,
  body:    JSON.stringify({ file_path: 'test@horeca.nl/bestaat_niet.pdf', record_id: recordId || '00000000-0000-0000-0000-000000000000' })
});
const aiData = await aiRes.json();
// "Object not found" = functie draait correct, bestand bestaat alleen niet
if (aiData?.error === 'Object not found' || aiRes.ok) {
  ok('Edge Function bereikbaar', `response: ${JSON.stringify(aiData)}`);
} else if (aiData?.error === 'file_path en record_id zijn verplicht') {
  fail('Edge Function', 'verwacht record_id maar kreeg validatiefout');
} else {
  fail('Edge Function', JSON.stringify(aiData));
}

// ── Test 4: SELECT teruglezen ────────────────────────────────────────────────
if (recordId) {
  console.log('\n[4] SELECT extracted_data');
  const readRes = await fetch(
    `${URL}/rest/v1/extracted_data?id=eq.${recordId}&select=id,email,volume_bier,status`,
    { headers: HEADERS_READ }
  );
  const readData = await readRes.json();
  if (readRes.ok && Array.isArray(readData) && readData.length) {
    ok('SELECT extracted_data', `volume_bier: ${readData[0].volume_bier}, status: ${readData[0].status}`);
  } else {
    fail('SELECT extracted_data', JSON.stringify(readData));
  }
}

// ── Test 5: opruimen ─────────────────────────────────────────────────────────
console.log('\n[5] Opruimen testrijen');
if (recordId) {
  const d1 = await fetch(`${URL}/rest/v1/extracted_data?id=eq.${recordId}`, {
    method: 'DELETE', headers: HEADERS_READ
  });
  d1.ok ? ok('DELETE extracted_data testrij') : fail('DELETE extracted_data', d1.status);
}
if (uploadId) {
  const d2 = await fetch(`${URL}/rest/v1/uploads?id=eq.${uploadId}`, {
    method: 'DELETE', headers: HEADERS_READ
  });
  d2.ok ? ok('DELETE uploads testrij') : fail('DELETE uploads', d2.status);
}

// ── Samenvatting ─────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`Resultaat: ${passed} geslaagd, ${failed} mislukt`);
if (failed > 0) process.exit(1);
