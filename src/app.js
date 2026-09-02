
/* =========================================================
   Supabase
   ========================================================= */
const SUPABASE_URL = 'https://yyvzqnjumnpotawnrvfw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_QDvjBPDGIgrQNcSzEw2FZg_Yj6hfIgY';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* =========================================================
   Auth state
   ========================================================= */
let CURRENT_USER = null;

sb.auth.onAuthStateChange((event, session) => {
  CURRENT_USER = session?.user ?? null;
  AuthUI.updateTopbar();
  if (event === 'SIGNED_IN') {
    AuthUI.closeLogin();
    Dashboard.open();
  } else {
    const dashVisible = document.getElementById('screen-dashboard').classList.contains('active');
    if (dashVisible) {
      Dashboard.renderDocuments();
      Dashboard.renderOverzicht();
      Dashboard.renderProfiel();
      Dashboard.renderBesparingen();
      Dashboard.renderContracten();
    }
  }
});

// Restore session on page load — re-render dashboard if it's already open
sb.auth.getSession().then(({ data: { session } }) => {
  CURRENT_USER = session?.user ?? null;
  AuthUI.updateTopbar();
  const dashVisible = document.getElementById('screen-dashboard').classList.contains('active');
  if (dashVisible) {
    Dashboard.renderDocuments();
    Dashboard.renderOverzicht();
    Dashboard.renderProfiel();
  }
});

/* =========================================================
   AuthUI
   ========================================================= */
const AuthUI = {
  openLogin() {
    this.resetLoginForm();
    document.getElementById('loginModal').classList.add('active');
  },
  closeLogin() {
    document.getElementById('loginModal').classList.remove('active');
  },
  resetLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('loginSent').style.display = 'none';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('loginEmail').value = '';
  },
  async sendMagicLink() {
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const errEl = document.getElementById('loginError');
    if (!email || !email.includes('@')) {
      errEl.textContent = 'Vul een geldig e-mailadres in.';
      errEl.style.display = 'block';
      return;
    }
    errEl.style.display = 'none';
    const btn = document.querySelector('#loginForm .btn-primary');
    btn.disabled = true;
    btn.textContent = 'Versturen…';
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: 'https://paulvelthuis93.github.io/horeca-united/' }
    });
    btn.disabled = false;
    btn.textContent = 'Stuur inloglink';
    if (error) {
      errEl.textContent = 'Er ging iets mis: ' + error.message;
      errEl.style.display = 'block';
      return;
    }
    document.getElementById('loginSentEmail').textContent = email;
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('loginSent').style.display = 'block';
  },
  async logout() {
    await sb.auth.signOut();
    CURRENT_USER = null;
    this.updateTopbar();
    const dashVisible = document.getElementById('screen-dashboard').classList.contains('active');
    if (dashVisible) Dashboard.renderDocuments();
  },
  updateTopbar() {
    const el = document.getElementById('topbarAuth');
    if (CURRENT_USER) {
      const email = CURRENT_USER.email;
      el.innerHTML = `
        <span style="font-size:13px;color:var(--muted)">${email}</span>
        <button class="btn btn-ghost btn-sm" onclick="AuthUI.logout()">Uitloggen</button>`;
    } else {
      el.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="AuthUI.openLogin()">Inloggen</button>`;
    }
  }
};

// Close login modal on backdrop click
document.getElementById('loginModal').addEventListener('click', e => {
  if (e.target.id === 'loginModal') AuthUI.closeLogin();
});

function parseNum(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const val = el.value.trim().replace(',', '.');
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

async function uploadToSupabase(file, name, email, subgroup) {
  const filePath = `${email}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await sb.storage
    .from('client-uploads')
    .upload(filePath, file, { cacheControl: '3600', upsert: false });
  if (uploadError) throw uploadError;

  const { error: dbError } = await sb.from('uploads').insert({
    email, name: name || null, file_name: file.name, file_path: filePath,
    subgroup: subgroup || null
  });
  if (dbError) throw dbError;

  return filePath;
}

// ========== Excel parsing met SheetJS ==========
async function parseExcel(file) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });

  let allText = '';
  const allCells = [];

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    rows.forEach(row => {
      row.forEach(cell => {
        if (cell !== null && cell !== undefined && cell !== '') {
          allText += ' ' + String(cell).toLowerCase();
          allCells.push(String(cell));
        }
      });
    });
  });

  function extractNumber(str) {
    if (!str) return null;
    const cleaned = String(str).replace(/[^0-9.,]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  function findValue(keywords, unitHints = []) {
    for (let i = 0; i < allCells.length; i++) {
      const cellLower = allCells[i].toLowerCase();
      if (keywords.some(k => cellLower.includes(k))) {
        // Alleen vooruit zoeken (niet terug) om verkeerde naburige waarden te vermijden
        for (let j = i + 1; j <= Math.min(allCells.length - 1, i + 3); j++) {
          const num = extractNumber(allCells[j]);
          if (num !== null) return num;
        }
      }
    }
    for (const hint of unitHints) {
      const regex = new RegExp(`([\\d.,]+)\\s*${hint}`, 'i');
      const match = allText.match(regex);
      if (match) return extractNumber(match[1]);
    }
    return null;
  }

  const found = {
    volume_bier:        findValue(['bier', 'pils', 'hectoliter', 'hl bier'], ['liter', 'l', 'hl']),
    volume_elektra_kwh: findValue(['elektra', 'elektriciteit', 'stroom', 'kwh'], ['kwh']),
    volume_gas_m3:      findValue(['gas', 'aardgas', 'm3 gas'], ['m3', 'm³']),
    volume_frisdrank:   findValue(['frisdrank', 'fris', 'soft drink', 'cola'], ['liter', 'l']),
    vuilnis_kosten:     findValue(['vuilnis', 'afval', 'restafval', 'container', 'afvalstoffen'], ['euro', '€']),
    vuilnis_type_container: null,
    verzekering_dekking: null
  };

  const missing = Object.entries(found)
    .filter(([key, val]) => val === null && key !== 'verzekering_dekking' && key !== 'vuilnis_type_container')
    .map(([key]) => key);

  return { found, missing, raw_cells_sample: allCells.slice(0, 50), sheets: workbook.SheetNames };
}

function fillFormFromExtraction(extraction) {
  if (!extraction || !extraction.found) return;
  const f = extraction.found;
  const map = {
    volume_bier: 'u_bier', volume_elektra_kwh: 'u_elektra',
    volume_gas_m3: 'u_gas', volume_frisdrank: 'u_frisdrank',
    vuilnis_kosten: 'u_vuilnis_kosten'
  };
  Object.entries(map).forEach(([key, elId]) => {
    if (f[key] !== null && f[key] !== undefined) {
      const el = document.getElementById(elId);
      if (el) el.value = f[key];
    }
  });
}

async function saveExtractedData(email, name, filePaths, excelExtraction) {
  const today = new Date().toISOString().slice(0, 10);
  let notes = '';
  if (excelExtraction) {
    if (excelExtraction.error) notes = 'Excel fout: ' + excelExtraction.error;
    else if (excelExtraction.missing && excelExtraction.missing.length)
      notes = 'Niet automatisch gevonden: ' + excelExtraction.missing.join(', ');
    else notes = 'Excel volledig uitgelezen';
  } else if (!filePaths.length) {
    notes = 'Geen bestanden geüpload';
  } else {
    notes = 'Geen Excel-bestand of parsing overgeslagen';
  }

  const { data: inserted, error } = await sb.from('extracted_data').insert({
    email,
    name: name || null,
    volume_bier:            parseNum('u_bier'),
    volume_elektra_kwh:     parseNum('u_elektra'),
    volume_gas_m3:          parseNum('u_gas'),
    volume_frisdrank:       parseNum('u_frisdrank'),
    vuilnis_kosten:         parseNum('u_vuilnis_kosten'),
    vuilnis_type_container: (document.getElementById('u_vuilnis_container')?.value.trim() || null),
    verzekering_dekking:    (document.getElementById('u_verzekering')?.value.trim() || null),
    raw_data: { file_paths: filePaths, excel_extraction: excelExtraction || null },
    status: excelExtraction && excelExtraction.missing?.length === 0 ? 'processed' : 'partial',
    submitted_at: today,
    notes
  }).select('id').single();
  if (error) throw error;
  return inserted?.id || null;
}

// ========== Excel → transactions parser ==========
const FALLBACK_CATEGORY_ID = '724b56db-25b6-4c93-8d04-08c83247480f'; // Inkoop (overig)

function findCol(header, names) {
  return header.findIndex(c => names.some(n => String(c).toLowerCase().includes(n)));
}

function matchCategory(text, keywords) {
  if (!text) return FALLBACK_CATEGORY_ID;
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw.keyword.toLowerCase())) return kw.category_id;
  }
  return FALLBACK_CATEGORY_ID;
}

async function parseAndSaveExcel(file, email, name) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Type herkennen
  const headerText = rows.slice(0, 25).flat().join(' ').toLowerCase();
  let type = 'excel';
  if (headerText.includes('artikelnr') || headerText.includes('artikelnummer') || headerText.includes('art.nr')) {
    type = 'sligro';
  } else if (headerText.includes('hanos')) {
    type = 'hanos';
  }

  // Load keywords & supplier once — never repeated per row
  const { data: keywords } = await sb.from('category_keywords')
    .select('category_id, keyword, priority')
    .order('priority', { ascending: false });
  const { data: supplierRow } = await sb.from('suppliers')
    .select('id').ilike('name', type === 'sligro' ? 'Sligro' : type === 'hanos' ? 'Hanos' : 'Overig')
    .maybeSingle();
  const supplierId = supplierRow?.id || null;
  const kws = keywords || [];

  // Header zoeken (eerste 30 rijen)
  let headerIdx = rows.findIndex(r =>
    r.some(c => /artikel|omschrijving|bedrag|product/i.test(String(c)))
  );
  if (headerIdx === -1) headerIdx = 0;

  const header = rows[headerIdx].map(c => String(c).toLowerCase());
  const colArt    = findCol(header, ['artikel', 'art.nr', 'artnr']);
  const colProd   = findCol(header, ['omschrijving', 'product', 'benaming', 'naam']);
  const colBedrag = findCol(header, ['bedrag', 'totaal', 'prijs', '€']);
  const colAantal = findCol(header, ['aantal', 'qty', 'hoeveelheid']);

  const toInsert = [];
  const today = new Date().toISOString().slice(0, 10);

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const artikel   = colArt >= 0    ? String(row[colArt] || '').trim() : '';
    const product   = colProd >= 0   ? String(row[colProd] || '').trim() : '';
    const bedragStr = colBedrag >= 0 ? String(row[colBedrag] || '0') : '0';
    const bedrag    = parseFloat(bedragStr.replace(/[^0-9,.-]/g, '').replace(',', '.'));
    const aantal    = colAantal >= 0 ? parseFloat(String(row[colAantal] || '').replace(',', '.')) || null : null;

    if (!product && !artikel) continue;
    if (!bedrag || isNaN(bedrag)) continue;

    const categoryId = matchCategory(product || artikel, kws);
    toInsert.push({
      category_id: categoryId,
      supplier_id: supplierId,
      email,
      name: name || null,
      transaction_date: today,
      article_number: artikel || null,
      product_name: product || null,
      amount: bedrag,
      quantity: aantal,
      source: type,
      notes: categoryId === FALLBACK_CATEGORY_ID ? 'Categorie niet automatisch gevonden – later indelen' : null
    });
  }

  if (toInsert.length === 0) throw new Error('Geen bruikbare regels gevonden in dit bestand');

  const { error } = await sb.from('transactions').insert(toInsert);
  if (error) throw error;

  return { aantal: toInsert.length, type };
}

