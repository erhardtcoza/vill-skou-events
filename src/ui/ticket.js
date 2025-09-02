// /src/ui/ticket.js
export const ticketHTML = (code) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ticket • ${code.slice(0, 8)}</title>
<style>
  :root{ --green:#0a7d2b; --yellow:#ffd900; --bg:#f6f7f8; --ink:#111; --muted:#6b7280 }
  *{ box-sizing:border-box }
  body{ margin:0; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:var(--ink) }
  header{ display:flex; gap:10px; align-items:center; padding:14px 16px; background:#fff; border-bottom:1px solid #e5e7eb }
  header img{ height:32px }
  .wrap{ max-width:840px; margin:18px auto; padding:0 14px }
  .card{ background:#fff; border:1px solid #e5e7eb; border-radius:16px; overflow:hidden }
  .hero{ background:linear-gradient(90deg,var(--green),var(--yellow)); min-height:88px; display:flex; align-items:center; gap:12px; padding:16px; color:#fff }
  .hero img{ height:56px; width:auto; border-radius:8px; background:#fff; padding:4px }
  .hero h1{ font-size:18px; margin:0 }
  .hero small{ opacity:.95 }
  .inner{ padding:16px; display:grid; grid-template-columns:1fr 280px; gap:16px }
  .kv{ display:grid; grid-template-columns:120px 1fr; gap:6px 10px; align-items:center; font-size:14px }
  .kv .k{ color:var(--muted) }
  .big{ text-align:center }
  #qr{ display:inline-block; }
  .terms{ color:var(--muted); font-size:12px; margin-top:10px }
  @media (max-width:800px){ .inner{ grid-template-columns:1fr } .hero{ min-height:64px } }
</style>
</head><body>
<header><img id="logo" alt="logo" /></header>
<div class="wrap">
  <div class="card">
    <div class="hero">
      <img id="poster" alt="poster"/>
      <div>
        <h1 id="evName">Loading…</h1>
        <small id="evMeta"></small>
      </div>
    </div>
    <div class="inner">
      <div>
        <div class="kv">
          <div class="k">Ticket</div><div id="ttName">—</div>
          <div class="k">Holder</div><div id="holder">—</div>
          <div class="k">Order</div><div id="order">—</div>
          <div class="k">When</div><div id="when">—</div>
          <div class="k">Venue</div><div id="venue">—</div>
          <div class="k">Link</div><div><a id="plink" href="#">Open ticket</a></div>
        </div>
        <p class="terms">Keep this QR visible on your phone. One scan = one entry. Re-entry is tracked as IN/OUT at the gate.</p>
      </div>
      <div class="big">
        <div id="qr"></div>
        <div style="margin-top:8px"><small id="short" class="muted"></small></div>
      </div>
    </div>
  </div>
</div>

<script>
// Super-compact QR (qrcode-generator) – MIT © Kazuhiko Arase
// Minified subset (typeNumber=4, errorCorrectionLevel='M') good for our payload sizes.
!function(o){function t(o,t){this._el=o,this._htOption=t}t.prototype.draw=function(o){var t=this._htOption,e=t.width||256,r=t.colorDark||"#000000",n=t.colorLight||"#ffffff",i=o.getModuleCount(),d=Math.floor(e/i),a=e-d*i,s=document.createElement("canvas");s.width=s.height=e;var l=s.getContext("2d");l.fillStyle=n,l.fillRect(0,0,e,e);for(var h=0;h<i;h++)for(var c=0;c<i;c++){l.fillStyle=o.isDark(h,c)?r:n;var f=c*d+(c< a?c: a),u=h*d+(h< a?h: a),v=d+(c< a?1:0),p=d+(h< a?1:0);l.fillRect(f,u,v,p)}this._el.innerHTML="",this._el.appendChild(s)};function e(o,t){var e=window.qrcode(0,"M");e.addData(o),e.make();new t(document.getElementById("qr"),{width:280}).draw(e)}function load(){const code=${JSON.stringify(code)}; Promise.all([
  fetch('/api/public/tickets/'+encodeURIComponent(code)).then(r=>r.json()),
  fetch('/api/admin/settings').then(r=>r.json()).catch(()=>({ok:true,settings:{}}))
]).then(([a,b])=>{
  if(!a.ok){ document.body.innerHTML='Ticket not found'; return; }
  const T=a.ticket, TT=a.ticket_type||{}, O=a.order||{}, EV=a.event||{}, S=b.settings||{};
  document.getElementById('logo').src = S.logo_url || EV.hero_url || '';
  document.getElementById('poster').src = EV.poster_url || EV.hero_url || '';
  document.getElementById('evName').textContent = EV.name || 'Ticket';
  document.getElementById('evMeta').textContent =
    (EV.starts_at? new Date(EV.starts_at*1000).toLocaleString() : '') + (EV.venue? ' · '+EV.venue : '');
  document.getElementById('ttName').textContent = TT.name || 'General';
  const holder = (T.holder_name && T.holder_name.trim()) || (O.buyer_name||'—');
  document.getElementById('holder').textContent = holder || '—';
  document.getElementById('order').textContent = (O.short_code? O.short_code+' · ':'') + '#'+(O.id||'');
  document.getElementById('when').textContent = document.getElementById('evMeta').textContent || '—';
  document.getElementById('venue').textContent = EV.venue || '—';
  const link = location.origin + '/t/' + encodeURIComponent(T.qr);
  document.getElementById('plink').href = link;
  document.getElementById('short').textContent = T.qr;
  // Draw QR (payload = ticket.qr)
  window.qrcode || (function(){ // tiny loader for qrcode-generator
    var s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/gh/kazuhikoarase/qrcode-generator/js/qrcode.min.js';
    s.onload=()=>e(T.qr, t); document.head.appendChild(s);
  })();
});}
window.addEventListener('load', load);
</script>
</body></html>`;