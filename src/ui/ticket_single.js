// /src/ui/ticket_single.js
export function ticketSingleHTML(token) {
  const safeToken = String(token || "").replace(/[^a-zA-Z0-9._-]/g, "");
  const appleUrl  = `/api/wallet/apple/by-token/${encodeURIComponent(safeToken)}`;
  const googleUrl = `/api/wallet/google/by-token/${encodeURIComponent(safeToken)}`;

  const FallbackAppleSVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="236" height="48" viewBox="0 0 236 48" aria-hidden="true" focusable="false">
    <rect x="0.5" y="0.5" width="235" height="47" rx="10" fill="#000"/>
    <rect x="0.5" y="0.5" width="235" height="47" rx="10" fill="none" stroke="#000"/>
    <g fill="#fff" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-weight="600">
      <text x="60" y="30" font-size="14">Add to Apple Wallet</text>
    </g>
  </svg>`.trim();

  const FallbackGoogleSVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="260" height="48" viewBox="0 0 260 48" aria-hidden="true" focusable="false">
    <rect x="0.5" y="0.5" width="259" height="47" rx="10" fill="#1A73E8"/>
    <rect x="0.5" y="0.5" width="259" height="47" rx="10" fill="none" stroke="#1A73E8"/>
    <g fill="#fff" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-weight="600">
      <text x="60" y="30" font-size="14">Save to Google Wallet</text>
    </g>
  </svg>`.trim();

  return `<!doctype html>
<html lang="af">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Kaartjie</title>
  <style>
    :root{
      --green:#0a7d2b; --border:#e5e7eb; --text:#111827; --muted:#6b7280; --bg:#ffffff; --card:#ffffff; --accent:#E10600;
      --blue:#1f6feb; --warn:#936000; --void:#b91c1c;
    }
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:var(--bg);color:var(--text)}
    .wrap{max-width:720px;margin:0 auto;padding:16px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px}
    h1{margin:0 0 6px;font-size:22px}
    .muted{color:var(--muted)}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    @media (max-width:720px){ .grid{grid-template-columns:1fr} }

    .header{display:flex;gap:12px;align-items:center;margin-bottom:8px}
    .logo{width:54px;height:54px;border-radius:10px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden}
    .logo img{max-width:100%;max-height:100%;display:block}

    .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:4px 10px;font-size:12px}
    .pill.ok{border-color:#b9ebc6;color:#136c2e;background:#e7f7ec}
    .pill.in{border-color:#c7dbff;color:#1f6feb;background:#e8f0ff}
    .pill.out{border-color:#fde68a;color:#936000;background:#fff8e6}
    .pill.void{border-color:#fecaca;color:#b91c1c;background:#fee2e2}

    .qrbox{display:flex;gap:16px;align-items:center;justify-content:flex-end}
    .qrbox .code{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;word-break:break-all}
    .qr{width:300px;height:300px}
    @media (max-width:720px){ .qr{width:260px;height:260px} }

    .wallet-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}
    .wallet-btn{display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;background:transparent;cursor:pointer;border-radius:12px;outline:none}
    .wallet-btn[aria-disabled="true"]{opacity:.5;pointer-events:none}
    #wl-msg{font-size:13px;color:var(--muted)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card" id="ticket-card"><div class="muted">Laai tans…</div></div>

    <div class="card" style="margin-top:12px">
      <h2 style="margin:0 0 10px;font-size:18px">Mobiele Wallet</h2>
      <div class="wallet-row">
        <button id="btn-apple" class="wallet-btn" title="Add to Apple Wallet" aria-disabled="true">${FallbackAppleSVG}</button>
        <button id="btn-google" class="wallet-btn" title="Save to Google Wallet" aria-disabled="true">${FallbackGoogleSVG}</button>
        <span id="wl-msg" class="muted"></span>
      </div>
    </div>
  </div>

<script type="module">
  const token = ${JSON.stringify(safeToken)};
  const appleUrl = ${JSON.stringify(appleUrl)};
  const googleUrl = ${JSON.stringify(googleUrl)};
  const $ = (s, r=document)=>r.querySelector(s);
  const esc = (s='')=>String(s).replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  function pillClass(s){
    const u = String(s||'').toLowerCase();
    if (u==='void') return 'void';
    if (u==='out')  return 'out';
    if (u==='in')   return 'in';
    return 'ok';
  }

  async function getPublicSettings(keys){
    const out = {};
    try{
      const r = await fetch('/api/public/settings?keys=' + encodeURIComponent(keys.join(',')));
      if (r.ok){
        const j = await r.json();
        if (j && j.ok && j.settings) return j.settings;
      }
    }catch(_e){}
    for (const k of keys){
      try{
        const r = await fetch('/api/public/setting/' + encodeURIComponent(k));
        if (r.ok){
          const j = await r.json();
          if (j && j.ok && typeof j.value !== 'undefined') out[k] = j.value;
        }
      }catch(_e){}
    }
    return out;
  }

  function qrImgTag(data){
    if (!data) return "";
    return '<img class="qr" src="/api/qr/svg/'+encodeURIComponent(data)+'" alt="QR" width="300" height="300" loading="eager"/>';
  }

  async function loadTicket(){
    const url = \`/api/public/tickets/by-token/\${encodeURIComponent(token)}\`;
    let data = null;
    try{
      const r = await fetch(url, { credentials:'include' });
      if (r.ok) data = await r.json();
    }catch(_e){}

    const card = $("#ticket-card");
    if (!data || !data.ok){
      card.innerHTML = "<h1>Kaartjie</h1><div class='muted'>Kon nie kaartjie laai nie.</div>";
      return;
    }

    const t = data.ticket || {};
    const holder = [t.attendee_first||'', t.attendee_last||''].filter(Boolean).join(' ');
    const typeName = t.type_name || "Kaartjie";
    const shortCode = data.short_code || t.short_code || data.order?.short_code || '';
    const buyerName = data.buyer_name || t.buyer_name || data.order?.buyer_name || '';

    let logoUrl = null;
    try{
      const s = await getPublicSettings(['DEFAULT_EVENT_LOGO_URL']);
      logoUrl = s.DEFAULT_EVENT_LOGO_URL || null;
    }catch(_e){}
    const logoHTML = logoUrl ? \`<div class="logo"><img src="\${esc(logoUrl)}" alt="Logo" loading="eager"></div>\`
                             : \`<div class="logo" aria-hidden="true"></div>\`;

    card.innerHTML = \`
      <div class="header">
        \${logoHTML}
        <div>
          <div class="muted" style="font-size:12px">Villiersdorp Landbou Skou</div>
          <h1 style="margin:2px 0 4px">Jou kaartjie</h1>
          <div class="muted">\${esc(buyerName || '—')} • Bestel \${esc(shortCode || '—')}</div>
        </div>
      </div>

      <div class="grid">
        <div>
          <div style="margin-top:8px">
            <div style="font-size:16px"><b>Naam:</b> \${esc(holder.trim() || '—')}</div>
            <div style="margin-top:8px">
              <span class="pill">\${esc(typeName)}</span>
              <span class="pill \${pillClass(t.state)}">\${esc(t.state||"—")}</span>
            </div>
          </div>
        </div>

        <div class="qrbox">
          \${qrImgTag(t.qr)}
          <div class="code">\${esc(t.qr||'')}</div>
        </div>
      </div>\`;
  }

  async function checkWalletEndpoint(url){
    try{
      const r = await fetch(url, { method: 'HEAD' });
      return [200,204,405,401,403].includes(r.status);
    }catch(_e){ return false; }
  }
  function isIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }
  function isAndroid(){ return /Android/.test(navigator.userAgent); }
  function enableBtn(el, onClick){
    el.setAttribute('aria-disabled','false');
    el.tabIndex = 0;
    el.addEventListener('click', onClick, { passive:true });
    el.addEventListener('keydown', (e)=>{ if (e.key==='Enter'||e.key===' ') { e.preventDefault(); onClick(); }});
  }

  async function initWalletButtons(){
    const appleBtn  = $("#btn-apple");
    const googleBtn = $("#btn-google");
    const wlMsg     = $("#wl-msg");

    if (isIOS()) wlMsg.textContent = "Let wel: Apple Wallet op iPhone werk die beste.";
    else if (isAndroid()) wlMsg.textContent = "Let wel: Google Wallet op Android werk die beste.";

    // Auto-disable unless endpoints exist (keeps you safe while Apple dev isn't active)
    const [appleOK, googleOK] = await Promise.all([checkWalletEndpoint(appleUrl), checkWalletEndpoint(googleUrl)]);
    if (appleOK)  enableBtn(appleBtn,  ()=>{ window.location.href = appleUrl; });
    if (googleOK) enableBtn(googleBtn, ()=>{ window.open(googleUrl, '_blank', 'noopener,noreferrer'); });

    if (!appleOK && !googleOK){
      wlMsg.textContent = "Wallet aflaai is tans nie beskikbaar nie.";
    }
  }

  loadTicket();
  initWalletButtons();
</script>
</body>
</html>`;
}