/* =========================================================
   Horeca United demo — data, state, rendering
   ========================================================= */

const SUBGROUPS = [
  {id:"bier", group:"Dranken", name:"Bier"},
  {id:"frisdrank", group:"Dranken", name:"Frisdrank"},
  {id:"foodgroothandel", group:"Food en dagelijkse inkoop", name:"Foodgroothandel"},
  {id:"vis", group:"Food en dagelijkse inkoop", name:"Vis"},
  {id:"vlees", group:"Food en dagelijkse inkoop", name:"Vlees"},
  {id:"energie", group:"Nutsvoorzieningen en vaste lasten", name:"Energie"},
  {id:"afval", group:"Nutsvoorzieningen en vaste lasten", name:"Afval"},
  {id:"internet", group:"Nutsvoorzieningen en vaste lasten", name:"Internet en telefonie"},
  {id:"muzieklicentie", group:"Nutsvoorzieningen en vaste lasten", name:"Muzieklicentie"},
  {id:"verzekeringen", group:"Financiële diensten", name:"Verzekeringen"},
  {id:"betaalverkeer", group:"Financiële diensten", name:"Betaalverkeer"},
];
const GROUP_ORDER = ["Dranken","Food en dagelijkse inkoop","Nutsvoorzieningen en vaste lasten","Financiële diensten"];
function subgroupName(id){ const s=SUBGROUPS.find(x=>x.id===id); return s?s.name:id; }

const STORAGE_KEY = "huos_demo_state_v1";

function euro(n){ return new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(Math.max(0,Math.round(n))); }

function defaultState(){
  return {
    profile: { businessType:"Restaurant", city:"", turnover:"€500.000 – €1.000.000", locations:"1", employees:"" },
    selectedSubgroups: ["energie","afval","bier","betaalverkeer","verzekeringen"],
    primary: { subgroupId:"energie", supplier:"", annualSpend:9000, contractStatus:"Actief contract", contractEnd:"", willingness:"misschien" },
    method: "upload",
    uploadFileName: "",
    uploadFileNames: [],
    authorization: { signName:"", signRole:"", kvk:"", validity:"60 dagen", consent:false },
    account: { companyName:"", contactPerson:"", email:"", phone:"" },
    consents: { privacy:false, processing:false, marketing:false, benchmark:false },
    result: null,
    completed: false
  };
}

let STATE = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  }catch(e){ return defaultState(); }
}
function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE)); }catch(e){}
}

/* ---------------- Router ---------------- */
const SCREENS = ["landing","scan","result","dashboard","admin","privacy"];
const Router = {
  go(id){
    SCREENS.forEach(s=>document.getElementById("screen-"+s).classList.remove("active"));
    document.getElementById("screen-"+id).classList.add("active");
    window.scrollTo({top:0, behavior:"smooth"});
  }
};

/* ---------------- Landing: subgroup overview ---------------- */
function renderSubgroupOverview(){
  const box = document.getElementById("subgroupOverview");
  box.innerHTML = GROUP_ORDER.map(g=>{
    const items = SUBGROUPS.filter(s=>s.group===g);
    return `<div class="panel subgroup-group"><h3>${g}</h3><ul>${items.map(i=>`<li>${i.name}</li>`).join("")}</ul></div>`;
  }).join("");
}

