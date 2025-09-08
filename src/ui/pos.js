// /src/ui/pos.js

/** --------------------------
 *  Start-shift screen (POS)
 *  -------------------------- */
export const posHTML = `<!doctype html><html lang="en">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
  *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:20px auto; padding:0 16px }
  .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
  h1{ margin:0 0 12px } .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
  input, select{ padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font:inherit; background:#fff }
  .btn{ padding:10px 14px; border-radius:10px; border:0; background:#0a7d2b; color:#fff; cursor:pointer; font-weight:600 }
  .btn.gray{ background:#e5e7eb; color:#111 }
  .muted{ color:var(--muted) } .error{ color:#b42318; font-weight:600; white-space:pre-wrap }
</style>
</head><body>
<div class="wrap">
  <h1>POS</h1>
  <div class="card">
    <h2 style="margin:0 0 10px">Start shift</h2>
    <div class="row" style="margin-bottom:10px">
      <input id="cashier" placeholder="Cashier name" style="min-width:220px"/>
      <select id="event" style="min-width:320px"></select>
      <select id="gate" style="min-width:200px"></select>
    </div>
    <div class="row">
      <div>
        <div class="muted" style="margin-bottom:4px">Opening float (R)</div>
        <input id="float" type="number" min="0" step="1" value="0" style="width:140px"/>
      </div>
      <div>
        <div class="muted" style="margin-bottom:4px">Cashier phone (optional)</div>
        <input id="cashier_msisdn" placeholder="+27…" style="width:200px"/>
      </div>
      <button id="startBtn" class="btn">Start</button>
      <div id="err" class="error"></div>
    </div>
  </div>
</div>

<script>
const $ = (id)=>document.getElementById(id);
const cents = (r)=> Math.max(0, Math.round(Number(r||0)*100));
async function safeJson(res){
  try { return await res.json(); }
  catch { const t = await res.text().catch(()=> ''); return { ok:false, error:t||('HTTP '+res.status) }; }
}

async function load() {
  $('err').textContent = '';
  $('event').innerHTML = '<option>Loading…</option>';
  $('gate').innerHTML = '<option>Loading…</option>';
  try {
    const r = await fetch('/api/pos/bootstrap', { headers:{ 'accept':'application/json' } });
    const j = await safeJson(r);
    if (!j.ok) throw new Error(j.error || 'bootstrap failed');

    $('event').innerHTML = (j.events||[]).map(e =>
      \`<option value="\${e.id}">\${e.name} (\${e.slug})</option>\`
    ).join('') || '<option value="0">No events</option>';

    $('gate').innerHTML = (j.gates||[]).map(g =>
      \`<option value="\${g.id}">\${g.name}</option>\`
    ).join('') || '<option value="0">No gates</option>';
  } catch (e) {
    $('err').textContent = 'Error: ' + (e.message || 'network');
  }
}

$('startBtn').onclick = async () => {
  $('err').textContent = '';
  const cashier_name = ($('cashier').value || '').trim();
  const event_id = Number(($('event').value || '0'));
  const gate_id = Number(($('gate').value || '0'));
  const opening_float_cents = cents($('float').value);
  const cashier_msisdn = ($('cashier_msisdn').value || '').trim();

  if (!cashier_name) return $('err').textContent = 'cashier name required';
  if (!event_id) return $('err').textContent = 'event required';
  if (!gate_id) return $('err').textContent = 'gate required';

  try {
    const r = await fetch('/api/pos/session/open', {
      method:'POST',
      headers:{ 'content-type':'application/json', 'accept':'application/json' },
      body: JSON.stringify({ cashier_name, event_id, gate_id, opening_float_cents, cashier_msisdn })
    });
    const j = await safeJson(r);
    if (!j.ok) throw new Error(j.error || 'unknown');

    const sid = j.session_id;
    if (sid) location.href = '/pos/sell?session_id=' + encodeURIComponent(sid);
    else $('err').textContent = 'Error: missing session id';
  } catch (e) {
    $('err').textContent = 'Error: ' + (e.message || 'unknown');
  }
};

load();
</script>
</body></html>`;

