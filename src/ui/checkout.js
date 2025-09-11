// /src/ui/checkout.js
export function checkoutHTML(slug) {
  return `<!doctype html>
<html lang="af">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Checkout</title>
  <style>
    :root { --bg:#f6f8f7; --card:#fff; --ink:#0b1320; --muted:#6c7a7a; --accent:#0a7d2b; }
    body{margin:0;background:var(--bg);color:var(--ink);
         font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif}
    .wrap{max-width:960px;margin:auto;padding:20px 14px}
    h1{font-size:clamp(26px,4vw,36px);margin:0 0 16px}
    .grid{display:grid;grid-template-columns:1fr 360px;gap:18px}
    @media (max-width:900px){ .grid{grid-template-columns:1fr} }
    .card{background:var(--card);border-radius:14px;padding:14px;box-shadow:0 8px 18px rgba(0,0,0,.06)}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .row3{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    label{display:block;font-size:13px;color:var(--muted);margin:8px 0 4px}
    input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d8dfde;border-radius:10px;background:#fbfdfc}
    .btn{display:inline-block;background:var(--accent);color:#fff;border:none;border-radius:10px;
         padding:12px 16px;font-weight:700;cursor:pointer}
    .btn.gray{background:#141a22}
    .btn[disabled]{opacity:.6;cursor:not-allowed}
    .small{font-size:13px;color:var(--muted)}
    .line{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #e6ecea}
    .line:last-child{border-bottom:0}
    .price{font-variant-numeric:tabular-nums}
    .err{color:#b00020;margin-top:8px}
    .tag{display:inline-block;background:#eef6f0;color:#155a2d;border-radius:999px;padding:3px 8px;font-size:12px}
  </style>
</head>
<body>
<div class="wrap">
  <h1>Checkout</h1>

  <div class="grid">
    <div class="card" id="left">Loading...</div>
    <div class="card" id="right">Loading...</div>
  </div>
</div>

<script>
const slug = ${JSON.stringify(slug)};
const fmtR = cents => 'R' + (Math.round(cents)/100).toFixed(2);
const $ = s => document.querySelector(s);

function getCartCandidates(sl) {
  return [
    'cart:'+sl,
    'cart:'+sl+':v1',
    'cart',           // legacy plain
    'shop_cart'       // fallback some UIs use
  ];
}
function readCart(sl) {
  for (const key of getCartCandidates(sl)) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) continue;
      const normalized = arr.map(x => ({
        ticket_type_id: Number(x.ticket_type_id ?? x.id ?? x.tt_id ?? 0),
        qty: Number(x.qty ?? x.count ?? x.quantity ?? 0)
      })).filter(x => x.ticket_type_id && x.qty > 0);
      if (normalized.length) return normalized;
    } catch {}
  }
  return [];
}

function renderLeft(ev) {
  $('#left').innerHTML = \`
    <div class="tag">\${ev.name}</div>
    <div class="row">
      <div>
        <label>Naam</label>
        <input id="first" placeholder="Naam"/>
      </div>
      <div>
        <label>Van</label>
        <input id="last" placeholder="Van"/>
      </div>
    </div>
    <div class="row3" style="margin-top:8px;">
      <div>
        <label>E-pos</label>
        <input id="email" placeholder="E-pos"/>
      </div>
      <div>
        <label>Selfoon</label>
        <input id="phone" placeholder="Selfoon (bv. 2771…)" />
      </div>
    </div>
    <div style="margin-top:14px;display:flex;gap:10px;">
      <button id="payNow" class="btn">Pay now</button>
      <button id="payAt"  class="btn gray">(Pay at event)</button>
    </div>
    <div class="small" style="margin-top:10px;">
      Jou kaartjies sal via WhatsApp en Epos eersdaags gestuur word sodra betaling ontvang was.
    </div>
    <div id="err" class="err"></div>
  \`;
}

function renderRight(ttMap, items) {
  const right = $('#right');
  if (!items.length) { right.innerHTML = 'Geen items in mandjie nie.'; return; }

  let total = 0;
  const lines = items.map(it => {
    const tt = ttMap.get(it.ticket_type_id);
    const price = Number(tt?.price_cents || 0);
    const qty = Number(it.qty || 0);
    const line = price * qty; total += line;
    const name = tt ? tt.name : ('Type #'+it.ticket_type_id);
    return \`
      <div class="line">
        <div>\${name} × \${qty}</div>
        <div class="price">\${fmtR(line)}</div>
      </div>\`;
  }).join('');

  right.innerHTML = \`
    <div style="font-weight:800;margin-bottom:8px;">Jou keuse</div>
    \${lines}
    <div class="line" style="font-weight:900;">
      <div>Totaal</div>
      <div class="price">\${fmtR(total)}</div>
    </div>
    <div class="small" style="margin-top:6px;">
      Let wel: pryse word bevestig en herbereken op die volgende stap.
    </div>
  \`;
}

function showError(msg) { const el = $('#err'); if (el) el.textContent = msg || 'Onbekende fout'; }

async function boot() {
  // Load event
  let ev;
  try {
    const res = await fetch('/api/public/events/'+encodeURIComponent(slug), { credentials:'include' });
    const json = await res.json();
    if (!json.ok) throw new Error('not ok');
    ev = json.event;
    var ttList = json.ticket_types || [];
  } catch {
    $('#left').textContent = 'Kon nie laai nie';
    $('#right').textContent = '';
    return;
  }

  const ttMap = new Map(ttList.map(r => [Number(r.id), r]));
  const items = readCart(slug);

  renderLeft(ev);
  renderRight(ttMap, items);

  if (!items.length) {
    $('#payNow').disabled = true; $('#payAt').disabled = true;
  }

  const submit = async(kind) => {
    showError('');
    const first = ($('#first')?.value || '').trim();
    const last  = ($('#last')?.value  || '').trim();
    const email = ($('#email')?.value || '').trim();
    const phone = ($('#phone')?.value || '').trim();
    if (!first) return showError('Vul asseblief jou naam in.');
    const buyer_name = (first + ' ' + last).trim();

    const payload = {
      event_id: Number(ev.id),
      buyer_name, email, phone,
      items: items.map(x => ({ ticket_type_id: x.ticket_type_id, qty: x.qty })),
      method: (kind === 'now') ? 'pay_now' : 'pay_at_event'
    };

    let out;
    try {
      const res = await fetch('/api/public/orders/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      out = await res.json();
    } catch { return showError('Netwerkfout: kon nie stuur nie.'); }

    if (!out?.ok) return showError(out?.error || 'Kon nie bestelling skep nie.');

    try { localStorage.removeItem('cart:'+slug); localStorage.removeItem('cart:'+slug+':v1'); } catch {}
    const code = out.order?.short_code;
    if (code) location.href = '/t/' + encodeURIComponent(code);
    else showError('Bestelling geskep maar sonder kode.');
  };

  $('#payNow').addEventListener('click', () => submit('now'));
  $('#payAt').addEventListener('click',  () => submit('event'));
}
boot();
</script>
</body>
</html>`;
}
