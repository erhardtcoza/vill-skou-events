// /src/ui/checkout.js
export const checkoutHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout</title>
<style>
  :root{--green:#1f7a33;--bg:#f6f7f9}
  body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;background:var(--bg)}
  .wrap{max-width:1100px;margin:18px auto;padding:16px}
  h1{margin:6px 0 16px}
  a{color:#111;text-decoration:none}
  .muted{color:#6b7280}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px}
  .grid{display:grid;grid-template-columns:1fr 360px;gap:14px}
  .row{display:flex;gap:10px;flex-wrap:wrap}
  input,button{padding:10px;border:1px solid #d1d5db;border-radius:10px;background:#fff}
  button.primary{background:var(--green);color:#fff;border-color:var(--green)}
  .sumRow{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #f0f0f0}
  .total{font-size:28px;font-weight:800}
  .ok{color:#0a7d2b}
  .err{color:#b00020}
</style>
</head><body><div class="wrap">
  <div class="row" style="align-items:center;gap:12px;margin-bottom:6px">
    <a href="/shop/${slug}" class="muted">← Terug na event</a>
  </div>
  <h1>Checkout</h1>

  <div class="grid">
    <section class="card">
      <h2>Jou besonderhede</h2>
      <div class="row">
        <input id="first" placeholder="Naam" style="flex:1"/>
        <input id="last" placeholder="Van" style="flex:1"/>
      </div>
      <div class="row" style="margin-top:8px">
        <input id="email" placeholder="E-pos" style="flex:1"/>
        <input id="phone" placeholder="Selfoon" style="flex:1"/>
      </div>
      <div class="row" style="margin-top:10px">
        <button id="payNow"  class="primary">Pay now</button>
        <button id="payLater" class="">{Pay at event}</button>
        <span id="msg" class="muted" style="align-self:center"></span>
      </div>
    </section>

    <aside class="card">
      <h2>Jou keuse</h2>
      <div id="lines" class="muted">Geen kaartjies gekies nie.</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <div class="muted">Totaal</div>
        <div id="tot" class="total">R0.00</div>
      </div>
      <p class="muted" style="margin-top:10px">Let wel: pryse word bevestig en herbereken op die volgende stap.</p>
    </aside>
  </div>
</div>

<script>
const slug = ${JSON.stringify(slug)};
let CATALOG=null;    // { ticket_types: [...] }
let CART=null;       // [{ticket_type_id, qty}...]

const fmtR = c => "R"+(c/100).toFixed(2);

function readCartFromStorage(){
  const keys = [
    "vs_cart_"+slug, "vs_cart_"+slug, // (dup for readability)
    "vs_cart", "vs_cart"
  ];
  // Session first
  for (const k of [ "vs_cart_"+slug, "vs_cart" ]) {
    const v = sessionStorage.getItem(k);
    if (v) { try { const parsed = JSON.parse(v); if (Array.isArray(parsed)) return parsed; } catch{} }
  }
  // Then local
  for (const k of [ "vs_cart_"+slug, "vs_cart" ]) {
    const v = localStorage.getItem(k);
    if (v) { try { const parsed = JSON.parse(v); if (Array.isArray(parsed)) return parsed; } catch{} }
  }
  // URL ?cart= (json or base64 json)
  const u = new URL(location.href);
  const raw = u.searchParams.get("cart");
  if (raw){
    try {
      const decoded = decodeURIComponent(raw);
      const maybeB64 = /^[A-Za-z0-9+/=]+$/.test(decoded) ? atob(decoded) : decoded;
      const parsed = JSON.parse(maybeB64);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

async function loadCatalog(){
  const res = await fetch("/api/public/events/"+encodeURIComponent(slug));
  const data = await res.json().catch(()=>({ok:false}));
  if (!res.ok || !data.ok) throw new Error(data.error||("HTTP "+res.status));
  return data; // {event, ticket_types:[{id,name,price_cents}], ...}
}

function summarize(){
  const lines = document.getElementById("lines");
  const totEl = document.getElementById("tot");
  if (!CART || !Array.isArray(CART) || CART.length===0){
    lines.textContent = "Geen kaartjies gekies nie.";
    totEl.textContent = "R0.00";
    return;
  }
  const byId = new Map((CATALOG.ticket_types||[]).map(tt=>[tt.id, tt]));
  let total = 0;
  lines.innerHTML = CART.map(it=>{
    const tt = byId.get(it.ticket_type_id);
    const price = (tt?.price_cents||0) * (it.qty||0);
    total += price;
    const name = tt?.name || ("Ticket #"+it.ticket_type_id);
    return \`<div class="sumRow"><div>\${name} × \${it.qty}</div><div class="muted">\${fmtR(price)}</div></div>\`;
  }).join("");
  totEl.textContent = fmtR(total);
}

async function postCheckout(mode){
  const msg = document.getElementById("msg");
  msg.textContent = "";
  if (!CART || !CART.length){ msg.textContent = "Kies ten minste één kaartjie."; return; }

  const b = {
    mode: mode, // 'pay_now' | 'pay_later'
    event_id: CATALOG.event.id,
    items: CART,
    buyer_name: (document.getElementById("first").value||"").trim() + " " + (document.getElementById("last").value||"").trim(),
    buyer_email: (document.getElementById("email").value||"").trim(),
    buyer_phone: (document.getElementById("phone").value||"").trim()
  };

  try{
    const r = await fetch("/api/public/checkout", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify(b)
    });
    const data = await r.json().catch(()=>({ok:false,error:"Bad JSON"}));
    if (!r.ok || !data.ok){ msg.className="err"; msg.textContent = "Error: "+(data.error||("HTTP "+r.status)); return; }

    // Success flows:
    if (mode === "pay_later"){
      // clear cart storages for this slug
      sessionStorage.removeItem("vs_cart_"+slug);
      localStorage.removeItem("vs_cart_"+slug);
      msg.className="ok";
      msg.innerHTML = \`Bestelling geskep. Jou bestel nommer is as volg: <strong>\${data.pickup_code}</strong>. Wys dit by die hek om te betaal en jou kaartjies te ontvang.\`;
    } else {
      // mode pay_now -> redirect if payment_url provided (stub until gateway wired)
      if (data.payment_url){ location.href = data.payment_url; }
      else { msg.className="ok"; msg.textContent="Bestelling geskep."; }
    }
  }catch(e){
    msg.className="err"; msg.textContent = "Netwerk fout: "+e.message;
  }
}

async function init(){
  try {
    CATALOG = await loadCatalog();
  } catch(e){
    document.querySelector(".wrap").innerHTML = '<div class="card err">Kon nie event data laai nie: '+e.message+'</div>';
    return;
  }
  CART = readCartFromStorage() || [];        // tolerate empty
  summarize();
  document.getElementById("payNow").onclick  = ()=>postCheckout("pay_now");
  document.getElementById("payLater").onclick= ()=>postCheckout("pay_later");
}
init();
</script>
</body></html>`;
