// /src/ui/checkout.js
import { css } from "./style.js";

function fmtR(cents) {
  return "R" + (cents / 100).toFixed(2);
}

function getSlugFromPath() {
  // matches /shop/:slug/checkout
  const m = location.pathname.match(/\/shop\/([^/]+)\/checkout$/);
  return m ? decodeURIComponent(m[1]) : "";
}

function loadCart(slug) {
  try {
    const raw = localStorage.getItem(`vs_cart_${slug}`) || "[]";
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // normalize: [{ticket_type_id, name, price_cents, qty}]
    return arr
      .filter(x => x && x.ticket_type_id && x.qty > 0)
      .map(x => ({
        ticket_type_id: Number(x.ticket_type_id),
        name: String(x.name || ""),
        price_cents: Number(x.price_cents || 0),
        qty: Number(x.qty || 0),
      }));
  } catch {
    return [];
  }
}

function computeTotals(lines) {
  let total = 0;
  for (const ln of lines) total += (ln.price_cents * ln.qty);
  return { total_cents: total };
}

function linesHTML(lines) {
  if (!lines.length) {
    return `
      <div class="muted">Geen kaartjies gekies nie.</div>
      <div class="row space"></div>
      <div class="row between">
        <div class="muted">Totaal</div>
        <div class="price">R0.00</div>
      </div>
    `;
  }
  const rows = lines.map(ln => `
    <div class="row between line">
      <div>${ln.name} &times; ${ln.qty}</div>
      <div>${ln.price_cents === 0 ? "FREE" : fmtR(ln.price_cents * ln.qty)}</div>
    </div>`).join("");

  const { total_cents } = computeTotals(lines);

  return `
    ${rows}
    <div class="row space"></div>
    <div class="row between total">
      <div class="muted">Totaal</div>
      <div class="price">${fmtR(total_cents)}</div>
    </div>
  `;
}

export function checkoutHTML(slugParam) {
  const slug = slugParam || getSlugFromPath();
  const lines = loadCart(slug);
  const hasItems = lines.length > 0;

  return `<!doctype html>
<html lang="af">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Checkout</title>
  <style>
    ${css()}
    .wrap { max-width: 1000px; margin: 0 auto; padding: 16px; }
    .grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 18px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    .card { background:#fff; border:1px solid #e6e6e6; border-radius:12px; padding:18px; }
    h1 { margin: 10px 0 16px 0; }
    .row { display:flex; gap:12px; align-items:center; }
    .between { justify-content: space-between; }
    .space { height: 8px; }
    .muted { color:#6b7280; }
    .price { font-weight:700; }
    .line { padding:6px 0; border-bottom:1px dashed #eee; }
    .total { padding-top:8px; }
    .btn { border-radius:10px; padding:10px 14px; border:1px solid #d1d5db; background:#f9fafb; }
    .btn.primary { background:#0f7b3a; color:#fff; border-color:#0f7b3a; }
    .btn:disabled { opacity:.5; cursor:not-allowed; }
    .tag { display:inline-block; background:#e7f5ee; color:#0f7b3a; border-radius:999px; padding:6px 10px; font-weight:600; }
    .error { color:#b91c1c; margin-top:10px; }
    .ok { color:#065f46; margin-top:10px; }
    .two { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
    .input { width:100%; border:1px solid #d1d5db; border-radius:10px; padding:11px 12px; }
    .link { color:#0f7b3a; text-decoration:none; }
    .link:hover { text-decoration:underline; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="row" style="gap:10px">
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

        <div class="row" style="margin-top:14px; gap:10px">
          <button id="payNow" class="btn primary" ${hasItems ? "" : "disabled"}>Pay now</button>
          <button id="payLater" class="btn" ${hasItems ? "" : "disabled"}>(Pay at event)</button>
          <span id="msg" class="muted"></span>
        </div>
        <div id="flash" class="ok" style="display:none"></div>
        <div id="err" class="error" style="display:none"></div>
      </div>

      <div class="card">
        <h3 style="margin-top:0">Jou keuse</h3>
        <div id="lines">${linesHTML(lines)}</div>
        <div class="muted" style="margin-top:8px;">Let wel: pryse word bevestig en herbereken op die volgende stap.</div>
      </div>
    </div>
  </div>

  <script type="module">
    const slug = ${JSON.stringify(slug)};
    const cartKey = "vs_cart_" + slug;

    function readCart() {
      try { return JSON.parse(localStorage.getItem(cartKey) || "[]"); }
      catch { return []; }
    }

    function postJSON(url, body) {
      return fetch(url, { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(body) });
    }

    function setBusy(on) {
      document.getElementById("payNow").disabled = on;
      document.getElementById("payLater").disabled = on;
      document.getElementById("err").style.display = "none";
      document.getElementById("flash").style.display = "none";
    }

    function showErr(t) {
      const el = document.getElementById("err");
      el.textContent = "Error: " + t;
      el.style.display = "block";
    }
    function showOk(t) {
      const el = document.getElementById("flash");
      el.textContent = t;
      el.style.display = "block";
    }

    function collectContact() {
      return {
        first: document.getElementById("first").value.trim(),
        last:  document.getElementById("last").value.trim(),
        email: document.getElementById("email").value.trim(),
        phone: document.getElementById("phone").value.trim()
      };
    }

    async function submit(mode) {
      const items = readCart().filter(x => x && x.qty > 0);
      if (!items.length) return showErr("Kies ten minste een kaartjie.");
      setBusy(true);
      try {
        // fetch event id for slug to keep server authoritative
        const evRes = await fetch("/api/public/events/" + encodeURIComponent(slug));
        const evJson = await evRes.json();
        if (!evJson?.ok || !evJson.event?.id) throw new Error("Kon nie event laai nie.");
        const event_id = evJson.event.id;

        const contact = collectContact();
        const payload = {
          mode: mode === "later" ? "pay_later" : "pay_now",
          event_id,
          buyer_name: (contact.first + " " + contact.last).trim(),
          buyer_email: contact.email,
          buyer_phone: contact.phone,
          items: items.map(it => ({
            ticket_type_id: Number(it.ticket_type_id),
            qty: Number(it.qty)
          }))
        };

        const r = await postJSON("/api/public/checkout", payload);
        const j = await r.json().catch(() => ({}));

        if (!r.ok || !j.ok) throw new Error(j.error || r.statusText || "server");

        if (payload.mode === "pay_later") {
          // keep the cart for now; show pickup code
          showOk("Bestelling geskep. Jou bestel nommer is as volg: " + (j.pickup_code || j.short_code || "—") + ". Wys dit by die hek om te betaal en jou kaartjies te ontvang.");
        } else {
          // pay now -> go to payment url (stub for Yoco)
          if (j.payment_url) {
            location.href = j.payment_url;
          } else {
            showOk("Bestelling geskep. Volg die betalingskakel om te betaal.");
          }
        }
      } catch (e) {
        showErr(String(e.message || e));
      } finally {
        setBusy(false);
      }
    }

    document.getElementById("payNow").addEventListener("click", () => submit("now"));
    document.getElementById("payLater").addEventListener("click", () => submit("later"));
  </script>
</body>
</html>`;
}
