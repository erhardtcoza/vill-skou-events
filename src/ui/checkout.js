// /src/ui/checkout.js

export function checkoutHTML(slug) {
  const esc = (s = "") =>
    String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

  return `<!doctype html><html lang="af">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Checkout</title>
<style>
  :root{--green:#16723b;}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial,sans-serif;
       margin:0;background:#f4f6f8;color:#111}
  main{max-width:980px;margin:24px auto;padding:0 16px}
  h1{font-size:42px;line-height:1.1;margin:12px 0 20px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media (max-width: 820px){ .grid{grid-template-columns:1fr} }
  .card{background:#fff;border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.06);padding:16px}
  .pill{display:inline-block;background:#e9f7ef;color:var(--green);border-radius:999px;
        font-weight:700;font-size:12px;padding:4px 10px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px}
  .row .full{grid-column:1 / -1}
  label{display:block;font-weight:600;font-size:13px;color:#475467;margin-bottom:6px}
  input{width:100%;padding:12px;border:1px solid #d0d5dd;border-radius:10px;font-size:16px}
  .btn{display:inline-block;border:0;border-radius:10px;padding:12px 16px;
       font-weight:700;cursor:pointer;font-size:16px}
  .btn-primary{background:var(--green);color:#fff}
  .btn-ghost{background:#e7e7ea;color:#333}
  .muted{color:#667085}
  table{width:100%;border-collapse:collapse;margin:6px 0 0}
  td,th{padding:8px;border-bottom:1px solid #eee;text-align:left}
  .right{text-align:right}
  .total{font-weight:800;font-size:20px}
  .empty{padding:10px 0;color:#667085}
  .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
</style>
</head>
<body>
<main>
  <h1>Checkout</h1>
  <div id="root" class="card">Loading...</div>
</main>

<script type="module">
  const $ = (s, r=document) => r.querySelector(s);
  const slug = ${JSON.stringify(slug)};

  function fmtZAR(cents){ return 'R' + (Number(cents||0)/100).toFixed(2); }

  function readCart(sl){
    const keys = [\`cart:\${sl}\`, "cart", \`cart_\${sl}\`];
    for(const k of keys){
      const raw = localStorage.getItem(k);
      if(!raw) continue;
      try{
        const j = JSON.parse(raw);
        if(j && Array.isArray(j.items)) return j; // {event_id, items:[{ticket_type_id,qty}]}
      }catch{}
    }
    return { event_id: 0, items: [] };
  }

  async function load(){
    const root = $("#root");
    root.textContent = "Loading...";

    // 1) Get event + ticket types
    const r = await fetch("/api/public/events/" + encodeURIComponent(slug));
    if(!r.ok){ root.innerHTML = "<div class='muted'>Kon nie event laai nie.</div>"; return; }
    const j = await r.json();
    const ev = j.event;
    const types = j.ticket_types || [];

    // 2) Read cart and price lines
    const cart = readCart(slug);
    const map = new Map(types.map(t => [Number(t.id), t]));

    const lines = [];
    let total = 0;
    for(const it of (cart.items||[])){
      const tt = map.get(Number(it.ticket_type_id));
      const qty = Math.max(0, Number(it.qty||0));
      if(!tt || !qty) continue;
      const unit = Number(tt.price_cents||0);
      const line = unit * qty;
      total += line;
      lines.push({ id: tt.id, name: tt.name, unit, qty, line });
    }

    // 3) Build right column (cart)
    const rightHTML = lines.length
      ? \`
        <table>
          <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Prys</th></tr></thead>
          <tbody>
            \${lines.map(l => \`
              <tr>
                <td>\${l.name}</td>
                <td class="right">× \${l.qty}</td>
                <td class="right">\${fmtZAR(l.line)}</td>
              </tr>\`).join("")}
            <tr>
              <td class="total">Totaal</td><td></td>
              <td class="right total">\${fmtZAR(total)}</td>
            </tr>
          </tbody>
        </table>\`
      : "<div class='empty'>Geen items in mandjie nie.</div>";

    // 4) Render page
    root.innerHTML = \`
      <div class="grid">
        <div class="card">
          <div class="pill">\${ev.name}</div>
          <div class="row">
            <div><label>Naam<input id="fn" placeholder="Naam"/></label></div>
            <div><label>Van<input id="ln" placeholder="Van"/></label></div>
            <div><label>E-pos<input id="em" type="email" placeholder="E-pos"/></label></div>
            <div><label>Selfoon<input id="ph" placeholder="Selfoon (bv. 2771...)"/></label></div>
          </div>
          <div class="actions">
            <button class="btn btn-primary" id="payNow">Pay now</button>
            <button class="btn btn-ghost" id="payAtEvent">(Pay at event)</button>
          </div>
          <p class="muted" style="margin-top:10px">
            Jou kaartjies sal via WhatsApp en Epos eersdaags gestuur word sodra betaling ontvang was.
          </p>
        </div>
        <div class="card">
          \${rightHTML}
        </div>
      </div>
    \`;

    function currentLinesPayload(){
      return lines.map(l => ({ ticket_type_id: l.id, qty: l.qty }));
    }

    async function submit(which){
      const buyer_name = (\$("#fn").value||"") + " " + (\$("#ln").value||"");
      const email = \$("#em").value || "";
      const phone = \$("#ph").value || "";
      if(!buyer_name.trim()){ alert("Voer asseblief Naam en Van in."); return; }
      if(lines.length === 0){ alert("Jou mandjie is leeg."); return; }

      const payload = {
        event_id: ev.id,
        buyer_name: buyer_name.trim(),
        email, phone,
        items: currentLinesPayload(),
        method: (which === "now") ? "pay_now" : "pay_at_event"
      };

      const res = await fetch("/api/public/orders/create", {
        method: "POST",
        headers: {"content-type":"application/json"},
        body: JSON.stringify(payload)
      });
      let data = {};
      try{ data = await res.json(); }catch{}
      if(!res.ok || !data.ok){
        alert("Kon nie bestelling skep nie: " + (data.error || res.status));
        return;
      }

      // Clear cart
      try{ localStorage.removeItem(\`cart:\${slug}\`); }catch{}
      try{ localStorage.removeItem("cart"); }catch{}
      try{ localStorage.removeItem(\`cart_\${slug}\`); }catch{}

      // For now, take buyer to the ticket page by order short_code (works for both modes)
      const code = data.order.short_code;
      location.href = "/t/" + encodeURIComponent(code);
    }

    \$("#payNow").addEventListener("click", () => submit("now"));
    \$("#payAtEvent").addEventListener("click", () => submit("later"));
  }

  load();
</script>
</body></html>`;
}
