// /src/ui/checkout.js
export function checkoutHTML(slug) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout</title>
<style>
  body{font-family:system-ui;margin:0;background:#f5faf6;color:#111}
  .wrap{max-width:1000px;margin:24px auto;padding:0 16px}
  h1{font-size:40px;margin:12px 0 16px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media (max-width:820px){.grid{grid-template-columns:1fr}}
  .card{background:#fff;border-radius:16px;box-shadow:0 2px 10px rgba(0,0,0,.05);padding:16px}
  .pill{display:inline-block;padding:6px 12px;border-radius:999px;background:#e8f6ec;color:#0a7d2b;font-weight:600;font-size:14px}
  label{font-size:14px;color:#333;display:block;margin:10px 0 6px}
  input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid #ddd;font-size:16px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .btn{display:inline-block;border:none;border-radius:12px;padding:12px 16px;font-size:16px;font-weight:700;cursor:pointer}
  .primary{background:#0a7d2b;color:#fff}
  .ghost{background:#444;color:#ddd}
  .hint{color:#666;margin-top:10px;line-height:1.35}
  .lines{display:flex;flex-direction:column;gap:10px}
  .line{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid #eee;border-radius:12px}
  .muted{color:#555}
  .total{font-weight:900;font-size:22px}
  .empty{color:#666;padding:16px;border-radius:12px;background:#fff;border:1px dashed #ddd}
</style>
</head>
<body>
<div class="wrap">
  <h1>Checkout</h1>
  <div id="root" class="grid">
    <div class="card">
      <div id="evpill" class="pill" style="display:none;"></div>
      <div class="row">
        <div>
          <label>Naam</label>
          <input id="first" placeholder="Naam" autocomplete="given-name">
        </div>
        <div>
          <label>Van</label>
          <input id="last" placeholder="Van" autocomplete="family-name">
        </div>
      </div>
      <div class="row">
        <div>
          <label>E-pos</label>
          <input id="email" placeholder="E-pos" inputmode="email" autocomplete="email">
        </div>
        <div>
          <label>Selfoon</label>
          <input id="phone" placeholder="Selfoon (bv. 2771...)" inputmode="tel" autocomplete="tel">
        </div>
      </div>
      <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
        <button id="payNow" class="btn primary">Pay now</button>
        <button id="payAt" class="btn ghost">(Pay at event)</button>
      </div>
      <div class="hint">
        Jou kaartjies sal via WhatsApp en Epos eersdaags gestuur word sodra betaling ontvang was.
      </div>
    </div>
    <div class="card">
      <div id="cartView" class="lines"></div>
    </div>
  </div>
</div>

<script>
(async function(){
  const slug = ${JSON.stringify(slug || "")} || (location.pathname.split("/")[2] || "");
  const evRes = await fetch("/api/public/events/" + encodeURIComponent(slug));
  if (!evRes.ok) { document.getElementById("root").innerHTML = "<div class='card'>Kon nie gebeurtenis laai nie.</div>"; return; }
  const evData = await evRes.json();
  const event = evData.event;
  const ticketTypes = new Map((evData.ticket_types||[]).map(t => [Number(t.id), t]));

  // Show event pill
  const pill = document.getElementById("evpill");
  pill.textContent = event.name || "";
  pill.style.display = "inline-block";

  // ---- CART LOADER (robust) ----
  function tryParse(s){ try { return JSON.parse(s); } catch { return null; } }
  function readFrom(storage, keys){
    for (const k of keys) {
      const val = storage.getItem(k);
      const parsed = val && tryParse(val);
      if (parsed) return parsed;
    }
    return null;
  }
  const keys = [
    "cart:"+slug, "cart-"+slug, "cart_"+slug,
    "cart", "shop_cart", "ticket_cart"
  ];
  let cart = readFrom(sessionStorage, keys) || readFrom(localStorage, keys) || {};
  // Normalize
  const arr = Array.isArray(cart) ? cart : (cart.items || cart.lines || []);
  let items = [];
  for (const it of (arr || [])) {
    // Accept {ticket_type_id, qty} OR {id, qty}
    const tid = Number(it.ticket_type_id ?? it.id ?? 0);
    const qty = Number(it.qty ?? it.quantity ?? 0);
    if (tid && qty > 0) items.push({ ticket_type_id: tid, qty });
  }
  // Fallback: if nothing, also check if we accidentally saved IDs as strings
  if (!items.length && cart && typeof cart === "object") {
    for (const [k,v] of Object.entries(cart)) {
      if (/^\\d+$/.test(k)) items.push({ ticket_type_id: Number(k), qty: Number(v||0) });
    }
    items = items.filter(x => x.qty > 0);
  }

  // Render cart
  const cartView = document.getElementById("cartView");
  function cents(n){ return "R" + (Number(n||0)/100).toFixed(2); }
  function renderCart(){
    cartView.innerHTML = "";
    if (!items.length) {
      cartView.innerHTML = "<div class='empty'>Geen items in mandjie nie.</div>";
      return;
    }
    let total = 0;
    for (const it of items) {
      const tt = ticketTypes.get(Number(it.ticket_type_id));
      if (!tt) continue;
      const line = Number(tt.price_cents||0) * Number(it.qty||0);
      total += line;
      const row = document.createElement("div");
      row.className = "line";
      row.innerHTML = \`
        <div><div><strong>\${tt.name}</strong></div>
            <div class="muted">× \${it.qty}</div></div>
        <div>\${cents(line)}</div>\`;
      cartView.appendChild(row);
    }
    const t = document.createElement("div");
    t.className = "line";
    t.innerHTML = \`<div class="total">Totaal</div><div class="total">\${cents(total)}</div>\`;
    cartView.appendChild(t);
  }
  renderCart();

  // ---- SUBMIT ORDER ----
  async function submit(method){
    if (!items.length) { alert("Jou mandjie is leeg."); return; }
    const first = document.getElementById("first").value.trim();
    const last  = document.getElementById("last").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();

    if (!first) return alert("Vul jou Naam in.");
    if (!last)  return alert("Vul jou Van in.");

    const body = {
      event_id: Number(event.id),
      buyer_name: (first + " " + last).trim(),
      email, phone,
      items,
      method // "pay_now" | other (treated as pay at event)
    };

    const r = await fetch("/api/public/orders/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || !j.ok) {
      alert("Kon nie bestelling skep nie: " + (j.error || r.status));
      return;
    }

    // Clear cart keys we understand
    const allKeys = [
      "cart:"+slug, "cart-"+slug, "cart_"+slug,
      "cart", "shop_cart", "ticket_cart"
    ];
    for (const k of allKeys){ sessionStorage.removeItem(k); localStorage.removeItem(k); }

    // For now just take them to the ticket page by order code
    location.href = "/t/" + encodeURIComponent(j.order.short_code);
  }

  document.getElementById("payNow").addEventListener("click", () => submit("pay_now"));
  document.getElementById("payAt").addEventListener("click", () => submit("pay_at_event"));
})();
</script>
</body>
</html>`;
}
