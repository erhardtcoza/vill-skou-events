// /src/ui/checkout.js
export function checkoutHTML(slug) {
  return `<!doctype html>
<html lang="af">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Checkout</title>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <style>
    :root{--green:#157347;--grey:#f2f3f5;--border:#e5e7eb}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;margin:0;background:#fff;color:#0f172a}
    .wrap{max-width:960px;margin:28px auto;padding:0 16px}
    h1{font-size:34px;margin:0 0 16px}
    a.back{font-size:14px;color:#0f172a;text-decoration:none;display:inline-flex;gap:6px;align-items:center;margin-bottom:10px}
    .grid{display:grid;grid-template-columns:1fr 360px;gap:18px}
    .card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:18px}
    .row{display:flex;gap:10px;margin-bottom:10px}
    .row input{flex:1;padding:10px 12px;border:1px solid var(--border);border-radius:10px;font-size:14px}
    .btn{border:1px solid var(--border);background:#fff;border-radius:10px;padding:10px 14px;font-weight:600;cursor:pointer}
    .btn.primary{background:var(--green);color:#fff;border-color:var(--green)}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .sum-title{font-weight:700;margin:0 0 10px}
    .sum-row{display:flex;justify-content:space-between;margin:6px 0}
    .muted{color:#475569;font-size:13px}
    .total{font-weight:800;font-size:20px}
    ul.clean{margin:0;padding-left:18px}
    .ok{color:#157347}
    .err{color:#b91c1c}
  </style>
</head>
<body>
  <div class="wrap">
    <a class="back" href="/shop/${slug}">← Terug na event</a>
    <h1>Checkout</h1>
    <div class="grid">
      <div class="card">
        <h2 style="margin:0 0 12px">Jou besonderhede</h2>

        <div class="row">
          <input id="first" placeholder="Naam">
          <input id="last" placeholder="Van">
        </div>
        <div class="row">
          <input id="email" placeholder="E-pos" inputmode="email">
          <input id="phone" placeholder="Selfoon" inputmode="tel">
        </div>

        <div class="row" style="margin-top:8px">
          <button id="payNow" class="btn primary" disabled>Pay now</button>
          <button id="payLater" class="btn" disabled>Pay at event</button>
          <div id="msg" class="muted"></div>
        </div>
      </div>

      <div class="card">
        <h2 style="margin:0 0 12px">Jou keuse</h2>
        <div id="lines"></div>
        <div class="sum-row" style="margin-top:10px">
          <div class="total">Totaal</div>
          <div class="total" id="total">R0.00</div>
        </div>
        <p class="muted" style="margin-top:10px">Let wel: pryse word bevestig en herbereken op die volgende stap.</p>
      </div>
    </div>
  </div>

  <script>
  (async function(){
    const slug = ${JSON.stringify(slug)};
    const el = (id)=>document.getElementById(id);
    const fmtR = (c)=>'R' + (c/100).toFixed(2);

    function parseMaybeBase64(str) {
      try {
        // try raw JSON first
        return JSON.parse(str);
      } catch {}
      try {
        // try base64 / base64url
        const pad = (s)=> s + "===".slice((s.length+3)%4);
        const norm = str.replace(/-/g,'+').replace(/_/g,'/');
        return JSON.parse(atob(pad(norm)));
      } catch {}
      return null;
    }

    function loadCartCandidates() {
      const keys = [
        'vs_cart_' + slug,
        'cart:' + slug,
        'cart_' + slug
      ];
      for (const k of keys) {
        const v = localStorage.getItem(k);
        if (v) {
          const j = parseMaybeBase64(v) || (()=>{ try{return JSON.parse(v)}catch{return null} })();
          if (j) return j;
        }
      }
      const u = new URL(location.href);
      const cartQ = u.searchParams.get('cart') || '';
      if (cartQ) {
        const j = parseMaybeBase64(cartQ);
        if (j) return j;
      }
      return null;
    }

    function normalizeCart(raw, ticketTypes) {
      if (!raw) return [];
      // allow array or object map
      const arr = Array.isArray(raw) ? raw : Object.entries(raw).map(([k,v])=>{
        if (typeof v === 'number') return { id: Number(k)||k, qty: v };
        return { ...v };
      });

      const byId = new Map(ticketTypes.map(t=>[String(t.id), t]));
      const byName = new Map(ticketTypes.map(t=>[t.name.toLowerCase(), t]));

      const items = [];
      for (const it of arr) {
        let tt = null;
        if (it.ticket_type_id != null) tt = byId.get(String(it.ticket_type_id));
        if (!tt && it.id != null)      tt = byId.get(String(it.id));
        if (!tt && it.name)            tt = byName.get(String(it.name).toLowerCase());
        const qty = Number(it.qty || it.quantity || it.count || 0);
        if (tt && qty > 0) items.push({ ticket_type_id: tt.id, name: tt.name, price_cents: tt.price_cents, qty });
      }
      return items;
    }

    function renderSummary(items){
      const box = document.getElementById('lines');
      box.innerHTML = '';
      if (!items.length) {
        box.innerHTML = '<p class="muted" id="empty">Geen kaartjies gekies nie.</p>';
      } else {
        const ul = document.createElement('ul'); ul.className='clean';
        for (const it of items) {
          const li = document.createElement('li');
          li.className = 'sum-row';
          li.innerHTML = \`<div>\${it.name} × \${it.qty}</div><div>\${fmtR(it.price_cents * it.qty)}</div>\`;
          ul.appendChild(li);
        }
        box.appendChild(ul);
      }
      const totalC = items.reduce((s,it)=>s + it.price_cents*it.qty, 0);
      el('total').textContent = fmtR(totalC);
      el('payNow').disabled  = totalC <= 0;
      el('payLater').disabled = totalC <= 0;
      return totalC;
    }

    // 1) Load event + ticket types
    let eventId = null, ticketTypes = [];
    try {
      const r = await fetch(\`/api/public/events/\${slug}\`);
      const j = await r.json();
      if (j.ok) {
        eventId = j.event.id;
        ticketTypes = j.ticket_types || [];
      } else {
        el('msg').className='err'; el('msg').textContent = 'Kon nie event laai nie.';
        return;
      }
    } catch(e){
      el('msg').className='err'; el('msg').textContent = 'Netwerkfout: kan nie event laai nie.';
      return;
    }

    // 2) Recover cart and normalize against live ticket types
    const raw = loadCartCandidates();
    const items = normalizeCart(raw, ticketTypes);
    const totalCents = renderSummary(items);

    // 3) Wire buttons
    async function doCheckout(mode){
      el('msg').className='muted'; el('msg').textContent='Verwerking…';
      const body = {
        mode: mode === 'later' ? 'pay_later' : 'pay_now',
        event_id: eventId,
        items: items.map(it => ({ ticket_type_id: it.ticket_type_id, qty: it.qty })),
        contact: {
          first: el('first').value.trim(),
          last:  el('last').value.trim(),
          email: el('email').value.trim(),
          phone: el('phone').value.trim()
        }
      };
      try {
        const r = await fetch('/api/public/checkout', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || 'server');
        if (body.mode === 'pay_later') {
          el('msg').className='ok';
          el('msg').innerHTML = 'Bestelling geskep. Jou bestel nommer is as volg: <b>' + (j.pickup_code || j.short_code || '—') + '</b>. Wys dit by die hek om te betaal en jou kaartjies te ontvang.';
        } else {
          // pay now – until Yoco hosted payments is wired up:
          el('msg').className='ok';
          el('msg').textContent = 'Bestelling geskep. Betaalbladsy sal binnekort beskikbaar wees.';
          if (j.payment_url) location.href = j.payment_url;
        }
      } catch(e){
        el('msg').className='err';
        el('msg').textContent = 'Fout tydens afrekening: ' + (e.message || 'onbekend');
      }
    }

    el('payNow').addEventListener('click', ()=>doCheckout('now'));
    el('payLater').addEventListener('click', ()=>doCheckout('later'));

  })();
  </script>
</body>
</html>`;
}