/* ---------------- Quick Scan ---------------- */
const QuickScan = {
  step: 1,
  start(){
    this.step = 1;
    this.renderCategoryTiles();
    this.render();
    Router.go("scan");
  },
  render(){
    document.querySelectorAll(".scan-step").forEach(el=>el.style.display="none");
    document.getElementById("scanStep"+this.step).style.display="block";
    document.getElementById("scanStepNr").textContent = this.step;
    document.getElementById("scanProgressBar").style.width = (this.step*20)+"%";
    const titles = ["Over jouw zaak","Relevante subgroepen","Eerste gratis analyse","Gegevens aanleveren","Account en privacy"];
    document.getElementById("scanStepTitle").textContent = titles[this.step-1];
    if(this.step===3) this.fillPrimarySelect();
    if(this.step===4) this.applyMethodUI();
  },
  next(){
    if(this.step===1){
      const city = document.getElementById("f_city").value.trim();
      document.getElementById("err_city").style.display = city ? "none":"block";
      if(!city){ document.getElementById("f_city").focus(); return; }
      STATE.profile = {
        businessType: document.getElementById("f_businessType").value,
        city, turnover: document.getElementById("f_turnover").value,
        locations: document.getElementById("f_locations").value,
        employees: document.getElementById("f_employees").value
      };
    }
    if(this.step===2){
      if(this.selected.size===0){ document.getElementById("err_subgroups").style.display="block"; return; }
      document.getElementById("err_subgroups").style.display="none";
      STATE.selectedSubgroups = [...this.selected];
    }
    if(this.step===3){
      STATE.primary = {
        subgroupId: document.getElementById("f_primarySubgroup").value,
        supplier: document.getElementById("f_supplier").value.trim(),
        annualSpend: Number(document.getElementById("f_annualSpend").value),
        contractStatus: document.getElementById("f_contractStatus").value,
        contractEnd: document.getElementById("f_contractEnd").value.trim(),
        willingness: this.willingness || "misschien"
      };
    }
    if(this.step===4){
      const m = this.method;
      if(!m){ document.getElementById("err_method").style.display="block"; return; }
      if(m==="request" && !document.getElementById("f_authConsent").checked){
        document.getElementById("err_method").textContent = "Bevestig de machtiging om verder te gaan.";
        document.getElementById("err_method").style.display="block"; return;
      }
      document.getElementById("err_method").style.display="none";
      STATE.method = m;
      if(m==="request"){
        STATE.authorization = {
          signName: document.getElementById("f_signName").value.trim(),
          signRole: document.getElementById("f_signRole").value.trim(),
          kvk: document.getElementById("f_kvk").value.trim(),
          validity: document.getElementById("f_validity").value,
          consent: true
        };
      }
    }
    if(this.step<5){ this.step++; this.render(); saveState(); }
  },
  prev(){ if(this.step>1){ this.step--; this.render(); } },

  selected: new Set(["energie","afval","bier","betaalverkeer","verzekeringen"]),
  renderCategoryTiles(){
    this.selected = new Set(STATE.selectedSubgroups);
    const box = document.getElementById("subgroupChoices");
    box.innerHTML = GROUP_ORDER.map(g=>{
      const items = SUBGROUPS.filter(s=>s.group===g);
      return `<div class="choice-group"><h4>${g}</h4><div class="choices">${items.map(i=>`
        <div class="tile ${this.selected.has(i.id)?'selected':''}" data-id="${i.id}" onclick="QuickScan.toggle('${i.id}')">
          <span class="box"></span>${i.name}
        </div>`).join("")}</div></div>`;
    }).join("");
  },
  toggle(id){
    if(this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
    const tile = document.querySelector(`#subgroupChoices .tile[data-id="${id}"]`);
    tile.classList.toggle("selected");
  },
  fillPrimarySelect(){
    const sel = document.getElementById("f_primarySubgroup");
    const current = STATE.primary.subgroupId;
    sel.innerHTML = [...this.selected].map(id=>`<option value="${id}" ${id===current?'selected':''}>${subgroupName(id)}</option>`).join("");
    document.getElementById("f_supplier").value = STATE.primary.supplier||"";
    document.getElementById("f_contractEnd").value = STATE.primary.contractEnd||"";
    if(STATE.primary.annualSpend) document.getElementById("f_annualSpend").value = STATE.primary.annualSpend;
    document.getElementById("f_contractStatus").value = STATE.primary.contractStatus||"Actief contract";
    this.willingness = STATE.primary.willingness || "misschien";
    document.querySelectorAll("#switchWillingness .tile").forEach(t=>{
      t.classList.toggle("selected", t.dataset.val===this.willingness);
      t.onclick = ()=>{ this.willingness = t.dataset.val; document.querySelectorAll("#switchWillingness .tile").forEach(x=>x.classList.remove("selected")); t.classList.add("selected"); };
    });
  },
  method: null,
  selectMethod(m){
    this.method = m;
    document.querySelectorAll(".method-card").forEach(c=>c.classList.toggle("selected", c.dataset.method===m));
    this.applyMethodUI();
  },
  applyMethodUI(){
    ["upload","request","later"].forEach(m=>{
      document.getElementById("method"+m.charAt(0).toUpperCase()+m.slice(1)).style.display = (this.method===m)?"block":"none";
    });
    if(this.method){
      document.querySelectorAll(".method-card").forEach(c=>c.classList.toggle("selected", c.dataset.method===this.method));
    }
  },
  _excelExtraction: null,
  async handleFiles(fileList){
    const files = Array.from(fileList || []).filter(f => f && f.size > 0);
    if(!files.length) return;
    const box = document.getElementById("uploadBox");
    box.classList.add("filled");
    document.getElementById("uploadBoxText").innerHTML = `Sleep bestanden hierheen of klik om toe te voegen<br><span class="hint">Factuur, contract, jaarafrekening of offerte (Excel, PDF, Word)</span>`;
    const listEl = document.getElementById("uploadFileList");

    const email = (document.getElementById("f_email").value.trim() || "onbekend@demo.nl").toLowerCase();
    const name = document.getElementById("f_companyName").value.trim() || "Onbekend bedrijf";
    const uploadedPaths = [];
    this._excelExtraction = null;

    // Excel automatisch uitlezen vóór upload
    const excelFile = files.find(f => /\.xlsx?$/i.test(f.name));
    if(excelFile) {
      const statusRow = document.createElement("div");
      statusRow.id = "excelStatusRow";
      statusRow.innerHTML = `<span class="hint">Excel wordt uitgelezen…</span>`;
      listEl.appendChild(statusRow);
      try {
        this._excelExtraction = await parseExcel(excelFile);
        fillFormFromExtraction(this._excelExtraction);
        const missing = this._excelExtraction.missing;
        statusRow.innerHTML = missing.length
          ? `<span class="hint" style="color:var(--warn-ink)">Excel uitgelezen — controleer: ${missing.join(', ')}</span>`
          : `<span class="hint" style="color:var(--positive-ink)">Excel volledig uitgelezen. Controleer de ingevulde waarden.</span>`;
      } catch(err) {
        this._excelExtraction = { error: err.message, found: {}, missing: ['alles'] };
        statusRow.innerHTML = `<span class="hint" style="color:var(--warn-ink)">Excel kon niet worden uitgelezen — vul handmatig in.</span>`;
      }
    }

    for(const file of files) {
      const row = document.createElement("div");
      row.innerHTML = `<span class="file-name">⏳ ${file.name}</span> <span class="hint">(${(file.size/1024).toFixed(1)} KB) — bezig…</span>`;
      listEl.appendChild(row);
      try {
        const path = await uploadToSupabase(file, name, email, STATE.primary.subgroupId || null);
        uploadedPaths.push(path);
        row.innerHTML = `<span class="file-name" style="color:var(--positive-ink)">✓ ${file.name}</span> <span class="hint">(${(file.size/1024).toFixed(1)} KB)</span>`;
        if(!STATE.uploadFileName) STATE.uploadFileName = file.name;
      } catch(err) {
        row.innerHTML = `<span class="file-name" style="color:var(--danger-ink)">✗ ${file.name}</span> <span class="hint">Upload mislukt: ${err.message}</span>`;
      }
    }

    const statusRow = document.getElementById("excelStatusRow") || (() => {
      const r = document.createElement("div"); listEl.appendChild(r); return r;
    })();

    try {
      const recordId = await saveExtractedData(email, name, uploadedPaths, this._excelExtraction);

      // PDF AI-extractie starten als er een PDF is geüpload
      const pdfPath = uploadedPaths.find(p => /\.pdf$/i.test(p));
      if (pdfPath && recordId) {
        statusRow.innerHTML = `<span class="hint">PDF wordt geanalyseerd door AI…</span>`;
        const { error: aiError } = await sb.functions.invoke('extract-pdf', {
          body: { file_path: pdfPath, record_id: recordId }
        });
        if (aiError) {
          statusRow.innerHTML = `<span class="hint" style="color:var(--warn-ink)">Opgeslagen, maar AI-analyse is mislukt. Controleer de waarden handmatig.</span>`;
        } else {
          statusRow.innerHTML = `<span class="hint" style="color:var(--positive-ink)">Opgeslagen én door AI geanalyseerd.</span>`;
        }
      } else {
        statusRow.innerHTML = `<span class="hint" style="color:var(--positive-ink)">Gegevens opgeslagen.</span>`;
      }
    } catch(err) {
      statusRow.innerHTML = `<span class="hint" style="color:var(--danger-ink)">Opslaan mislukt: ${err.message}</span>`;
    }

    STATE.uploadFileNames = Array.from(listEl.querySelectorAll(".file-name[style*='positive']")).map(el => el.textContent.replace(/^✓ /,""));

    // TODO: bevestigingsemail via Resend (RESEND_API_KEY in Supabase env vars)
    // sb.functions.invoke('send-upload-confirmation', { body: { email, name, fileNames: STATE.uploadFileNames, fileCount: STATE.uploadFileNames.length } })
  },
  complete(){
    const company = document.getElementById("f_companyName").value.trim();
    const email = document.getElementById("f_email").value.trim();
    if(!company || !email){ document.getElementById("err_account").style.display="block"; return; }
    if(!document.getElementById("f_consentPrivacy").checked || !document.getElementById("f_consentProcessing").checked){
      document.getElementById("err_account").textContent = "Bevestig de privacyverklaring en verwerkingstoestemming om verder te gaan.";
      document.getElementById("err_account").style.display="block"; return;
    }
    document.getElementById("err_account").style.display="none";
    STATE.account = {
      companyName: company,
      contactPerson: document.getElementById("f_contactPerson").value.trim(),
      email, phone: document.getElementById("f_phone").value.trim()
    };
    STATE.consents = {
      privacy: true, processing: true,
      marketing: document.getElementById("f_consentMarketing").checked,
      benchmark: document.getElementById("f_consentBenchmark").checked
    };
    STATE.completed = true;
    Engine.computeResult();
    saveState();
    Engine.renderResult();
    // Save authorization to Supabase if method is 'request'
    if (STATE.method === 'request' && STATE.authorization.consent) {
      QuickScan._saveAuthorization(email, company).catch(()=>{});
    }
    Router.go("result");
  },

  async _saveAuthorization(email, company) {
    const auth = STATE.authorization;
    const sourceId = STATE.primary.subgroupId;
    const now = new Date();
    const seq = String(Math.floor(Math.random()*99999)).padStart(5,'0');
    const authId = `AUTH-${sourceId.toUpperCase()}-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${seq}`;
    const validityDays = parseInt(STATE.authorization.validity) || 60;

    const { data: source } = await sb.from('data_sources').select('permissions,purpose').eq('id', sourceId).maybeSingle();

    await sb.from('authorizations').insert({
      id: authId,
      user_id: CURRENT_USER?.id || null,
      email,
      company_name: company,
      kvk_number: auth.kvk || null,
      signatory_name: auth.signName || null,
      signatory_role: auth.signRole || null,
      data_source_id: sourceId,
      permissions: source?.permissions || [],
      purpose: source?.purpose || null,
      status: 'active',
      document_version: 'v1.0',
      validity_days: validityDays
    });

    await sb.from('authorization_events').insert({
      authorization_id: authId,
      email,
      event_type: 'GRANTED',
      actor: 'user',
      new_values: { company_name: company, signatory_name: auth.signName, data_source_id: sourceId },
      note: `Machtiging verleend via Quick Scan voor ${sourceId}`
    });
  }
};

/* ---------------- Calculation engine ---------------- */
const Engine = {
  computeResult(){
    const spend = STATE.primary.annualSpend || 6000;
    const n = STATE.selectedSubgroups.length;
    let low = spend*0.04 + n*180;
    let high = spend*0.10 + n*420;
    const locBoost = {"1":1, "2":1.15, "3 – 5":1.3, "6+":1.5}[STATE.profile.locations] || 1;
    low *= locBoost; high *= locBoost;
    if(STATE.primary.contractStatus === "Onbekend" || STATE.primary.contractStatus === "Geen vast contract"){
      high *= 1.15;
    }
    STATE.result = {
      low: Math.round(low), high: Math.round(high),
      profilePct: Engine.profileCompletion()
    };
  },
  profileCompletion(){
    let score = 0;
    const total = 6;
    if(STATE.profile.city) score++;
    if(STATE.selectedSubgroups.length>0) score++;
    if(STATE.primary.supplier) score++;
    if(STATE.method) score++;
    if(STATE.account.companyName) score++;
    if(STATE.selectedSubgroups.length>=3) score++;
    return Math.round((score/total)*100);
  },
  statusLabel(){
    if(STATE.method==="upload") return "Document ontvangen";
    if(STATE.method==="request") return "Gegevensopvraag klaar";
    return "Later aanleveren";
  },
  recommendedNext(){
    return STATE.selectedSubgroups.filter(id=>id!==STATE.primary.subgroupId).slice(0,3).map(subgroupName);
  },
  renderResult(){
    if(!STATE.result) this.computeResult();
    document.getElementById("resultRange").textContent = `${euro(STATE.result.low)} – ${euro(STATE.result.high)}`;
    document.getElementById("resultPrimary").textContent = subgroupName(STATE.primary.subgroupId);
    document.getElementById("resultStatus").textContent = this.statusLabel();
    document.getElementById("resultCount").textContent = STATE.selectedSubgroups.length;
    document.getElementById("resultProfilePct").textContent = STATE.result.profilePct + "%";
    const recs = this.recommendedNext();
    document.getElementById("resultRecommendations").textContent = recs.length
      ? "Op basis van je bedrijfsprofiel zien we mogelijke kansen bij " + recs.join(", ") + "."
      : "Open in je dashboard extra subgroepen om meer aanbevelingen te ontvangen.";
    document.getElementById("resultSummary").innerHTML = `Je eerste analyse voor <strong>${subgroupName(STATE.primary.subgroupId)}</strong> staat klaar. Horeca United gebruikt deze uitkomst om de meest kansrijke volgende subgroepen te adviseren.`;
  }
};

/* ---------------- Subgroup status simulation (deterministic per company) ---------------- */
const STATUS_LIST = ["Niet van toepassing","Nog niet ingevuld","Basisgegevens ingevuld","Documenten ontbreken","Klaar voor analyse","Analyse in behandeling","Besparingskans gevonden","Collectief voorstel beschikbaar","Voorstel geaccepteerd","Overstap in uitvoering","Besparing gerealiseerd","Huidige afspraak is marktconform"];

function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) >>> 0; } return h; }

function buildSubgroupRows(){
  return STATE.selectedSubgroups.map((id,i)=>{
    const isPrimary = id === STATE.primary.subgroupId;
    let status, badge;
    if(isPrimary){
      status = Engine.statusLabel(); badge="b-green";
    } else {
      const h = hashStr(id+STATE.profile.city) % 4;
      const opts = [
        ["Nog niet ingevuld","b-grey"],["Basisgegevens ingevuld","b-yellow"],
        ["Klaar voor analyse","b-yellow"],["Besparingskans gevonden","b-green"]
      ];
      [status, badge] = opts[h];
    }
    const kans = isPrimary ? "Hoog" : (hashStr(id) % 3 === 0 ? "Mogelijk" : "Onbekend");
    const cost = isPrimary ? STATE.primary.annualSpend : Math.round(1500 + (hashStr(id)%40)*350);
    const supplier = isPrimary ? (STATE.primary.supplier || "Onbekende leverancier") : "—";
    const contractEnd = isPrimary ? (STATE.primary.contractEnd || "Onbekend") : "Onbekend";
    const missing = isPrimary && STATE.method==="later" ? "Factuur of contract" : (status==="Documenten ontbreken" ? "Factuur" : "—");
    return {id, name: subgroupName(id), status, badge, kans, cost, supplier, contractEnd, missing, isPrimary};
  });
}

