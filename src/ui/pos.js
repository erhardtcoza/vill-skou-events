// /src/ui/pos.js
export function posHTML() {
  return /*html*/ `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>POS · Villiersdorp Skou</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root{--green:#1f7a37;--gray:#eef1f4;--text:#111}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial,sans-serif;margin:0;background:#fff;color:var(--text)}
    .wrap{max-width:1000px;margin:32px auto;padding:0 16px}
    h1{font-size:28px;margin:0 0 20px}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
    .row{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px}
    .row .full{grid-column:1/-1}
    label{display:block;font-size:13px;color:#4b5563;margin:0 0 6px}
    input[type="text"], input[type="number"], select{
      width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;font-size:14px
    }
    button{border:0;border-radius:10px;background:#e5e7eb;padding:10px 14px;font-weight:600;cursor:pointer}
    .primary{background:var(--green);color:#fff}
    .pill{border-radius:999px;padding:8px 14px}
    .mt16{margin-top:16px}.mt24{margin-top:24px}.mt32{margin-top:32px}
    .error{color:#b91c1c;font-weight:600;margin-top:10px}
    .ok{color:#065f46;font-weight:600;margin-top:10px}
    .hidden{display:none}
    .topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
    .tiny{font-size:12px;color:#6b7280}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <h1>POS</h1>
      <div id="sessionBadge" class="tiny"></div>
    </div>

    <!-- Start shift -->
    <div class="card" id="startCard">
      <h2 style="margin:0 0 12px">Start shift</h2>
      <div class="row">
        <div>
          <label>Cashier name</label>
          <input id="cashierName" type="text" placeholder="e.g. John" />
        </div>

        <div>
          <label>Event</label>
          <select id="eventSelect"></select>
        </div>

        <div>
          <label>Gate</label>
          <select id="gateSelect"></select>
        </div>

        <div>
          <label>Opening float (R)</label>
          <input id="openingFloat" type="number" min="0" step="1" value="0" />
        </div>
      </div>
      <div class="mt16">
        <button id="startBtn" class="primary pill">Start</button>
        <span id="startMsg" class="error"></span>
      </div>
    </div>

    <!-- Active shift placeholder -->
    <div class="card mt24 hidden" id="shiftCard">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2 style="margin:0">Selling</h2>
        <div>
          <button id="endShiftBtn" class="pill">End shift</button>
        </div>
      </div>
      <p class="tiny">Shift is open. (Buttons for quick ticket selling will go here.)</p>
    </div>
  </div>

<script type="module">
const $ = (s) => document.querySelector(s);
const startCard = $('#startCard');
const shiftCard = $('#shiftCard');
const startMsg = $('#startMsg');
const sessBadge = $('#sessionBadge');

let bootstrap = { events: [], gates: [] };
let activeSessionId = null;

async function api(path, opts={}) {
  const r = await fetch(path, {
    credentials: 'include',
    ...opts
  });
  if (r.status === 401) {
    // not signed in as POS
    location.href = '/pos/login';
    return;
  }
  return r;
}

function setError(msg) {
  startMsg.className = 'error';
  startMsg.textContent = msg || '';
}

function setOk(msg) {
  startMsg.className = 'ok';
  startMsg.textContent = msg || '';
}

function centsFromRand(v) {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function showSessionBadge(name, gate) {
  sessBadge.textContent = activeSessionId
    ? \`Session #\${activeSessionId} • \${name} @ \${gate}\`
    : '';
}

async function loadBootstrap() {
  try {
    const r = await api('/api/pos/bootstrap');
    if (!r) return; // redirected
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load');
    bootstrap = data;

    // Populate events
    const es = $('#eventSelect');
    es.innerHTML = '';
    (bootstrap.events || []).forEach(ev => {
      const opt = document.createElement('option');
      opt.value = ev.id;
      opt.textContent = \`\${ev.name} (\${ev.slug})\`;
      es.appendChild(opt);
    });

    // Populate gates
    const gs = $('#gateSelect');
    gs.innerHTML = '';
    (bootstrap.gates || []).forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.name;
      opt.textContent = g.name;
      gs.appendChild(opt);
    });
  } catch (e) {
    setError('Network / bootstrap error');
  }
}

async function openSession() {
  setError('');
  setOk('');

  const cashier_name = $('#cashierName').value.trim();
  const event_id = Number($('#eventSelect').value || 0);
  const gate_name = $('#gateSelect').value;
  const opening_float_cents = centsFromRand($('#openingFloat').value);

  if (!cashier_name) return setError('Please enter cashier name');
  if (!event_id)     return setError('Please select event');
  if (!gate_name)    return setError('Please select gate');

  try {
    const r = await api('/api/pos/session/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cashier_name, event_id, gate_name, opening_float_cents })
    });
    if (!r) return;
    const data = await r.json().catch(() => ({}));

    if (!r.ok || !data.ok) {
      // try to show server message
      const msg = (data && (data.error || data.message)) || (await r.text().catch(()=>'')) || 'Unknown';
      return setError('Error: ' + msg);
    }

    activeSessionId = data.session_id;
    setOk('Shift started');
    startCard.classList.add('hidden');
    shiftCard.classList.remove('hidden');
    showSessionBadge(cashier_name, gate_name);
  } catch (e) {
    setError('Network error');
  }
}

async function endSession() {
  if (!activeSessionId) return;
  try {
    const r = await api('/api/pos/session/close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: activeSessionId })
    });
    const data = await r.json().catch(()=>({}));
    if (!r.ok || !data.ok) {
      const msg = (data && (data.error || data.message)) || 'Unknown';
      alert('End shift failed: ' + msg);
      return;
    }
    activeSessionId = null;
    shiftCard.classList.add('hidden');
    startCard.classList.remove('hidden');
    sessBadge.textContent = '';
    setOk('Shift closed');
  } catch (e) {
    alert('Network error while closing shift');
  }
}

$('#startBtn').addEventListener('click', openSession);
$('#endShiftBtn').addEventListener('click', endSession);

loadBootstrap();
</script>
</body>
</html>
`;
}
