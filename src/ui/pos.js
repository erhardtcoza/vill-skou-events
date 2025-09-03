// /src/ui/pos.js
export function posHTML() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>POS · Villiersdorp Skou</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
  <style>
    body { max-width: 1100px; margin: 0 auto; }
    .row { display: flex; gap: 12px; align-items: center; }
    .grow { flex: 1 1 auto; }
    .w-180 { width: 180px; }
    .mt { margin-top: 16px; }
    .error { color: #b00020; font-weight: 600; }
    .ok { color: #0a7a2f; font-weight: 600; }
  </style>
</head>
<body>
  <main class="container">
    <h1>POS</h1>

    <section id="shift">
      <h3>Start shift</h3>
      <div class="row">
        <input id="cashier" class="grow" placeholder="Cashier name" />
        <select id="event" class="w-180"></select>
        <select id="gate" class="w-180"></select>
      </div>
      <div class="row mt">
        <label class="w-180">
          Opening float (R)
          <input id="floatR" type="number" min="0" step="1" value="0" />
        </label>
        <button id="btnStart">Start</button>
        <span id="msg" class="error"></span>
      </div>
    </section>

    <section id="work" style="display:none">
      <p class="ok">Session started. (ID: <span id="sid"></span>)</p>
      <!-- The rest of the POS UI (cart, keypad, settle, etc.) can mount here -->
    </section>
  </main>

<script>
const selEvent = document.getElementById('event');
const selGate  = document.getElementById('gate');
const inpName  = document.getElementById('cashier');
const inpFloat = document.getElementById('floatR');
const btnStart = document.getElementById('btnStart');
const msg      = document.getElementById('msg');
const secShift = document.getElementById('shift');
const secWork  = document.getElementById('work');
const spanSid  = document.getElementById('sid');

async function api(path) {
  const r = await fetch(path, { headers: { 'accept': 'application/json' }});
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.error || 'unknown');
  return j;
}

function fillEvents(list) {
  selEvent.innerHTML = list.map(e => 
    '<option value="'+e.id+'">'+e.name+' ('+e.slug+')</option>'
  ).join('');
}

function fillGates(list) {
  selGate.innerHTML = list.map(g => 
    '<option value="'+g.id+'">'+g.name+'</option>'
  ).join('');
}

async function bootstrap() {
  msg.textContent = '';
  try {
    const j = await api('/api/pos/bootstrap');
    fillEvents(j.events || []);
    fillGates(j.gates || []);
  } catch (e) {
    msg.textContent = 'Error: ' + e.message;
  }
}

// Load gates when event changes
selEvent.addEventListener('change', async () => {
  msg.textContent = '';
  const eid = Number(selEvent.value || 0);
  if (!eid) { selGate.innerHTML = ''; return; }
  try {
    const j = await api('/api/pos/gates/' + eid);
    fillGates(j.gates || []);
  } catch (e) {
    msg.textContent = 'Error: ' + e.message;
  }
});

async function startShift() {
  msg.textContent = '';
  const cashier_name = inpName.value.trim();
  const event_id = Number(selEvent.value || 0);
  const gate_id  = Number(selGate.value || 0);
  const opening_float_rands = Number(inpFloat.value || 0);
  const opening_float_cents = Math.round(Math.max(0, opening_float_rands) * 100);

  if (!cashier_name) { msg.textContent = 'Error: cashier_name required'; return; }
  if (!event_id) { msg.textContent = 'Error: event_id required'; return; }
  if (!gate_id) { msg.textContent = 'Error: gate_id required'; return; }

  try {
    const r = await fetch('/api/pos/session/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cashier_name, event_id, gate_id, opening_float_cents })
    });
    const j = await r.json().catch(()=>({}));
    if (!j.ok) throw new Error(j.error || 'unknown');
    spanSid.textContent = j.session_id;
    secShift.style.display = 'none';
    secWork.style.display  = '';
  } catch (e) {
    msg.textContent = 'Error: ' + e.message;
  }
}

btnStart.addEventListener('click', startShift);
bootstrap();
</script>
</body>
</html>`;
}