/* ---------------- Klantdashboard ---------------- */
const Dashboard = {
  async open(){
    if(!STATE.completed){
      STATE.account.companyName = STATE.account.companyName || "Voorbeeld Horecazaak";
      Engine.computeResult();
      STATE.completed = true;
      saveState();
    }
    // Pre-fill upload email if logged in
    if (CURRENT_USER) {
      const emailEl = document.getElementById('docUploadEmail');
      if (emailEl && !emailEl.value) emailEl.value = CURRENT_USER.email;
      // Load profile from Supabase before render so company name is correct immediately
      const { data } = await sb.from('profiles')
        .select('company_name,contact_person,phone,business_type,city,turnover,locations')
        .eq('email', CURRENT_USER.email).maybeSingle();
      if (data) {
        if (data.company_name)   STATE.account.companyName   = data.company_name;
        if (data.contact_person) STATE.account.contactPerson = data.contact_person;
        if (data.phone)          STATE.account.phone         = data.phone;
        if (data.business_type)  STATE.profile.businessType  = data.business_type;
        if (data.city)           STATE.profile.city          = data.city;
        if (data.turnover)       STATE.profile.turnover      = data.turnover;
        if (data.locations)      STATE.profile.locations     = data.locations;
      }
    }
    this.render();
    Router.go("dashboard");
  },
  render(){
    const rows = buildSubgroupRows();
    document.getElementById("dashCompanyName").textContent =
      CURRENT_USER ? (STATE.account.companyName || CURRENT_USER.email) : (STATE.account.companyName || "Voorbeeld Horecazaak");
    const pct = STATE.result ? STATE.result.profilePct : Engine.profileCompletion();
    document.getElementById("dashProfilePct2").textContent = pct + "% voltooid";
    document.getElementById("dashProfileBar").style.width = pct + "%";
    // demo summary shown when no real transactions
    document.getElementById("dashRealSummary").style.display = "none";
    document.getElementById("dashDemoSummary").style.display = "block";
    const potDemo = document.getElementById("dashPotentialDemo");
    const pctDemo = document.getElementById("dashProfilePctDemo");
    if (potDemo) potDemo.textContent = STATE.result ? `${euro(STATE.result.low)} – ${euro(STATE.result.high)}` : "—";
    if (pctDemo) pctDemo.textContent = pct + "%";

    // Demo banner
    document.getElementById("dashDemoBanner").style.display = CURRENT_USER ? "none" : "block";

    const shortBody = rows.slice(0,5).map(r=>`
      <tr><td><strong>${r.name}</strong></td><td><span class="badge ${r.badge}">${r.status}</span></td>
      <td>${r.kans}</td><td><button class="btn btn-ghost btn-sm" onclick="Dashboard.showTab('subgroepen')">Bekijk</button></td></tr>`).join("");
    document.getElementById("dashSubgroupTableShort").innerHTML = shortBody || `<tr><td colspan="4" class="empty-state">Nog geen subgroepen geselecteerd.</td></tr>`;

    const fullBody = rows.map(r=>`
      <tr><td><strong>${r.name}</strong></td><td>${r.supplier}</td><td>${euro(r.cost)}</td>
      <td><span class="badge ${r.badge}">${r.status}</span></td><td>${r.kans}</td><td>${r.contractEnd}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="alert('In deze demo start dit de analyse-flow voor ${r.name}.')">${r.status==="Nog niet ingevuld"?"Start analyse":"Bekijk"}</button></td></tr>`).join("");
    document.getElementById("dashSubgroupTableFull").innerHTML = fullBody || `<tr><td colspan="7" class="empty-state">Nog geen subgroepen geselecteerd.</td></tr>`;

    const next = STATE.selectedSubgroups.filter(id=>id!==STATE.primary.subgroupId)[0];
    document.getElementById("dashNextAction").textContent = next
      ? `Upload je ${subgroupName(next).toLowerCase()}-document om je volgende analyse te starten. Je profiel is voor ${pct}% voltooid.`
      : `Open extra subgroepen om je volledige benchmark te ontgrendelen. Je profiel is voor ${pct}% voltooid.`;

    // contracts tab renders lazily via showTab('contracten')

    // savings
    document.getElementById("dashSavingsTable").innerHTML = rows.map(r=>{
      const est = r.isPrimary && STATE.result ? `${euro(STATE.result.low)} – ${euro(STATE.result.high)}` : (r.badge==="b-green" ? euro(r.cost*0.06)+" – "+euro(r.cost*0.12) : "Nog te bepalen");
      return `<tr><td>${r.name}</td><td>${est}</td><td><span class="badge ${r.badge}">${r.status}</span></td></tr>`;
    }).join("");

    // authorizations
    renderAuthTable();

    // profile
    const p = STATE.profile;
    document.getElementById("dashProfileKv").innerHTML = `
      <div><span>Bedrijfsnaam</span>${STATE.account.companyName||"—"}</div>
      <div><span>Contactpersoon</span>${STATE.account.contactPerson||"—"}</div>
      <div><span>E-mail</span>${CURRENT_USER ? CURRENT_USER.email : (STATE.account.email||"—")}</div>
      <div><span>Telefoon</span>${STATE.account.phone||"—"}</div>
      <div><span>Type horecazaak</span>${p.businessType||"—"}</div>
      <div><span>Vestigingsplaats</span>${p.city||"—"}</div>
      <div><span>Jaaromzet</span>${p.turnover||"—"}</div>
      <div><span>Aantal vestigingen</span>${p.locations||"—"}</div>
    `;

    // async tabs that update independently
    this.renderDocuments();
    this.renderProfiel();
    this.renderOverzicht();
  },

  async renderDocuments(){
    const el = document.getElementById("dashDocuments");
    const loginNote = document.getElementById("docsLoginNote");
    const docsCountEl = document.getElementById("dashDocsCount");

    if (CURRENT_USER) {
      loginNote.style.display = "none";
      el.innerHTML = `<div class="empty-state" style="padding:20px">Documenten laden…</div>`;
      const { data: uploads, error } = await sb.from('uploads')
        .select('id, file_name, subgroup, uploaded_at, file_path')
        .eq('email', CURRENT_USER.email)
        .order('uploaded_at', { ascending: false });
      if (error) {
        el.innerHTML = `<div class="empty-state" style="color:var(--danger-ink)">Fout bij laden: ${error.message}</div>`;
        return;
      }
      if (docsCountEl) docsCountEl.textContent = uploads.length;
      if (!uploads.length) {
        el.innerHTML = `<div class="empty-state">Nog geen documenten geüpload. <a onclick="Dashboard.showTab('documenten')" style="cursor:pointer;text-decoration:underline;color:var(--brand2)">Upload je eerste document</a>.</div>`;
        return;
      }
      el.innerHTML = `<table class="table">
        <thead><tr><th>Bestand</th><th>Subgroep</th><th>Geüpload op</th><th></th></tr></thead>
        <tbody>${uploads.map(u => {
          const sg = u.subgroup ? subgroupName(u.subgroup) : '—';
          const date = new Date(u.uploaded_at).toLocaleDateString('nl-NL');
          return `<tr>
            <td><span class="file-name">${u.file_name}</span></td>
            <td>${sg}</td>
            <td style="color:var(--muted);font-size:12.5px">${date}</td>
            <td><button class="btn btn-ghost btn-sm" style="color:var(--danger-ink);border-color:var(--danger-ink)" onclick="Dashboard.deleteUpload('${u.id}','${u.file_path.replace(/'/g,"\\'")}')">Verwijderen</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    } else {
      // Not logged in: show demo names from localStorage + login nudge
      loginNote.style.display = "inline";
      const uploadedNames = STATE.uploadFileNames?.length ? STATE.uploadFileNames : (STATE.uploadFileName ? [STATE.uploadFileName] : []);
      if (docsCountEl) docsCountEl.textContent = uploadedNames.length || "—";
      if (!uploadedNames.length) {
        el.innerHTML = `<div class="empty-state">Nog geen documenten geüpload.</div>`;
        return;
      }
      el.innerHTML = `<table class="table">
        <thead><tr><th>Bestand</th><th>Subgroep</th><th>Status</th></tr></thead>
        <tbody>${uploadedNames.map(n => `<tr>
          <td>${n}</td>
          <td>${subgroupName(STATE.primary.subgroupId)}</td>
          <td><span class="badge b-green">Ontvangen</span></td>
        </tr>`).join('')}</tbody>
      </table>`;
    }
  },

  async deleteUpload(uploadId, filePath){
    if (!CURRENT_USER) return;
    if (!confirm('Weet je zeker dat je dit document wilt verwijderen?')) return;
    // Remove from storage
    await sb.storage.from('client-uploads').remove([filePath]);
    // Remove from database
    const { error } = await sb.from('uploads').delete().eq('id', uploadId);
    if (error) { alert('Verwijderen mislukt: ' + error.message); return; }
    this.renderDocuments();
  },
  showTab(tab){
    document.querySelectorAll(".dash-tab").forEach(el=>el.style.display="none");
    document.getElementById("dashTab-"+tab).style.display="block";
    document.querySelectorAll(".side-nav a[data-dash]").forEach(a=>a.classList.toggle("active", a.dataset.dash===tab));
    if (tab === 'documenten' && CURRENT_USER) {
      const emailEl = document.getElementById('docUploadEmail');
      if (emailEl && !emailEl.value) emailEl.value = CURRENT_USER.email;
    }
    if (tab === 'machtigingen') AuthModule.loadAndRender();
    if (tab === 'besparingen') this.renderBesparingen();
    if (tab === 'contracten') this.renderContracten();
    if (tab === 'profiel') this.renderProfiel();
    if (tab === 'overzicht') this.renderOverzicht();
  },
  async renderBesparingen(){
    const el = document.getElementById('dashSpendChart');
    if (!el) return;

    const DEMO_SPEND = [
      {category:'Inkoop (overig)', total: 4820},
      {category:'Vlees', total: 3150},
      {category:'Dranken', total: 2640},
      {category:'Energie', total: 1980},
      {category:'Schoonmaak', total: 870},
    ];

    let rows = [];
    let unitRows = []; // rows with quantity+unit for price-per-unit card
    if (CURRENT_USER) {
      const { data, error } = await sb
        .from('transactions')
        .select('amount, quantity, unit, categories(name)')
        .eq('email', CURRENT_USER.email);
      if (!error && data && data.length) {
        const agg = {}, unitAgg = {};
        data.forEach(r => {
          const cat = r.categories?.name || 'Overig';
          agg[cat] = (agg[cat] || 0) + parseFloat(r.amount || 0);
          if (r.quantity && r.unit) {
            if (!unitAgg[cat]) unitAgg[cat] = { totalAmount: 0, totalQty: 0, unit: r.unit };
            unitAgg[cat].totalAmount += parseFloat(r.amount || 0);
            unitAgg[cat].totalQty   += parseFloat(r.quantity || 0);
          }
        });
        rows = Object.entries(agg)
          .map(([category, total]) => ({category, total}))
          .sort((a,b) => b.total - a.total);
        unitRows = Object.entries(unitAgg).map(([category, v]) => ({
          category,
          unitPrice: v.totalQty > 0 ? v.totalAmount / v.totalQty : null,
          unit: v.unit,
          totalQty: v.totalQty,
        }));
      }
    }

    const isDemo = rows.length === 0;
    if (isDemo) rows = DEMO_SPEND;

    const max = rows[0]?.total || 1;
    const fmt  = v => new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v);
    const fmtU = v => new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
    const COLORS = ['#163829','#2f6b4c','#4a9b71','#7ec8a0','#b2dfc3'];

    el.innerHTML = (isDemo ? `<p style="font-size:12px;color:var(--muted);margin:0 0 12px;font-style:italic">Voorbeelddata — log in en upload facturen om jouw eigen uitgaven te zien.</p>` : '') +
      rows.map((r, i) => `
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span style="color:var(--ink)">${r.category}</span>
            <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--muted)">${fmt(r.total)}</span>
          </div>
          <div style="background:var(--line);border-radius:4px;height:20px;overflow:hidden">
            <div style="height:100%;width:${Math.round(r.total/max*100)}%;background:${COLORS[i%COLORS.length]};border-radius:4px;transition:width .4s ease"></div>
          </div>
        </div>`).join('');

    // Unit price card
    const upCard = document.getElementById('dashUnitPriceCard');
    const upList = document.getElementById('dashUnitPriceList');
    if (!upCard || !upList || !unitRows.length) { if (upCard) upCard.style.display = 'none'; return; }

    const { data: benchRows } = await sb.from('benchmark_data')
      .select('category_name, avg_unit_price, unit, unit_label')
      .not('avg_unit_price', 'is', null);
    const benchByCategory = {};
    (benchRows || []).forEach(r => { benchByCategory[r.category_name] = r; });

    const upItems = unitRows.filter(r => r.unitPrice !== null);
    if (!upItems.length) { upCard.style.display = 'none'; return; }

    upCard.style.display = 'block';
    upList.innerHTML = `<table class="table">
      <thead><tr><th>Categorie</th><th>Jouw prijs</th><th>Groepsgemiddelde</th><th>Verschil</th><th>Volume</th></tr></thead>
      <tbody>${upItems.map(r => {
        const bench = benchByCategory[r.category];
        const avgPrice = bench?.avg_unit_price;
        const unitLabel = bench?.unit_label || `per ${r.unit}`;
        const diff = avgPrice ? ((r.unitPrice - avgPrice) / avgPrice * 100) : null;
        const diffHtml = diff !== null
          ? `<span style="font-weight:600;color:${diff > 0 ? 'var(--danger-ink)' : 'var(--positive-ink)'}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}%</span>`
          : `<span style="color:var(--muted)">—</span>`;
        const volFmt = new Intl.NumberFormat('nl-NL',{maximumFractionDigits:0});
        return `<tr>
          <td><strong>${r.category}</strong></td>
          <td style="font-family:'IBM Plex Mono',monospace">${fmtU(r.unitPrice)} <span style="font-size:11px;color:var(--muted)">${unitLabel}</span></td>
          <td style="font-family:'IBM Plex Mono',monospace;color:var(--muted)">${avgPrice ? fmtU(avgPrice) + ` <span style="font-size:11px">${unitLabel}</span>` : '—'}</td>
          <td>${diffHtml}</td>
          <td style="font-size:12px;color:var(--muted)">${volFmt.format(r.totalQty)} ${r.unit}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  },
  async renderOverzicht(){
    if (!CURRENT_USER) return; // demo summary already shown by render()
    const { data, error } = await sb
      .from('transactions')
      .select('amount, categories(name)')
      .eq('email', CURRENT_USER.email);
    if (error || !data || !data.length) return;

    // Aggregate by category
    const agg = {};
    data.forEach(r => {
      const cat = r.categories?.name || 'Overig';
      agg[cat] = (agg[cat] || 0) + parseFloat(r.amount || 0);
    });
    const total = Object.values(agg).reduce((a,b) => a+b, 0);
    const catCount = Object.keys(agg).length;

    // Show real summary tiles
    document.getElementById('dashRealSummary').style.display = 'block';
    document.getElementById('dashDemoSummary').style.display = 'none';
    document.getElementById('dashTotalSpend').textContent = new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(total);
    document.getElementById('dashCatCount').textContent = catCount;
    // Savings estimate: 8-14% of total spend
    document.getElementById('dashPotential').textContent =
      `${new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(total*0.08)} – ${new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(total*0.14)}`;
    const pct = Math.min(100, 30 + catCount * 10);
    document.getElementById('dashProfilePct').textContent = pct + '%';

    // Benchmark chart — fetch from Supabase
    const { data: benchRows } = await sb.from('benchmark_data').select('category_name, avg_amount, sample_size');
    const BENCHMARK = {};
    (benchRows || []).forEach(r => { BENCHMARK[r.category_name] = { avg: parseFloat(r.avg_amount), n: r.sample_size }; });

    const benchCats = Object.keys(agg).filter(c => BENCHMARK[c]);
    if (!benchCats.length) return;

    const fmt = v => new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v);
    const maxVal = Math.max(...benchCats.flatMap(c => [agg[c], BENCHMARK[c]?.avg || 0]));

    const card = document.getElementById('dashBenchmarkCard');
    const chartEl = document.getElementById('dashBenchmarkChart');
    card.style.display = 'block';
    chartEl.innerHTML = `
      <div style="display:flex;gap:16px;font-size:12px;margin-bottom:12px">
        <span style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:2px;background:var(--brand);display:inline-block"></span>Jouw uitgave</span>
        <span style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:2px;background:#c8d8c0;display:inline-block"></span>Groepsgemiddelde</span>
      </div>` +
      benchCats.map(cat => {
        const mine = agg[cat];
        const avg = BENCHMARK[cat].avg;
        const n = BENCHMARK[cat].n;
        const diff = mine - avg;
        const diffPct = Math.round((diff / avg) * 100);
        const diffColor = diff > 0 ? 'var(--danger-ink)' : 'var(--positive-ink)';
        const diffLabel = diff > 0 ? `+${diffPct}% boven gemiddelde` : `${diffPct}% onder gemiddelde`;
        return `
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:13px;margin-bottom:4px">
              <span style="color:var(--ink);font-weight:500">${cat}</span>
              <span style="font-size:11px;color:${diffColor}">${diffLabel}${n ? ` (n=${n})` : ''}</span>
            </div>
            <div style="position:relative;height:20px;background:var(--line);border-radius:4px;overflow:hidden;margin-bottom:3px">
              <div style="height:100%;width:${Math.round(mine/maxVal*100)}%;background:var(--brand);border-radius:4px"></div>
            </div>
            <div style="position:relative;height:14px;background:var(--line);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${Math.round(avg/maxVal*100)}%;background:#c8d8c0;border-radius:4px"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:3px">
              <span>${fmt(mine)}</span><span>gem. ${fmt(avg)}</span>
            </div>
          </div>`;
      }).join('');
  },

  async renderContracten(){
    const el = document.getElementById('dashContractBody');
    if (!el) return;

    const DEMO_CONTRACTS = [
      {category:'Verzekeringen', supplier:'De Goudse', period_end:'2027-07-01', amount:3240, notes:'Horeca all-risk polis'},
      {category:'Gas', supplier:'Hezelaer Energy', period_end:'2027-01-01', amount:2394, notes:'Jaarafrekening gas'},
      {category:'Elektra', supplier:'Hezelaer Energy', period_end:'2027-01-01', amount:11233, notes:'Jaarafrekening elektriciteit'},
      {category:'Telecom', supplier:'Odido', period_end:'2027-01-01', amount:960, notes:'Internet & telefonie'},
      {category:'Afval & milieu', supplier:'Milieu Service NL', period_end:'2026-12-31', amount:604, notes:'Afvalcontract kwartaal'},
    ];

    const fmt = v => new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v);
    const fmtDate = s => s ? new Date(s).toLocaleDateString('nl-NL',{year:'numeric',month:'long',day:'numeric'}) : '—';
    const urgencyBadge = s => {
      if (!s) return '<span class="badge b-grey">Onbekend</span>';
      const days = (new Date(s) - new Date()) / 86400000;
      if (days < 60) return '<span class="badge b-red">Binnenkort</span>';
      if (days < 180) return '<span class="badge b-yellow">Let op</span>';
      return '<span class="badge b-green">Lopend</span>';
    };

    let rows = [];
    let isDemo = false;

    if (CURRENT_USER) {
      const { data, error } = await sb
        .from('transactions')
        .select('amount, period_end, notes, source, categories(name), suppliers(name)')
        .eq('email', CURRENT_USER.email)
        .not('period_end', 'is', null)
        .order('period_end', { ascending: true });
      if (!error && data && data.length) {
        rows = data.map(r => ({
          category: r.categories?.name || 'Overig',
          supplier: r.suppliers?.name || '—',
          period_end: r.period_end,
          amount: parseFloat(r.amount || 0),
          notes: r.notes || '',
        }));
      } else {
        isDemo = true; rows = DEMO_CONTRACTS;
      }
    } else {
      isDemo = true; rows = DEMO_CONTRACTS;
    }

    el.innerHTML = (isDemo ? `<p style="font-size:12px;color:var(--muted);font-style:italic;margin:0 0 12px">Voorbeelddata — log in en upload contracten om jouw eigen overzicht te zien.</p>` : '') +
      `<table class="table"><thead><tr><th>Categorie</th><th>Leverancier</th><th>Einddatum</th><th>Jaarbedrag</th><th>Status</th></tr></thead><tbody>` +
      rows.map(r => `<tr>
        <td><strong>${r.category}</strong></td>
        <td>${r.supplier}</td>
        <td style="white-space:nowrap">${fmtDate(r.period_end)}</td>
        <td style="font-family:'IBM Plex Mono',monospace;font-size:12.5px">${fmt(r.amount)}</td>
        <td>${urgencyBadge(r.period_end)}</td>
      </tr>`).join('') +
      `</tbody></table>`;
  },

  async renderProfiel(){
    const statsCard = document.getElementById('dashProfileStats');
    const statsKv = document.getElementById('dashProfileStatsKv');
    const kvEl = document.getElementById('dashProfileKv');
    const editBtn = document.getElementById('dashProfileEditBtn');

    if (!CURRENT_USER) {
      if (editBtn) editBtn.style.display = 'none';
      return;
    }
    if (editBtn) editBtn.style.display = '';

    // Load profile from Supabase (preferred) or fall back to STATE
    const { data: prof } = await sb.from('profiles').select('*').eq('email', CURRENT_USER.email).maybeSingle();
    const p = prof || {};
    const sp = STATE.profile || {};
    const acc = STATE.account || {};

    if (kvEl) kvEl.innerHTML = `
      <div><span>Bedrijfsnaam</span>${p.company_name || acc.companyName || '—'}</div>
      <div><span>Contactpersoon</span>${p.contact_person || acc.contactPerson || '—'}</div>
      <div><span>E-mail</span>${CURRENT_USER.email}</div>
      <div><span>Telefoon</span>${p.phone || acc.phone || '—'}</div>
      <div><span>Type horecazaak</span>${p.business_type || sp.businessType || '—'}</div>
      <div><span>Vestigingsplaats</span>${p.city || sp.city || '—'}</div>
      <div><span>Jaaromzet</span>${p.turnover || sp.turnover || '—'}</div>
      <div><span>Aantal vestigingen</span>${p.locations || sp.locations || '—'}</div>
      ${p.kvk_number ? `<div><span>KVK-nummer</span>${p.kvk_number}</div>` : ''}
    `;

    // Also store loaded profile for edit form
    this._loadedProfile = p;

    // Extracted stats
    if (!statsCard || !statsKv) return;
    const { data: exData } = await sb.from('extracted_data')
      .select('volume_bier, volume_elektra_kwh, volume_gas_m3, volume_frisdrank, vuilnis_kosten, verzekering_dekking')
      .eq('email', CURRENT_USER.email);

    if (!exData || !exData.length) { statsCard.style.display = 'none'; return; }
    const sum = key => exData.reduce((acc, r) => acc + (parseFloat(r[key]) || 0), 0);
    const fmt = v => new Intl.NumberFormat('nl-NL',{maximumFractionDigits:0}).format(v);
    const gas = sum('volume_gas_m3'), kwh = sum('volume_elektra_kwh'),
          bier = sum('volume_bier'), fris = sum('volume_frisdrank'),
          afval = sum('vuilnis_kosten');
    const dekking = exData.map(r => r.verzekering_dekking).filter(Boolean).join('; ') || null;
    const items = [
      gas   ? `<div><span>Gasverbruik (m³)</span>${fmt(gas)} m³</div>` : '',
      kwh   ? `<div><span>Elektraverbruik (kWh)</span>${fmt(kwh)} kWh</div>` : '',
      bier  ? `<div><span>Biervolume (liter)</span>${fmt(bier)} L</div>` : '',
      fris  ? `<div><span>Frisdrankvolume (liter)</span>${fmt(fris)} L</div>` : '',
      afval ? `<div><span>Afvalkosten</span>€${fmt(afval)}</div>` : '',
      dekking ? `<div><span>Verzekeringsdekking</span>${dekking}</div>` : '',
    ].filter(Boolean);
    if (!items.length) { statsCard.style.display = 'none'; return; }
    statsKv.innerHTML = items.join('');
    statsCard.style.display = 'block';
  },

  _loadedProfile: {},
  openProfileEdit(){
    const p = this._loadedProfile || {};
    const sp = STATE.profile || {};
    const acc = STATE.account || {};
    document.getElementById('pf_company').value  = p.company_name   || acc.companyName   || '';
    document.getElementById('pf_contact').value  = p.contact_person || acc.contactPerson || '';
    document.getElementById('pf_email').value    = CURRENT_USER?.email || '';
    document.getElementById('pf_phone').value    = p.phone          || acc.phone         || '';
    document.getElementById('pf_type').value     = p.business_type  || sp.businessType   || '';
    document.getElementById('pf_city').value     = p.city           || sp.city           || '';
    document.getElementById('pf_turnover').value = p.turnover       || sp.turnover       || '';
    document.getElementById('pf_locations').value= p.locations      || sp.locations      || '';
    document.getElementById('pf_kvk').value      = p.kvk_number     || acc.kvkNumber     || '';
    document.getElementById('dashProfileSaveStatus').textContent = '';
    document.getElementById('dashProfileView').style.display = 'none';
    document.getElementById('dashProfileEdit').style.display = 'block';
  },
  closeProfileEdit(){
    document.getElementById('dashProfileView').style.display = 'block';
    document.getElementById('dashProfileEdit').style.display = 'none';
  },
  async saveProfile(){
    if (!CURRENT_USER) return;
    const statusEl = document.getElementById('dashProfileSaveStatus');
    statusEl.style.color = 'var(--ink)';
    statusEl.textContent = 'Opslaan…';
    const payload = {
      email:          CURRENT_USER.email,
      company_name:   document.getElementById('pf_company').value.trim(),
      contact_person: document.getElementById('pf_contact').value.trim(),
      phone:          document.getElementById('pf_phone').value.trim(),
      business_type:  document.getElementById('pf_type').value,
      city:           document.getElementById('pf_city').value.trim(),
      turnover:       document.getElementById('pf_turnover').value,
      locations:      document.getElementById('pf_locations').value.trim(),
      kvk_number:     document.getElementById('pf_kvk').value.trim(),
      updated_at:     new Date().toISOString(),
    };
    const { error } = await sb.from('profiles').upsert(payload, { onConflict: 'email' });
    if (error) {
      statusEl.style.color = 'var(--danger-ink)';
      statusEl.textContent = 'Opslaan mislukt: ' + error.message;
      return;
    }
    this._loadedProfile = payload;
    // Also update STATE for consistency
    STATE.account.companyName   = payload.company_name;
    STATE.account.contactPerson = payload.contact_person;
    STATE.account.phone         = payload.phone;
    STATE.profile.businessType  = payload.business_type;
    STATE.profile.city          = payload.city;
    STATE.profile.turnover      = payload.turnover;
    STATE.profile.locations     = payload.locations;
    saveState();
    this.closeProfileEdit();
    this.renderProfiel();
    // Update company name in header
    const nameEl = document.getElementById('dashCompanyName');
    if (nameEl && payload.company_name) nameEl.textContent = payload.company_name;
  },

  _stagedFiles: [],
  _subgroupOptions(){
    return `<option value="">— Geen / onbekend —</option>` +
      SUBGROUPS.map(s=>`<option value="${s.id}">${s.name}</option>`).join("");
  },
  stageFiles(input){
    const files = Array.from(input.files || []);
    if(!files.length) return;
    this._stagedFiles = files;
    const defaultSg = STATE.primary.subgroupId || "";
    const opts = this._subgroupOptions();
    document.getElementById("docStagingBody").innerHTML = files.map((f, i) => `
      <tr>
        <td style="font-size:13px">${f.name}</td>
        <td><select id="docStagingSg_${i}" style="width:100%;padding:8px 10px;border:1px solid #cfd3c6;border-radius:var(--r-sm);font-size:13px">${opts}</select></td>
      </tr>`).join("");
    files.forEach((_, i) => {
      document.getElementById(`docStagingSg_${i}`).value = defaultSg;
    });
    document.getElementById("docStagingArea").style.display = "block";
    document.getElementById("docUploadBox").classList.add("filled");
    document.getElementById("docUploadBoxText").textContent = `${files.length} bestand(en) geselecteerd`;
    document.getElementById("docUploadStatus").textContent = "";
  },
  clearStaging(){
    this._stagedFiles = [];
    document.getElementById("docStagingArea").style.display = "none";
    document.getElementById("docUploadBox").classList.remove("filled");
    document.getElementById("docUploadBoxText").textContent = "Klik om bestand(en) te selecteren (factuur, contract, jaarafrekening of offerte)";
    document.getElementById("docFileInput").value = "";
    document.getElementById("docUploadStatus").textContent = "";
  },
  async submitStagedFiles(){
    const name = document.getElementById("docUploadName").value.trim();
    const email = document.getElementById("docUploadEmail").value.trim().toLowerCase();
    const statusEl = document.getElementById("docUploadStatus");

    if(!email){
      statusEl.style.color = "var(--danger-ink)";
      statusEl.textContent = "Vul je e-mailadres in voordat je uploadt.";
      return;
    }

    statusEl.style.color = "var(--ink)";
    statusEl.textContent = "Bezig met uploaden…";

    try {
      let totalTransactions = 0;
      for(let i = 0; i < this._stagedFiles.length; i++){
        const file = this._stagedFiles[i];
        const subgroup = document.getElementById(`docStagingSg_${i}`).value || null;
        await uploadToSupabase(file, name || null, email, subgroup);
        if(!STATE.uploadFileName) STATE.uploadFileName = file.name;
        if (/\.xlsx?$/i.test(file.name)) {
          const result = await parseAndSaveExcel(file, email, name);
          totalTransactions += result.aantal;
        }
      }
      const txMsg = totalTransactions > 0 ? ` ${totalTransactions} transactieregels opgeslagen.` : '';
      // Capture before clearStaging empties the list
      const uploadedNames = this._stagedFiles.map(f => f.name);
      const uploadedCount = this._stagedFiles.length;
      statusEl.style.color = "var(--positive-ink)";
      statusEl.textContent = `${uploadedCount} bestand(en) succesvol geüpload.${txMsg}`;
      this.clearStaging();
      saveState();
      this.render();
      this.renderDocuments();
      // TODO: bevestigingsemail via Resend (RESEND_API_KEY in Supabase env vars)
      // sb.functions.invoke('send-upload-confirmation', { body: { email, name, fileNames: uploadedNames, fileCount: uploadedCount } })
    } catch(err) {
      statusEl.style.color = "var(--danger-ink)";
      statusEl.textContent = "Upload mislukt: " + err.message;
    }
  }
};

function renderAuthTable(){ /* legacy — vervangen door AuthModule */ }

/* =========================================================
   AuthModule — machtigingen per databron
   ========================================================= */
const AuthModule = {
  _sources: [],
  _authorizations: [],

  async loadAndRender() {
    const grid = document.getElementById('authSourceGrid');
    const histCard = document.getElementById('authHistoryCard');
    if (!grid) return;

    // Load data sources
    const { data: sources } = await sb.from('data_sources')
      .select('*').eq('is_active', true).order('sort_order');
    this._sources = sources || [];

    if (!CURRENT_USER) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <a onclick="AuthUI.openLogin()" style="cursor:pointer;text-decoration:underline;color:var(--brand2)">Log in</a> om je machtigingen te beheren.
      </div>`;
      if (histCard) histCard.style.display = 'none';
      return;
    }

    // Load active authorizations for this user
    const { data: auths } = await sb.from('authorizations')
      .select('*')
      .eq('email', CURRENT_USER.email)
      .order('granted_at', { ascending: false });
    this._authorizations = auths || [];

    // Render source cards
    grid.innerHTML = this._sources.map(s => {
      const auth = this._authorizations.find(a => a.data_source_id === s.id && a.status === 'active');
      const revoked = this._authorizations.find(a => a.data_source_id === s.id && a.status === 'revoked');
      if (auth) {
        const until = new Date(auth.expires_at).toLocaleDateString('nl-NL');
        return `<div class="auth-source-card active">
          <div class="auth-source-info">
            <strong>${s.name}</strong>
            <p style="color:var(--positive-ink)">${s.description}</p>
            <div class="auth-source-meta">Verleend op ${new Date(auth.granted_at).toLocaleDateString('nl-NL')} · Geldig tot ${until}</div>
            <div class="auth-id">${auth.id}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">
            <span class="badge b-green">Actief</span>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger-ink);border-color:var(--danger-ink);font-size:12px" onclick="AuthModule.openRevoke('${auth.id}','${s.name}')">Intrekken</button>
          </div>
        </div>`;
      } else if (revoked) {
        return `<div class="auth-source-card revoked">
          <div class="auth-source-info">
            <strong>${s.name}</strong>
            <p>${s.description}</p>
            <div class="auth-source-meta">Ingetrokken op ${new Date(revoked.revoked_at).toLocaleDateString('nl-NL')}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">
            <span class="badge b-grey">Ingetrokken</span>
            <button class="btn btn-primary btn-sm" onclick="AuthModule.openGrant('${s.id}')">Opnieuw machtigen</button>
          </div>
        </div>`;
      } else {
        return `<div class="auth-source-card">
          <div class="auth-source-info">
            <strong>${s.name}</strong>
            <p>${s.description}</p>
            <div class="auth-source-meta">${s.permissions.map(p=>`<span class="tag">${p}</span>`).join(' ')}</div>
          </div>
          <div style="flex-shrink:0">
            <button class="btn btn-primary btn-sm" onclick="AuthModule.openGrant('${s.id}')">Machtigen</button>
          </div>
        </div>`;
      }
    }).join('');

    // Render audit trail
    const { data: events } = await sb.from('authorization_events')
      .select('*')
      .eq('email', CURRENT_USER.email)
      .order('created_at', { ascending: false })
      .limit(30);

    if (events && events.length) {
      histCard.style.display = 'block';
      document.getElementById('authEventList').innerHTML = events.map(e => {
        const dotClass = e.event_type.toLowerCase();
        const date = new Date(e.created_at).toLocaleString('nl-NL');
        const labels = { GRANTED:'Machtiging verleend', REVOKED:'Machtiging ingetrokken', UPDATED:'Machtiging gewijzigd', EXPIRED:'Machtiging verlopen', SUPERSEDED:'Vervangen door nieuwe machtiging' };
        return `<div class="audit-row">
          <div class="audit-dot ${dotClass}"></div>
          <div>
            <strong style="font-size:13px">${labels[e.event_type]||e.event_type}</strong>
            ${e.authorization_id ? `<span class="auth-id" style="margin-left:6px">${e.authorization_id}</span>` : ''}
            ${e.note ? `<div style="color:var(--muted);font-size:12px;margin-top:2px">${e.note}</div>` : ''}
            <div style="color:var(--muted);font-size:12px;margin-top:2px">${date}</div>
          </div>
        </div>`;
      }).join('');
    } else {
      histCard.style.display = 'none';
    }
  },

  openGrant(sourceId) {
    const source = this._sources.find(s => s.id === sourceId);
    if (!source) return;
    const el = document.getElementById('authGrantContent');
    el.innerHTML = `
      <h2 style="font-size:20px;margin-bottom:4px">Machtigen — ${source.name}</h2>
      <p style="margin-bottom:18px;font-size:13.5px">Horeca United mag namens jouw onderneming de onderstaande gegevens opvragen bij <strong>${source.name}</strong> voor: <em>${source.purpose}</em>.</p>
      <div class="note" style="margin-bottom:18px;font-size:13px">
        <strong>Wat wordt opgehaald:</strong> ${source.permissions.join(', ')}<br>
        <strong>Doel:</strong> ${source.purpose}<br>
        <strong>Geldigheid:</strong> 365 dagen · op elk moment intrekbaar
      </div>
      <div class="grid2">
        <div class="field"><label for="grantName">Naam tekenbevoegde</label><input type="text" id="grantName" placeholder="Bijv. Jan de Vries" value="${STATE.account.contactPerson||''}"></div>
        <div class="field"><label for="grantRole">Functie</label><input type="text" id="grantRole" placeholder="Bijv. eigenaar" value=""></div>
        <div class="field"><label for="grantCompany">Bedrijfsnaam</label><input type="text" id="grantCompany" placeholder="Bijv. Restaurant 't Volk B.V." value="${STATE.account.companyName||''}"></div>
        <div class="field"><label for="grantKvk">KvK-nummer</label><input type="text" id="grantKvk" placeholder="8 cijfers" value="${STATE.authorization?.kvk||''}"></div>
      </div>
      <div class="consent-row" style="margin-top:8px">
        <input type="checkbox" id="grantConsent">
        <label for="grantConsent">Ik verklaar tekenbevoegd te zijn en machtig Horeca United B.V. om namens mijn onderneming gegevens op te vragen bij <strong>${source.name}</strong>, uitsluitend voor bovenstaand doel en binnen de genoemde geldigheidsduur. <span class="req">verplicht</span></label>
      </div>
      <div class="error-text" id="grantError" style="display:none;margin-top:8px"></div>
      <div class="actions" style="margin-top:16px">
        <button class="btn btn-primary" onclick="AuthModule.confirmGrant('${sourceId}')">Bevestigen en machtigen</button>
        <button class="btn btn-ghost" onclick="AuthModule.closeGrant()">Annuleren</button>
      </div>`;
    document.getElementById('authGrantModal').classList.add('active');
  },

  async confirmGrant(sourceId) {
    const name = document.getElementById('grantName').value.trim();
    const role = document.getElementById('grantRole').value.trim();
    const company = document.getElementById('grantCompany').value.trim();
    const kvk = document.getElementById('grantKvk').value.trim();
    const consent = document.getElementById('grantConsent').checked;
    const errEl = document.getElementById('grantError');

    if (!name || !company || !kvk || !consent) {
      errEl.textContent = 'Vul alle verplichte velden in en bevestig de machtiging.';
      errEl.style.display = 'block';
      return;
    }
    if (!/^\d{8}$/.test(kvk.replace(/\s/g,''))) {
      errEl.textContent = 'KvK-nummer moet 8 cijfers zijn.';
      errEl.style.display = 'block';
      return;
    }
    errEl.style.display = 'none';

    const btn = document.querySelector('#authGrantContent .btn-primary');
    btn.disabled = true; btn.textContent = 'Opslaan…';

    const now = new Date();
    const seq = String(Math.floor(Math.random()*99999)).padStart(5,'0');
    const authId = `AUTH-${sourceId.toUpperCase()}-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${seq}`;
    const source = this._sources.find(s => s.id === sourceId);
    const email = CURRENT_USER.email;

    const { error } = await sb.from('authorizations').insert({
      id: authId,
      user_id: CURRENT_USER.id,
      email,
      company_name: company,
      kvk_number: kvk,
      signatory_name: name,
      signatory_role: role,
      data_source_id: sourceId,
      permissions: source.permissions,
      purpose: source.purpose,
      status: 'active',
      document_version: 'v1.0',
      validity_days: 365
    });

    if (error) {
      errEl.textContent = 'Opslaan mislukt: ' + error.message;
      errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Bevestigen en machtigen';
      return;
    }

    await sb.from('authorization_events').insert({
      authorization_id: authId,
      email,
      event_type: 'GRANTED',
      actor: 'user',
      new_values: { company_name: company, kvk_number: kvk, signatory_name: name, data_source_id: sourceId },
      note: `Machtiging verleend voor ${source.name} door ${name} (${role||'—'})`
    });

    this.closeGrant();
    await this.loadAndRender();
  },

  closeGrant() {
    document.getElementById('authGrantModal').classList.remove('active');
  },

  openRevoke(authId, sourceName) {
    document.getElementById('authRevokeContent').innerHTML = `
      <h2 style="font-size:20px;margin-bottom:8px">Machtiging intrekken</h2>
      <p>Weet je zeker dat je de machtiging voor <strong>${sourceName}</strong> wilt intrekken?</p>
      <div class="note-strong" style="margin:14px 0;font-size:13px">
        Intrekking betekent dat Horeca United geen nieuwe gegevens meer mag opvragen bij ${sourceName}. Reeds ontvangen gegevens blijven bewaard conform de bewaartermijnen.
      </div>
      <div class="field">
        <label for="revokeReason">Reden <span class="hint">(optioneel)</span></label>
        <input type="text" id="revokeReason" placeholder="Bijv. niet meer relevant">
      </div>
      <div class="actions" style="margin-top:16px">
        <button class="btn btn-ghost btn-sm" style="color:var(--danger-ink);border-color:var(--danger-ink)" onclick="AuthModule.confirmRevoke('${authId}','${sourceName}')">Ja, intrekken</button>
        <button class="btn btn-ghost" onclick="AuthModule.closeRevoke()">Annuleren</button>
      </div>`;
    document.getElementById('authRevokeModal').classList.add('active');
  },

  async confirmRevoke(authId, sourceName) {
    const reason = document.getElementById('revokeReason')?.value.trim() || null;
    const email = CURRENT_USER.email;

    const { error } = await sb.from('authorizations').update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revoked_reason: reason
    }).eq('id', authId).eq('email', email);

    if (error) { alert('Intrekken mislukt: ' + error.message); return; }

    await sb.from('authorization_events').insert({
      authorization_id: authId,
      email,
      event_type: 'REVOKED',
      actor: 'user',
      note: reason ? `Reden: ${reason}` : `Machtiging voor ${sourceName} ingetrokken`
    });

    this.closeRevoke();
    await this.loadAndRender();
  },

  closeRevoke() {
    document.getElementById('authRevokeModal').classList.remove('active');
  }
};

