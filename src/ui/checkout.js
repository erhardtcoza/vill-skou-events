// /src/ui/checkout.js
import { css } from "./style.js";

function fmtR(cents) { return "R" + (Number(cents || 0) / 100).toFixed(2); }
function slugFromPath() {
  const m = location.pathname.match(/\/shop\/([^/]+)\/checkout$/);
  return m ? decodeURIComponent(m[1]) : "";
}

export function checkoutHTML(slugParam) {
  const slug = slugParam || slugFromPath();

  return `<!doctype html>
<html lang="af">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Checkout</title>
  <style>
    ${css()}
    .wrap{ max-width:1000px; margin:0 auto; padding:16px }
    .grid{ display:grid; grid-template-columns: 1.2fr .8fr; gap:18px }
    @media (max-width:900px){ .grid{ grid-template-columns:1fr } }
    .card{ background:#fff; border:1px solid #e6e6e6; border-radius:12px; padding:18px }
    .row{ display:flex; gap:10px; align-items:center }
    .between{ justify-content:space-between }
    .muted{ color:#6b7280 }
    .price{ font-weight:700 }
    .btn{ border-radius:10px; padding:10px 14px; border:1px solid #d1d5db; background:#f9fafb }
    .btn.primary{ background:#0f7b3a; color:#fff; border-color:#0f7b3a }
    .btn:disabled{ opacity:.6; cursor:not-allowed }
    .line{ padding:6px 0; border-bottom:1px dashed #eee }
    .error{ color:#b91c1c; margin-top:10px }
    .ok{ color:#065f46; margin-top:10px }
    .two{ display:grid; grid-template-columns:1fr 1fr; gap:12px }
    .input{ width:100%; border:1px solid #d1d5db; border-radius:10px; padding:11px 12px }
    a.link{ color:#0f7b3a; text-decoration:none }
    a.link:hover{ text-decoration:underline }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="row" style="margin-bottom:8px">
      <a class="link" href="/shop/${slug}">← Terug na event</a>
    </div>
    <h1>Checkout</h1>

    <div class="grid">
      <div class="card">
        <h3 style="margin-top:0">Jou besonderhede</h3>
        <div class="two">
          <input id="first" class="input" placeholder="Naam"/>
          <input id="last" class="input" placeholder="Van"/>
        </div>
        <div class="two" style="margin-top:12px">
          <input id="email" class="input" placeholder="E-pos" type="email"/>
          <input id="phone" class="input" placeholder="Selfoon" inputmode="tel"/>
        </div>

        <div class="row" style="margin-top:14px">
          <button id="payNow"  class="btn primary" disabled>Pay now</button>
          <button id="payLater" class="btn" disabled>Pay at event</button>
          <span id="msg" class="muted"></span>
        </div>

        <div id="flash" class="ok" style="display:none"></div>
        <div id="err" class="error" style="display:none"></div>
      </div>

      <div class="card">
        <h3 style="margin-top:0">Jou keuse</h3>
        <div id="lines">
          <div class="muted">Geen kaartjies gekies nie.</div>
          <div class="row between" style="margin-top:8px">
            <div class="muted">Totaal</div>
            <div class="price">R0.00</div>
          </div>
        </div>
        <div class="muted" style="margin-top:8px">
          Let wel: pryse word bevestig en herbereken op die volgende stap.
        </div>
      </div>
    </div>
  </div>

  <script type="module">
    const slug = ${JSON.stringify(slug)};

    function showErr(t){
      const el = document.getElementById("err");
      el.textContent = "Error: " + t;
      el.style.display = "block";
    }
    function hideErr(){ document.getElementById("err").style.display="none"; }
    function showOk(t){
      const el = document.getElementById("flash");
      el.textContent = t;
      el.style.display = "block";
    }
    function hideOk(){ document.getElementById("flash").style.display="none"; }

    function readPending(){
      try { return JSON.parse(sessionStorage.getItem("pending_cart") || "null"); }
      catch { return null; }
    }

    function collectContact(){
      return {
        first: document.getElementById("first").value.trim(),
        last:  document.getElementById("last").value.trim(),
        email: document.getElementById("email").value.trim(),
        phone: document.getElementById("phone").value.trim(),
      };
    }

    function renderLines(items, ttypes){
      const el = document.getElementById("lines");
      if (!Array.isArray(items) || !items.length){
        el.innerHTML = \`
          <div class="muted">Geen kaartjies gekies nie.</div>
          <div class="row between" style="margin-top:8px">
            <div class="muted">Totaal</div>
            <div class="price">R0.00</div>
          </div>\`;
        return { total_cents: 0 };
      }
      let total = 0;
      const rows = items.map(it => {
        const tt = ttypes.get(it.ticket_type_id) || { name:"", price_cents:0 };
        const line = (tt.price_cents || 0) * (it.qty || 0);
        total += line;
        return \`
          <div class="row between line">
            <div>\${tt.name} × \${it.qty}</div>
            <div>\${tt.price_cents ? ("R"+(line/100).toFixed(2)) : "FREE"}</div>
          </div>\`;
      }).join("");

      el.innerHTML = rows + \`
        <div class="row between" style="margin-top:6px">
          <div class="muted">Totaal</div>
          <div class="price">R\${(total/100).toFixed(2)}</div>
        </div>\`;
      return { total_cents: total };
    }

    function setBusy(on){
      document.getElementById("payNow").disabled = on;
      document.getElementById("payLater").disabled = on;
    }

    function enableButtons(has){
      document.getElementById("payNow").disabled = !has;
      document.getElementById("payLater").disabled = !has;
    }

    async function init(){
      hideErr(); hideOk();

      // 1) Load pending cart from sessionStorage
      const pending = readPending();
      // 2) Load event + ticket types to resolve names/prices
      const evRes = await fetch("/api/public/events/" + encodeURIComponent(slug));
      const evJson = await evRes.json().catch(()=>({ ok:false }));
      if (!evJson.ok) { showErr("Kon nie event laai nie"); return; }
      const event_id = evJson.event?.id;
      const ttypes = new Map((evJson.ticket_types||[]).map(t => [t.id, t]));

      // 3) Guard & render
      const items = (pending && Array.isArray(pending.items)) ? pending.items.filter(i => i && i.qty>0) : [];
      const { total_cents } = renderLines(items, ttypes);
      enableButtons(items.length > 0);

      // 4) Submit helpers
      async function submit(mode){
        hideErr(); hideOk();
        if (!items.length) { showErr("Kies ten minste een kaartjie."); return; }
        const c = collectContact();
        setBusy(true);
        try{
          const body = {
            mode: mode === "later" ? "pay_later" : "pay_now",
            event_id,
            buyer_name: (c.first + " " + c.last).trim(),
            buyer_email: c.email,
            buyer_phone: c.phone,
            items: items.map(it => ({ ticket_type_id: Number(it.ticket_type_id), qty: Number(it.qty) }))
          };
          const r = await fetch("/api/public/checkout", {
            method: "POST",
            headers: { "content-type":"application/json" },
            body: JSON.stringify(body)
          });
          const j = await r.json().catch(()=>({}));
          if (!r.ok || !j.ok) throw new Error(j.error || r.statusText || "server");

          if (body.mode === "pay_later") {
            showOk("Bestelling geskep. Jou bestel nommer is as volg: "
              + (j.pickup_code || j.short_code || "—")
              + ". Wys dit by die hek om te betaal en jou kaartjies te ontvang.");
          } else {
            if (j.payment_url) location.href = j.payment_url;
            else showOk("Bestelling geskep. Volg die betalingskakel om te betaal.");
          }
        } catch(e){
          showErr(String(e.message || e));
        } finally {
          setBusy(false);
        }
      }

      document.getElementById("payNow").addEventListener("click", () => submit("now"));
      document.getElementById("payLater").addEventListener("click", () => submit("later"));
    }

    init();
  </script>
</body>
</html>`;
}