/** --------------------------
 *  Sell screen (with cash-out)
 *  -------------------------- */
export function posSellHTML(sessionId) {
  const sid = String(sessionId || "");
  return `<!doctype html><html lang="en">
  <head>
  <meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>POS · Sell</title>
  <style>
    :root{ --green:#0a7d2b; --muted:#667085; --bg:#f7f7f8; }
    *{ box-sizing:border-box } body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
    .wrap{ max-width:1200px; margin:20px auto; padding:0 16px }
    .card{ background:#fff; border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:18px }
    .topbar{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px }
    .muted{ color:var(--muted) } .error{ color:#b42318; font-weight:600; white-space:pre-wrap }
    .btn{ padding:10px 14px; border-radius:10px; border:0; background:#0a7d2b; color:#fff; cursor:pointer; font-weight:600 }
    .btn.gray{ background:#e5e7eb; color:#111 }
    a{ color:var(--green); text-decoration:none }
    .grid{ display:grid; grid-template-columns: 2fr 1fr; gap:14px }
    @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }
    .pill{ display:inline-block; padding:4px 10px; border-radius:999px; background:#ecfdf3; color:#065f46; font-weight:600; font-size:13px }
  </style>
  </head><body>
  <div class="wrap">
    <div class="topbar">
      <div>
        <h1 style="margin:0 0 4px">POS</h1>
        <div class="muted">Session <span id="sid">${sid}</span> · <span id="clock"></span></div>
      </div>
      <div>
        <button id="cashOutBtn" class="btn gray" title="Close session and cash out">Close / Cash-out</button>
      </div>
    </div>

    <div id="msg" class="card" style="display:none"></div>

    <div class="grid">
      <div class="card">
        <div class="muted" style="margin-bottom:6px">Ticket buttons, recall by code, and cart go here.</div>
        <p class="muted" style="margin:0">We’ll wire this next.</p>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-weight:700">Total</div>
          <div class="pill" id="totalPill">R0.00</div>
        </div>
        <button class="btn" style="width:100%;margin-bottom:8px" disabled>Cash</button>
        <button class="btn" style="width:100%;background:#111" disabled>Card</button>
        <div class="muted" style="margin-top:10px"><a href="/pos">← Back to start</a></div>
        <div id="err" class="error" style="margin-top:8px"></div>
      </div>
    </div>
  </div>

  <script>
    // Live clock
    const clk = document.getElementById('clock');
    function tick(){ const d=new Date(); clk.textContent = d.toLocaleString('af-ZA'); }
    tick(); setInterval(tick, 1000);

    const sid = '${sid}';
    const $err = document.getElementById('err');
    const $msg = document.getElementById('msg');

    async function safeJson(res){
      try { return await res.json(); }
      catch { const t = await res.text().catch(()=> ''); return { ok:false, error:t||('HTTP '+res.status) }; }
    }

    // Cash-out / Close session
    document.getElementById('cashOutBtn').onclick = async () => {
      $err.textContent = '';
      const manager = prompt('Manager name to close this session:','');
      if (manager===null) return; // cancelled
      try{
        const r = await fetch('/api/pos/session/close', {
          method:'POST',
          headers:{ 'content-type':'application/json', 'accept':'application/json' },
          body: JSON.stringify({ session_id: Number(sid), closing_manager: (manager||'').trim() })
        });
        const j = await safeJson(r);
        if(!j.ok) throw new Error(j.error||'close failed');

        $msg.style.display='block';
        $msg.innerHTML = '<div class="pill">Session closed</div><div class="muted" style="margin-top:6px">You can start a new shift when ready.</div>';
        setTimeout(()=>{ location.href = '/pos'; }, 1000);
      }catch(e){
        $err.textContent = 'Error: ' + (e.message||'unknown');
      }
    };
  </script>
  </body></html>`;
}