// Close modals on backdrop click
document.getElementById('authGrantModal').addEventListener('click', e => { if(e.target.id==='authGrantModal') AuthModule.closeGrant(); });
document.getElementById('authRevokeModal').addEventListener('click', e => { if(e.target.id==='authRevokeModal') AuthModule.closeRevoke(); });

/* ---------------- Lead scoring ---------------- */
function leadScore(company){
  let score = 0;
  score += Math.min(30, (company.annualCosts/2000));
  score += {"1":0,"2":5,"3 – 5":10,"6+":15}[company.locations] || 0;
  score += Math.min(15, company.subgroupCount*2);
  score += company.hasDocument ? 12 : 0;
  score += company.contractSoon ? 10 : 0;
  score += company.willingness==="ja" ? 12 : (company.willingness==="misschien" ? 6 : 0);
  score += company.multiAnalysis ? 6 : 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}
function leadLabel(score){
  if(score>=85) return ["Conversieklaar","b-green"];
  if(score>=70) return ["Hoge prioriteit","b-green"];
  if(score>=50) return ["Kansrijk","b-yellow"];
  if(score>=30) return ["Nieuw","b-grey"];
  return ["Koud","b-grey"];
}

/* ---------------- Admin demo dataset ---------------- */
const DEMO_COMPANIES = [
  {name:"Restaurant Het Stadshuis", type:"Restaurant", city:"Arnhem", locations:"1", firstSubgroup:"Energie", subgroupCount:4, annualCosts:64000, potentialLow:3000, potentialHigh:8000, willingness:"ja", hasDocument:true, contractSoon:true, multiAnalysis:true, phase:"Actieve pilotklant"},
  {name:"Brasserie De Kade", type:"Café", city:"Nijmegen", locations:"1", firstSubgroup:"Betaalverkeer", subgroupCount:1, annualCosts:9500, potentialLow:1200, potentialHigh:3000, willingness:"misschien", hasDocument:false, contractSoon:false, multiAnalysis:false, phase:"Nieuwe lead"},
  {name:"Hotel Stadspoort", type:"Hotel", city:"Utrecht", locations:"2", firstSubgroup:"Afval", subgroupCount:6, annualCosts:142000, potentialLow:8000, potentialHigh:18000, willingness:"ja", hasDocument:true, contractSoon:true, multiAnalysis:true, phase:"Multi-subgroepklant"},
  {name:"Café De Hoek", type:"Café", city:"Apeldoorn", locations:"1", firstSubgroup:"Bier", subgroupCount:2, annualCosts:21000, potentialLow:1500, potentialHigh:4200, willingness:"nee", hasDocument:false, contractSoon:false, multiAnalysis:false, phase:"Quick Scan gestart"},
  {name:"Lunchroom Aan Tafel", type:"Lunchroom", city:"Zwolle", locations:"1", firstSubgroup:"Foodgroothandel", subgroupCount:3, annualCosts:38000, potentialLow:2200, potentialHigh:5600, willingness:"misschien", hasDocument:true, contractSoon:false, multiAnalysis:false, phase:"Kansrijke lead"},
  {name:"Bistro Noord", type:"Restaurant", city:"Amsterdam", locations:"1", firstSubgroup:"Verzekeringen", subgroupCount:5, annualCosts:97000, potentialLow:5000, potentialHigh:12500, willingness:"ja", hasDocument:true, contractSoon:true, multiAnalysis:true, phase:"Conversieklaar"},
  {name:"Grand Café Marktzicht", type:"Café", city:"Breda", locations:"1", firstSubgroup:"Internet en telefonie", subgroupCount:2, annualCosts:26000, potentialLow:1400, potentialHigh:3400, willingness:"misschien", hasDocument:false, contractSoon:false, multiAnalysis:false, phase:"Nieuwe lead"},
  {name:"Eetcafé De Brug", type:"Café", city:"Deventer", locations:"1", firstSubgroup:"Schoonmaak", subgroupCount:1, annualCosts:14000, potentialLow:900, potentialHigh:2600, willingness:"nee", hasDocument:false, contractSoon:false, multiAnalysis:false, phase:"Quick Scan gestart"},
  {name:"Hotel Van Der Linde", type:"Hotel", city:"Groningen", locations:"3 – 5", firstSubgroup:"Energie", subgroupCount:8, annualCosts:210000, potentialLow:12000, potentialHigh:26000, willingness:"ja", hasDocument:true, contractSoon:true, multiAnalysis:true, phase:"Actieve Horeca United-klant"},
  {name:"Cafetaria 't Pleintje", type:"Cafetaria / fastservice", city:"Enschede", locations:"1", firstSubgroup:"Diepvries", subgroupCount:1, annualCosts:31000, potentialLow:1800, potentialHigh:4400, willingness:"misschien", hasDocument:false, contractSoon:false, multiAnalysis:false, phase:"Nieuwe lead"},
];

