// /src/ui/admin_sitesettings.js
export function adminSiteSettingsJS() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Site Settings</title>
<style>
  :root{ --green:#0a7d2b; --muted:#6b7280; --card:#fff; --bg:#f6f7f8 }
  body{margin:0;background:var(--bg);font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b1320}
  .wrap{max-width:1000px;margin:20px auto;padding:0 14px}
  h1{margin:0 0 12px}
  .tabs{display:flex;gap:8px;margin:8px 0 16px}
  .tab{background:#e7ecef;border-radius:999px;padding:8px 12px;cursor:pointer}
  .tab.active{background:#d9f2df;color:#06451c;font-weight:700}
  .card{background:var(--card);border-radius:14px;padding:16px;box-shadow:0 10px 22px rgba(0,0,0,.06)}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  label{display:block;font-size:12px;color:#374151;margin:8px 0 6px}
  input,select,textarea{width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff}
  .btn{background:var(--green);color:#fff;border:0;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer}
  .btn.outline{background:#fff;color:#111;border:1px solid #e5e7eb}
  .muted{color:var(--muted)}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th,td{padding:8px;border-bottom:1px solid #eef1f3;text-align:left;font-size:14px}
  .pill{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid #e5e7eb;font-size:12px}
  .row-actions{display:flex;gap:8px;margin-top:10px}
  .hint{font-size:12px;color:#6b7280}
</style>
</head>
<body>
<div class="wrap">
  <h1>Site Settings</h1>

  <div class="tabs">
    <div class="tab active" data-tab="gen">General</div>
    <div class="tab" data-tab="wa">WhatsApp</div>
    <div class="tab" data-tab="yoco">Yoco</div>
  </div>

  <div id="panel-gen" class="card">
    <div class="grid">
      <div>
        <label>Site Name</label>
        <input id="SITE_NAME"/>
      </div>
      <div>
        <label>Logo URL</label>
        <input id="SITE_LOGO_URL"/>
      </div>
      <div>
        <label>Public Base URL (https)</label>
        <input id="PUBLIC_BASE_URL" placeholder="https://tickets.example.com"/>
      </div>
      <div>
        <label>VERIFY_TOKEN (Webhook verify)</label>
        <input id="VERIFY_TOKEN" placeholder="vs-verify-2025"/>
      </div>
    </div>
    <div class="row-actions">
      <button id="saveGen" class="btn">Save General</button>
      <span id="msgGen" class="muted"></span>
    </div>
  </div>

  <div id="panel-wa" class="card" style="display:none">
    <h3>WhatsApp Settings</h3>
    <div class="grid">
      <div>
        <label>Access Token</label>
        <input id="WHATSAPP_TOKEN"/>
      </div>
      <div>
        <label>Phone Number ID</label>
        <input id="PHONE_NUMBER_ID"/>
      </div>
      <div>
        <label>Business (WABA) ID</label>
        <input id="BUSINESS_ID"/>
      </div>
    </div>

    <h4 style="margin-top:14px">Template selectors</h4>
    <p class="hint">Choose which approved template to use for each message flow. Values saved as <code>name:language</code>.</p>
    <div class="grid">
      <div>
        <label>Order confirmation</label>
        <select id="WA_TMP_ORDER_CONFIRM"></select>
      </div>
      <div>
        <label>Payment confirmation</label>
        <select id="WA_TMP_PAYMENT_CONFIRM"></select>
      </div>
      <div>
        <label>Ticket delivery</label>
        <select id="WA_TMP_TICKET_DELIVERY"></select>
      </div>
      <div>
        <label>Skou reminders</label>
        <select id="WA_TMP_SKOU_SALES"></select>
      </div>
    </div>

    <div class="row-actions">
      <button id="saveWA" class="btn">Save WhatsApp</button>
      <button id="syncWA" class="btn outline">Sync templates</button>
      <span id="msgWA" class="muted"></span>
    </div>

    <h3 style="margin-top:18px">Templates</h3>
    <div id="waTable" class="muted">Loading templates…</div>
  </div>

  <div id="panel-yoco" class="card" style="display:none">
    <div class="grid">
      <div>
        <label>Mode</label>
        <select id="YOCO_MODE">
          <option value="sandbox">Sandbox</option>
          <option value="live">Live</option>
        </select>
      </div>
      <div></div>
      <div>
        <label>Sandbox (Test) Public Key</label>
        <input id="YOCO_TEST_PUBLIC_KEY"/>
      </div>
      <div>
        <label>Sandbox (Test) Secret Key</label>
        <input id="YOCO_TEST_SECRET_KEY"/>
      </div>
      <div>
        <label>Live Public Key</label>
        <input id="YOCO_LIVE_PUBLIC_KEY"/>
      </div>
      <div>
        <label>Live Secret Key</label>
        <input id="YOCO_LIVE_SECRET_KEY"/>
      </div>
    </div>
    <div class="row-actions">
      <button id="saveYoco" class="btn">Save Yoco</button>
      <span id="msgYoco" class="muted"></span>
    </div>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
function showTab(which){
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.tab===which);
  for (const id of ['gen','wa','yoco']) $('panel-'+id).style.display = (id===which?'block':'none');
}
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>showTab(t.dataset.tab));

// --- Settings IO -----------------------------------------------------------
async function loadSettings(){
  const r = await fetch('/api/admin/settings', { credentials:'include' });
  const j = await r.json().catch(()=>({ok:false}));
  if (!j.ok){ $('msgGen').textContent='Failed to load settings'; return; }
  const s = j.settings||{};
  // General
  ['SITE_NAME','SITE_LOGO_URL','PUBLIC_BASE_URL','VERIFY_TOKEN']
    .forEach(k=>{ if (s[k]!=null) $(k).value = s[k]; });

  // WhatsApp basics
  $('WHATSAPP_TOKEN').value   = s.WHATSAPP_TOKEN || '';
  $('PHONE_NUMBER_ID').value  = s.PHONE_NUMBER_ID || '';
  $('BUSINESS_ID').value      = s.BUSINESS_ID || '';

  // Template selectors
  $('WA_TMP_ORDER_CONFIRM').dataset.value   = s.WA_TMP_ORDER_CONFIRM || '';
  $('WA_TMP_PAYMENT_CONFIRM').dataset.value = s.WA_TMP_PAYMENT_CONFIRM || '';
  $('WA_TMP_TICKET_DELIVERY').dataset.value = s.WA_TMP_TICKET_DELIVERY || '';
  $('WA_TMP_SKOU_SALES').dataset.value      = s.WA_TMP_SKOU_SALES || '';

  // Yoco
  $('YOCO_MODE').value              = (s.YOCO_MODE||'sandbox').toLowerCase();
  $('YOCO_TEST_PUBLIC_KEY').value   = s.YOCO_TEST_PUBLIC_KEY || '';
  $('YOCO_TEST_SECRET_KEY').value   = s.YOCO_TEST_SECRET_KEY || '';
  $('YOCO_LIVE_PUBLIC_KEY').value   = s.YOCO_LIVE_PUBLIC_KEY || '';
  $('YOCO_LIVE_SECRET_KEY').value   = s.YOCO_LIVE_SECRET_KEY || '';
}

async function save(updates, msgEl){
  msgEl.textContent='Saving…';
  const r = await fetch('/api/admin/settings/update', {
    method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
    body: JSON.stringify({ updates })
  });
  const j = await r.json().catch(()=>({ok:false}));
  msgEl.textContent = j.ok ? 'Saved.' : 'Failed.';
}

$('saveGen').onclick = ()=>save({
  SITE_NAME: $('SITE_NAME').value,
  SITE_LOGO_URL: $('SITE_LOGO_URL').value,
  PUBLIC_BASE_URL: $('PUBLIC_BASE_URL').value,
  VERIFY_TOKEN: $('VERIFY_TOKEN').value,
}, $('msgGen'));

$('saveYoco').onclick = ()=>save({
  YOCO_MODE: $('YOCO_MODE').value,
  YOCO_TEST_PUBLIC_KEY: $('YOCO_TEST_PUBLIC_KEY').value,
  YOCO_TEST_SECRET_KEY: $('YOCO_TEST_SECRET_KEY').value,
  YOCO_LIVE_PUBLIC_KEY: $('YOCO_LIVE_PUBLIC_KEY').value,
  YOCO_LIVE_SECRET_KEY: $('YOCO_LIVE_SECRET_KEY').value,
}, $('msgYoco'));

$('saveWA').onclick = ()=>save({
  WHATSAPP_TOKEN: $('WHATSAPP_TOKEN').value,
  PHONE_NUMBER_ID: $('PHONE_NUMBER_ID').value,
  BUSINESS_ID: $('BUSINESS_ID').value,
  WA_TMP_ORDER_CONFIRM: $('WA_TMP_ORDER_CONFIRM').value,
  WA_TMP_PAYMENT_CONFIRM: $('WA_TMP_PAYMENT_CONFIRM').value,
  WA_TMP_TICKET_DELIVERY: $('WA_TMP_TICKET_DELIVERY').value,
  WA_TMP_SKOU_SALES: $('WA_TMP_SKOU_SALES').value,
}, $('msgWA'));

// --- Templates table + sync -----------------------------------------------
function optionLabel(t){
  const lang = (t.language||'').replace('_','-');
  return \`\${t.name} (\${lang})\`;
}

function fillSelectors(templates){
  const opts = ['<option value="">—</option>'].concat(
    templates.map(t=>\`<option value="\${t.name}:\${t.language}">\${optionLabel(t)}</option>\`)
  ).join('');

  for (const id of ['WA_TMP_ORDER_CONFIRM','WA_TMP_PAYMENT_CONFIRM','WA_TMP_TICKET_DELIVERY','WA_TMP_SKOU_SALES']){
    const sel = $(id);
    const prev = sel.dataset.value || '';
    sel.innerHTML = opts;
    if (prev) sel.value = prev;
  }
}

async function loadTemplates(){
  const box = $('waTable');
  box.textContent = 'Loading templates…';
  const r = await fetch('/api/admin/whatsapp/templates', { credentials:'include' });
  const j = await r.json().catch(()=>({ok:false}));
  if (!j.ok){ box.textContent='Failed to load.'; return; }
  const rows = j.templates || [];
  if (!rows.length){ box.textContent = 'No templates in database.'; fillSelectors([]); return; }

  fillSelectors(rows);

  box.innerHTML = \`
    <table>
      <thead><tr><th>Name</th><th>Language</th><th>Status</th><th>Category</th></tr></thead>
      <tbody>
        \${rows.map(t=>\`
          <tr>
            <td>\${t.name}</td>
            <td><span class="pill">\${t.language}</span></td>
            <td>\${t.status||''}</td>
            <td>\${t.category||''}</td>
          </tr>\`).join('')}
      </tbody>
    </table>\`;
}

$('syncWA').onclick = async ()=>{
  $('msgWA').textContent = 'Syncing…';
  const r = await fetch('/api/admin/whatsapp/sync', { method:'POST', credentials:'include' });
  const j = await r.json().catch(()=>({ok:false}));
  if (!j.ok){
    // try diag for actionable message
    const d = await fetch('/api/admin/whatsapp/diag', { credentials:'include' })
      .then(x=>x.json()).catch(()=>({}));
    const extra = d?.metaError?.message || d?.error || '';
    alert('Sync failed: ' + (j.error || 'unknown') + (extra ? ('\\n' + extra) : ''));
  }else{
    alert('Templates synced. Added/updated: ' + (j.fetched||0) + '. In DB: ' + (j.total||0));
  }
  $('msgWA').textContent='';
  loadTemplates();
};

// init
loadSettings().then(loadTemplates);
</script>
</body>
</html>`;
}

/* ✅ compatibility exports */
export const adminSiteSettingsJS = adminSiteSettingsHTML;
export default adminSiteSettingsHTML;
