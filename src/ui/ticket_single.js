// /src/ui/ticket_single.js
export function singleTicketHTML(token) {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

  return `<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Jou kaartjie</title>
<style>
  :root{ --bg:#f7f7f7; --panel:#fff; --ink:#111; --muted:#6b7280; --brand:#166534; --chip:#e5e7eb;
         --ok:#065f46; --warn:#92400e; --void:#991b1b; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}
  .wrap{max-width:700px;margin:20px auto;padding:0 16px}
  h1{margin:0 0 6px}
  .lead{color:var(--muted);margin:0 0 16px}
  .card{background:var(--panel);border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.06);padding:16px}
  .row{display:flex;justify-content:space-between;gap:8px;align-items:center}
  .pill{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--chip);font-size:12px}
  .state-unused{color:var(--ok)} .state-in{color:var(--ok)} .state-out{color:var(--warn)} .state-void{color:var(--void)}
  .qr{display:flex;justify-content:center;margin:10px 0}
  .qr img{width:260px;height:260px;background:#fff;padding:8px;border-radius:8px;image-rendering:pixelated}
  .muted{color:var(--muted)}
  .btn{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;border:0;background:var(--brand);color:#fff;font-weight:700;cursor:pointer}
  .foot{margin-top:14px;text-align:center;color:var(--muted)}
  @media print{ .btn{display:none} body{background:#fff} .qr img{width:360px;height:360px} }
</style>
</head><body>
<div class="wrap">
  <h1>Jou kaartjie</h1>
  <p class="lead">Wys die QR by die hek sodat dit gescan kan word.</p>

  <div id="card" class="card" aria-live="polite">Laai…</div>
</div>

<script type="module">
  const token = ${JSON.stringify(token)};
  const esc = ${singleLine(esc)};
  const money = (c)=>'R'+((c||0)/100).toFixed(2);
  const qrURL = (data,size=260)=>\`https://api.qrserver.com/v1/create-qr-code/?format=png&size=\${size}x\${size}&data=\${encodeURIComponent(data)}\`;
  const stateClass = s => s==='in'?'state-in':s==='out'?'state-out':s==='void'?'state-void':'state-unused';

  async function load(){
    const r = await fetch('/api/public/tickets/by-token/'+encodeURIComponent(token),{credentials:'include'});
    const j = await r.json().catch(()=>({ok:false}));
    const el = document.getElementById('card');
    if(!j.ok || !j.ticket){ el.textContent='Kon nie kaartjie vind nie.'; return; }
    const t = j.ticket;
    const full = [t.attendee_first,t.attendee_last].filter(Boolean).join(' ') || 'Besoeker';
    el.innerHTML = \`
      <div class="row">
        <div style="font-weight:700">\${esc(t.type_name||'Kaartjie')}</div>
        <span class="pill \${stateClass(t.state)}">\${esc(t.state||'unused')}</span>
      </div>
      <div class="qr"><img alt="QR vir toegang" src="\${qrURL(t.qr)}"></div>
      <div style="font-weight:600">\${esc(full)}</div>
      <div class="muted">\${t.price_cents!=null?money(t.price_cents):''}</div>
      <div style="margin-top:10px"><button class="btn" id="dl">Download PNG</button></div>
      <div class="foot">Bestel no: \${esc(t.short_code||'')} · betaal deur \${esc(t.buyer_name||'')}</div>\`;
    document.getElementById('dl')?.addEventListener('click', async ()=>{
      const big = qrURL(t.qr, 600);
      const res = await fetch(big); const blob = await res.blob();
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='ticket-'+(t.id||'')+'.png';
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
    });
  }
  load();
</script>
</body></html>`;
}

function singleLine(fn){ return fn.toString(); }
function esc(s){ return String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