const AdminApp = {
  open(){ this.buildLeads(); this.renderKpis(); this.renderLeads(); this.showTab('leads'); Router.go("admin"); },
  showTab(tab) {
    document.getElementById('admTab-machtigingen').style.display = tab === 'machtigingen' ? 'block' : 'none';
    // leads tab elements are always shown unless machtigingen is active
    const leadsEls = ['admLeadTable','admEmpty'].map(id => document.getElementById(id)).filter(Boolean);
    leadsEls.forEach(el => el.closest('.panel') && (el.closest('.panel').style.display = tab === 'leads' ? '' : 'none'));
    document.querySelectorAll('#screen-admin .side-nav a').forEach(a => a.classList.remove('active'));
    const idx = tab === 'leads' ? 0 : 1;
    document.querySelectorAll('#screen-admin .side-nav a')[idx]?.classList.add('active');
    if (tab === 'machtigingen') this.loadAuthorizationsTab();
  },
  async loadAuthorizationsTab() {
    const el = document.getElementById('admAuthContent');
    el.innerHTML = '<div class="empty-state">Laden…</div>';
    const { data: auths, error } = await sb.from('authorizations')
      .select('*, data_sources(name)')
      .order('granted_at', { ascending: false })
      .limit(200);
    if (error) { el.innerHTML = `<div class="empty-state" style="color:var(--danger-ink)">Fout: ${error.message}</div>`; return; }
    if (!auths || !auths.length) { el.innerHTML = '<div class="empty-state">Geen machtigingen gevonden.</div>'; return; }
    const statusBadge = s => ({ active:'b-green', revoked:'b-grey', expired:'b-red', superseded:'b-yellow' }[s]||'b-grey');
    const statusLabel = s => ({ active:'Actief', revoked:'Ingetrokken', expired:'Verlopen', superseded:'Vervangen' }[s]||s);
    el.innerHTML = `<table class="table">
      <thead><tr><th>Bedrijf</th><th>E-mail</th><th>Databron</th><th>Machtigings-ID</th><th>Verleend op</th><th>Geldig tot</th><th>Status</th></tr></thead>
      <tbody>${auths.map(a => `<tr>
        <td>${a.company_name||'—'}</td>
        <td style="font-size:12.5px;color:var(--muted)">${a.email}</td>
        <td>${a.data_sources?.name||a.data_source_id}</td>
        <td><span class="auth-id">${a.id}</span></td>
        <td style="font-size:12.5px">${new Date(a.granted_at).toLocaleDateString('nl-NL')}</td>
        <td style="font-size:12.5px">${a.expires_at ? new Date(a.expires_at).toLocaleDateString('nl-NL') : '—'}</td>
        <td><span class="badge ${statusBadge(a.status)}">${statusLabel(a.status)}</span></td>
      </tr>`).join('')}</tbody>
    </table>`;
  },
  leads: [],
  buildLeads(){
    // merge demo companies with the user's own quick-scan entry, so it's visible in admin
    const rows = DEMO_COMPANIES.map(c=>({...c}));
    if(STATE.completed && STATE.account.companyName){
      rows.unshift({
        name: STATE.account.companyName, type: STATE.profile.businessType||"Overig", city: STATE.profile.city||"Onbekend",
        locations: STATE.profile.locations||"1", firstSubgroup: subgroupName(STATE.primary.subgroupId),
        subgroupCount: STATE.selectedSubgroups.length, annualCosts: STATE.primary.annualSpend||6000,
        potentialLow: STATE.result?STATE.result.low:1500, potentialHigh: STATE.result?STATE.result.high:4000,
        willingness: STATE.primary.willingness||"misschien", hasDocument: STATE.method==="upload",
        contractSoon: !!STATE.primary.contractEnd, multiAnalysis: STATE.selectedSubgroups.length>1,
        phase: "Actieve pilotklant", self:true
      });
    }
    this.leads = rows.map(r=>({...r, score: leadScore(r)}));
  },
  renderKpis(){
    const totalCosts = this.leads.reduce((a,c)=>a+c.annualCosts,0);
    const avgProfile = Math.round(this.leads.reduce((a,c)=>a+Math.min(100, 30+c.subgroupCount*8),0)/this.leads.length);
    document.getElementById("admKpiTotalCosts").textContent = euro(totalCosts);
    document.getElementById("admKpiContracts").textContent = this.leads.filter(c=>c.contractSoon).length;
    document.getElementById("admKpiAvgProfile").textContent = avgProfile + "%";
    document.getElementById("admKpiActive").textContent = this.leads.filter(c=>c.phase.includes("Actieve")).length;
  },
  renderLeads(){
    const q = (document.getElementById("admSearch").value||"").toLowerCase();
    const phaseFilter = document.getElementById("admFilterPhase").value;
    const sort = document.getElementById("admSort").value;
    let rows = this.leads.filter(c=>{
      const matchQ = !q || c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q);
      const matchPhase = !phaseFilter || c.phase===phaseFilter;
      return matchQ && matchPhase;
    });
    if(sort==="score_desc") rows.sort((a,b)=>b.score-a.score);
    if(sort==="potential_desc") rows.sort((a,b)=>b.potentialHigh-a.potentialHigh);
    if(sort==="name_asc") rows.sort((a,b)=>a.name.localeCompare(b.name));

    const willMap = {ja:"Ja", misschien:"Misschien", nee:"Nee"};
    const phaseColor = { "Quick Scan gestart":"b-grey","Nieuwe lead":"b-grey","Actieve pilotklant":"b-green","Kansrijke lead":"b-yellow","Multi-subgroepklant":"b-green","Conversieklaar":"b-green","Actieve Horeca United-klant":"b-green" };
    const tbody = document.getElementById("admLeadTable");
    tbody.innerHTML = rows.map((c,i)=>{
      const [label] = leadLabel(c.score);
      const nextAction = c.hasDocument ? "Analyse controleren" : (c.contractSoon ? "Contractmoment opvolgen" : "Uploadherinnering sturen");
      return `<tr class="clickable" onclick="AdminApp.openDetail('${encodeURIComponent(c.name)}')">
        <td><strong>${c.name}</strong>${c.self?' <span class="tag" style="margin-left:4px">jouw invoer</span>':''}</td>
        <td>${c.type}<br><span class="hint">${c.city}</span></td>
        <td>${c.locations}</td>
        <td>${c.firstSubgroup}</td>
        <td>${c.subgroupCount}</td>
        <td>${euro(c.annualCosts)}</td>
        <td>${euro(c.potentialLow)} – ${euro(c.potentialHigh)}</td>
        <td>${willMap[c.willingness]}</td>
        <td><span class="leadscore"><span class="leadscore-bar"><div style="width:${c.score}%"></div></span>${c.score} · ${label}</span></td>
        <td><span class="badge ${phaseColor[c.phase]||'b-grey'}">${c.phase}</span></td>
        <td>${nextAction}</td>
      </tr>`;
    }).join("");
    document.getElementById("admEmpty").style.display = rows.length ? "none":"block";
  },
  openDetail(nameEncoded){
    const name = decodeURIComponent(nameEncoded);
    const c = this.leads.find(x=>x.name===name);
    if(!c) return;
    const [label] = leadLabel(c.score);
    document.getElementById("detailModalContent").innerHTML = `
      <span class="pill">${c.phase}</span>
      <h2 style="margin-top:12px">${c.name}</h2>
      <p>${c.type} · ${c.city} · ${c.locations} vestiging(en)</p>
      <div class="detail-grid">
        <div>
          <h3 style="font-size:15px">Bedrijfsprofiel</h3>
          <div class="kv">
            <div><span>Jaarlijkse kosten</span>${euro(c.annualCosts)}</div>
            <div><span>Besparingspotentieel</span>${euro(c.potentialLow)} – ${euro(c.potentialHigh)}</div>
            <div><span>Eerste subgroep</span>${c.firstSubgroup}</div>
            <div><span>Aantal subgroepen</span>${c.subgroupCount}</div>
            <div><span>Overstapbereidheid</span>${({ja:"Ja",misschien:"Misschien, bij voordeel",nee:"Nee, alleen benchmarken"})[c.willingness]}</div>
            <div><span>Document geüpload</span>${c.hasDocument?"Ja":"Nee"}</div>
          </div>
          <h3 style="font-size:15px;margin-top:18px">Interne notities</h3>
          <p style="font-size:13px">${c.self ? "Eigen invoer uit deze demo-sessie." : "Voorbeeldnotitie: contactmoment gepland, wacht op documentatie van de klant."}</p>
          <h3 style="font-size:15px">Taken</h3>
          <div class="tag-list"><span class="tag">Document opvolgen</span><span class="tag">Contractdatum verifiëren</span>${c.multiAnalysis?'<span class="tag">Collectief voorstel voorbereiden</span>':''}</div>
        </div>
        <div>
          <div class="panel stat" style="margin-bottom:10px"><span>Leadscore</span><strong>${c.score} · ${label}</strong></div>
          <div class="panel stat" style="margin-bottom:10px"><span>Geschatte commissie</span><strong>${euro((c.potentialHigh)*0.15)}</strong></div>
          <div class="panel stat"><span>Voorgestelde vervolgstap</span><strong style="font-size:14px">${c.hasDocument?"Analyse afronden":"Documenten opvragen"}</strong></div>
        </div>
      </div>
    `;
    document.getElementById("detailModal").classList.add("active");
  },
  closeDetail(){ document.getElementById("detailModal").classList.remove("active"); }
};
document.getElementById("detailModal").addEventListener("click", e=>{ if(e.target.id==="detailModal") AdminApp.closeDetail(); });

/* ---------------- Demo data controls ---------------- */
const DemoData = {
  reset(){
    if(!confirm("Weet je zeker dat je alle demo-invoer wilt resetten?")) return;
    localStorage.removeItem(STORAGE_KEY);
    STATE = defaultState();
    Router.go("landing");
  }
};

/* ---------------- Init ---------------- */
renderSubgroupOverview();
if(STATE.completed){ Engine.computeResult(); }

