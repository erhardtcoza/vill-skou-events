// /src/ui/checkout.js
export const checkoutHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout</title>
<style>
  :root{ --green:#0a7d2b; --muted:#667085; --bg:#f5f7f8 }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:#111 }
  .wrap{ max-width:1100px; margin:22px auto; padding:0 14px }
  h1{ font-size:40px; margin:0 0 16px }
  .grid{ display:grid; grid-template-columns:1.1fr .9fr; gap:16px }
  @media (max-width:960px){ .grid{ grid-template-columns:1fr; } }
  .card{ background:#fff; border-radius:14px; padding:16px; box-shadow:0 10px 26px rgba(0,0,0,.06) }
  .chip{ display:inline-block; padding:6px 12px; border-radius:999px; font-weight:700; background:#eaf7ee; color:#0a7d2b; margin-bottom:8px }

  .row{ display:grid; grid-template-columns:1fr 1fr; gap:12px }
  @media (max-width:720px){ .row{ grid-template-columns:1fr; } }
  label{ display:block; font-size:13px; color:#444; margin:6px 0 6px }
  input,select{ width:100%; padding:14px 12px; border-radius:12px; border:1px solid #e5e7eb; background:#fff; font-size:16px; }
  .muted{ color:#667085 }

  .btn{ padding:12px 16px; border-radius:12px; border:0; cursor:pointer; font-weight:700 }
  .btn.primary{ background:var(--green); color:#fff }
  .btn.ghost{ background:#2d2d2d; color:#ddd }
  .btn:disabled{ opacity:.6; cursor:not-allowed }

  .rightItem{ display:flex; justify-content:space-between; margin:10px 0 }
  .total{ font-weight:800; font-size:22px; text-align:right }

  .att{ border:1px solid #eef0f2; border-radius:12px; padding:12px; margin-top:10px; }
  .att h3{ margin:0 0 8px; font-size:16px }
  .seg{ height:10px }
</style>
</head><body>
<div class="wrap">
  <h1>Checkout</h1>
  <div class="grid">
    <div class="card" id="left">Loading…</div>
    <div class="card" id="right">Loading…</div>
  </div>
</div>

<script>
const SLUG = ${JSON.stringify(slug)};

// ----- helpers
const R = c => "R" + ((c||0)/100).toFixed(2);
const esc = s => String(s||"").replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function normalizePhone(v){
  const d = String(v||"").replace(/\\D+/g,"");
  if (!d) return "";
  if (d.startsWith("27") && d.length===11) return d;
  if (d.startsWith("0")  && d.length===10) return "27" + d.slice(1);
  if (d.startsWith("27") && d.length>11)  return d.slice(0,11);
  if (d.length===9) return "27"+d;
  return d;
}

let EVENT = null;
let CART  = null; // {event_id, items:[{ticket_type_id, qty}]}
let TTMAP = new Map();

async function load(){
  // cart from sessionStorage
  try { CART = JSON.parse(sessionStorage.getItem("pending_cart")||""); } catch { CART = null; }
  if (!CART){
    document.getElementById("left").innerHTML = "Geen items in mandjie nie.";
    document.getElementById("right").innerHTML = "";
    return;
  }

  // event + ticket types
  const res = await fetch("/api/public/events/"+encodeURIComponent(SLUG))
    .then(r=>r.json()).catch(()=>({ok:false}));
  if (!res.ok){
    document.getElementById("left").innerHTML = "Kon nie event laai nie.";
    document.getElementById("right").innerHTML = "";
    return;
  }
  EVENT = res.event || {};
  TTMAP = new Map((res.ticket_types||[]).map(t=>[Number(t.id), t]));

  renderLeft();
  renderRight();
}

function attendeeBlock(tt, idx){
  const key = tt.id + ":" + (idx+1);
  return `
  <div class="att">
    <h3>${esc(tt.name)} <span class="muted">#${idx+1}</span></h3>
    <div class="row">
      <div><label>Naam en Van<input data-att="name" data-key="${key}" placeholder="Naam en Van"/></label></div>
      <div>
        <label>Geslag
          <select data-att="gender" data-key="${key}">
            <option value="male">Manlik</option>
            <option value="female">Vroulik</option>
            <option value="other">Ander</option>
          </select>
        </label>
      </div>
    </div>
    <div class="row">
      <div><label>Telefoon vir aflewering
        <input data-att-phone data-att="phone" data-key="${key}" placeholder="Selfoon (bv. 2771…)"/>
      </label></div>
      <div></div>
    </div>
    <input type="hidden" data-att="type" data-key="${key}" value="${tt.id}"/>
  </div>`;
}

function renderLeft(){
  const left = document.getElementById("left");
  const items = CART.items||[];

  const blocks = [];
  for (const it of items){
    const tt = TTMAP.get(Number(it.ticket_type_id));
    if (!tt) continue;
    for (let i=0;i<Number(it.qty||0);i++){
      blocks.push(attendeeBlock(tt, i));
    }
  }

  left.innerHTML = `
    <div class="chip">${esc(EVENT.name||"")}</div>
    <div class="seg"></div>
    <h2 style="margin:0 0 8px;">Koper inligting</h2>
    <div class="row">
      <div><label>Naam<input id="buyerFirst" autocomplete="given-name" placeholder="Naam"/></label></div>
      <div><label>Van<input id="buyerLast" autocomplete="family-name" placeholder="Van"/></label></div>
    </div>
    <div class="row">
      <div><label>E-pos<input id="buyerEmail" type="email" autocomplete="email" placeholder="E-pos"/></label></div>
      <div><label>Selfoon<input id="buyerPhone" inputmode="tel" placeholder="Selfoon (bv. 2771…)"/></label></div>
    </div>
    <div class="seg"></div>
    ${blocks.length ? '<h2 style="margin:8px 0;">Besoeker inligting</h2>' : ''}
    <div id="attendees">${blocks.join("")}</div>
    <div class="seg"></div>
    <div class="row">
      <button id="payNow"  class="btn primary">Pay now</button>
      <button id="payLater" class="btn ghost">(Pay at event)</button>
    </div>
    <p class="muted" style="margin-top:10px">
      Jou kaartjies sal via WhatsApp en Epos eersdaags gestuur word sodra betaling ontvang was.
    </p>
  `;

  const bPhone = document.getElementById("buyerPhone");
  bPhone.addEventListener("blur", ()=>{
    const n = normalizePhone(bPhone.value);
    bPhone.value = n;
    document.querySelectorAll('[data-att-phone]').forEach(inp=>{
      if (!inp.dataset.touched) inp.value = n;
    });
  });
  document.querySelectorAll('[data-att-phone]').forEach(inp=>{
    inp.addEventListener("input", ()=>{ inp.dataset.touched = "1"; });
    inp.addEventListener("blur", ()=>{ inp.value = normalizePhone(inp.value); });
  });

  document.getElementById("payNow").onclick  = ()=> submitOrder("pay_now");
  document.getElementById("payLater").onclick = ()=> submitOrder("pay_at_event");
}

function renderRight(){
  const right = document.getElementById("right");
  const items = CART.items||[];
  let total = 0;

  const lines = items.map(it=>{
    const tt = TTMAP.get(Number(it.ticket_type_id)) || {name:"", price_cents:0};
    const qty = Number(it.qty||0);
    const line = qty * Number(tt.price_cents||0);
    total += line;
    return `<div class="rightItem"><div>${esc(tt.name)} <span class="muted">× ${qty}</span></div><div>${R(line)}</div></div>`;
  }).join("");

  right.innerHTML = `
    ${lines || '<div class="muted">Geen items in mandjie nie.</div>'}
    <hr style="border:0;border-top:1px solid #f0f0f0;margin:10px 0">
    <div class="rightItem"><div style="font-weight:800">Totaal</div><div class="total">${R(total)}</div></div>
  `;
}

function readAttendees(){
  const out = [];
  document.querySelectorAll('[data-att="type"]').forEach(hidden=>{
    const key = hidden.dataset.key;
    const typeId = Number(hidden.value);
    const name = (document.querySelector('[data-att="name"][data-key="'+key+'"]').value||"").trim();
    const gender = document.querySelector('[data-att="gender"][data-key="'+key+'"]').value;
    const phoneRaw = document.querySelector('[data-att="phone"][data-key="'+key+'"]').value;
    const phone = normalizePhone(phoneRaw);
    const parts = name.split(/\\s+/,2);
    out.push({
      ticket_type_id:typeId,
      attendee_first: parts[0]||"",
      attendee_last:  parts[1]||"",
      gender, phone
    });
  });
  return out;
}

async function submitOrder(method){
  const buyerFirst = document.getElementById("buyerFirst").value.trim();
  const buyerLast  = document.getElementById("buyerLast").value.trim();
  const buyerName  = (buyerFirst + " " + buyerLast).trim();
  const buyerEmail = document.getElementById("buyerEmail").value.trim();
  const buyerPhone = normalizePhone(document.getElementById("buyerPhone").value);

  if (!buyerName){ alert("Vul asseblief jou naam in."); return; }

  const payload = {
    event_id: CART.event_id,
    items: CART.items,
    buyer_name: buyerName,
    email: buyerEmail,
    phone: buyerPhone,
    method,
    attendees: readAttendees()
  };

  const r = await fetch("/api/public/orders/create", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify(payload)
  }).then(r=>r.json()).catch(()=>({ok:false, error:"Netwerk fout"}));

  if (!r.ok){ alert("Misluk: " + (r.error||"Kon nie bestel nie")); return; }

  alert("Bestelling aangemaak: " + r.order.short_code);
  sessionStorage.removeItem("pending_cart");
  location.href = "/";
}

load();
</script>
</body></html>`;
