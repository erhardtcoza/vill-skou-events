// /src/ui/ticket_single.js
// Renders a single-ticket view by token, with native "Add to Apple Wallet" and "Save to Google Wallet" CTAs.
// Route expectation: your router serves /tt/:token and calls ticketSingleHTML(token).

export function ticketSingleHTML(token) {
  const safeToken = String(token || "").replace(/[^a-zA-Z0-9._-]/g, "");
  const appleUrl  = `/api/wallet/apple/by-token/${encodeURIComponent(safeToken)}`;
  const googleUrl = `/api/wallet/google/by-token/${encodeURIComponent(safeToken)}`;

  // Inline SVG badges (no external assets). Swap these for <img> tags if you host artwork in R2/KV.
  const AppleBadgeSVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="236" height="48" viewBox="0 0 236 48" aria-hidden="true" focusable="false">
    <rect x="0.5" y="0.5" width="235" height="47" rx="10" fill="#000"/>
    <rect x="0.5" y="0.5" width="235" height="47" rx="10" fill="none" stroke="#000"/>
    <!-- Apple logo -->
    <path fill="#fff" transform="translate(16,10) scale(0.95)"
      d="M18.7 11.2c0-3 1.7-5.7 4.2-7.2-1.5-2.1-3.9-3.4-6.5-3.5-2.7-.3-5.3 1.6-6.6 1.6-1.4 0-3.6-1.6-5.9-1.5-3.1.1-5.9 1.8-7.5 4.5-3.2 5.4-.8 13.3 2.3 17.6 1.5 2.2 3.3 4.7 5.7 4.6 2.3-.1 3.2-1.5 6-1.5 2.7 0 3.6 1.5 5.9 1.4 2.4 0 3.9-2.2 5.4-4.4 1.7-2.5 2.4-4.9 2.4-5 0-.1-5.4-2.1-5.4-7.1z"/>
    <!-- Wallet mark -->
    <g transform="translate(56,10)">
      <rect width="28" height="20" rx="3" fill="#1ABCFE"/>
      <rect y="4" width="28" height="20" rx="3" fill="#0ACF83" opacity="0.9"/>
      <rect y="8" width="28" height="20" rx="3" fill="#A259FF" opacity="0.85"/>
      <rect y="12" width="28" height="20" rx="3" fill="#F24E1E" opacity="0.8"/>
    </g>
    <g fill="#fff" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-weight="600">
      <text x="92" y="28" font-size="14">Add to Apple Wallet</text>
    </g>
  </svg>`.trim();

  const GoogleBadgeSVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="260" height="48" viewBox="0 0 260 48" aria-hidden="true" focusable="false">
    <rect x="0.5" y="0.5" width="259" height="47" rx="10" fill="#1A73E8"/>
    <rect x="0.5" y="0.5" width="259" height="47" rx="10" fill="none" stroke="#1A73E8"/>
    <!-- Google Wallet mark -->
    <g transform="translate(16,10)">
      <rect width="10" height="28" rx="5" fill="#34A853"/>
      <rect x="8" y="6" width="10" height="22" rx="5" fill="#FBBC04"/>
      <rect x="16" y="12" width="10" height="16" rx="5" fill="#EA4335"/>
      <rect x="24" y="18" width="10" height="10" rx="5" fill="#4285F4"/>
    </g>
    <g fill="#fff" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-weight="600">
      <text x="60" y="28" font-size="14">Save to Google Wallet</text>
    </g>
  </svg>`.trim();

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Ticket</title>
  <style>
    :root{
      --green:#0a7d2b;
      --border:#e5e7eb;
      --text:#111827;
      --muted:#6b7280;
      --bg:#ffffff;
      --card:#ffffff;
    }
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:var(--bg);color:var(--text)}
    .wrap{max-width:720px;margin:0 auto;padding:16px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px}
    h1{margin:0 0 6px;font-size:22px}
    .muted{color:var(--muted)}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    @media (max-width:720px){ .grid{grid-template-columns:1fr} }

    .wallet-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}
    .wallet-btn{display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;background:transparent;cursor:pointer;border-radius:12px;outline:none}
    .wallet-btn svg{display:block}
    .wallet-btn:focus-visible{box-shadow:0 0 0 3px rgba(26,115,232,.35)}
    .wallet-btn[aria-disabled="true"]{opacity:.5;pointer-events:none}

    .qrbox{display:flex;gap:16px;align-items:center}
    .qrbox .code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-weight:700;word-break:break-all}
    .row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}

    .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:4px 10px;font-size:12px}

    #wl-msg{font-size:13px;color:var(--muted)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card" id="ticket-card">
      <h1>Ticket</h1>
      <div class="muted">Loading…</div>
    </div>

    <div class="card" style="margin-top:12px">
      <h2 style="margin:0 0 10px;font-size:18px">Mobile Wallet</h2>
      <div class="wallet-row">
        <button id="btn-apple" class="wallet-btn" title="Add to Apple Wallet" aria-disabled="true">${AppleBadgeSVG}</button>
        <button id="btn-google" class="wallet-btn" title="Save to Google Wallet" aria-disabled="true">${GoogleBadgeSVG}</button>
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

  async function loadTicket(){
    // Try both common public endpoints; first one that returns ok wins.
    const endpoints = [
      \`/api/public/tickets/by-token/\${encodeURIComponent(token)}\`,
      \`/api/public/ticket/\${encodeURIComponent(token)}\`
    ];

    let data=null;
    for (const url of endpoints){
      try{
        const r = await fetch(url, { credentials: 'include' });
        if (r.ok){ data = await r.json(); break; }
      }catch(_e){}
    }

    const card = $("#ticket-card");
    if (!data || !data.ok){
      card.innerHTML = "<h1>Ticket</h1><div class='muted'>Kon nie kaartjie laai nie.</div>";
      return;
    }

    const t = data.ticket || {};
    const ev = data.event || {};
    const tt = data.type || {};
    const state = String(t.state || "").toUpperCase();

    const stateColor = state==="UNUSED" ? "#0a7d2b" :
                       state==="IN"     ? "#1f6feb" :
                       state==="OUT"    ? "#936000" :
                       state==="VOID"   ? "#b91c1c" : "#6b7280";

    const qr = t.qr ? \`<img src="/api/public/qr/\${encodeURIComponent(t.qr)}?s=180" alt="QR" width="180" height="180" loading="lazy"/>\` : "";

    card.innerHTML = \`
      <div class="grid">
        <div>
          <h1>\${esc(ev.name||"")}</h1>
          <div class="muted">\${esc(ev.venue||"")}</div>
          <div class="muted">\${ev.starts_at?new Date(ev.starts_at*1000).toLocaleString():''}</div>
          <div style="margin-top:10px">
            <span class="pill">\${esc(tt.name||"Ticket")}</span>
            <span class="pill" style="border-color:\${stateColor};color:\${stateColor}">\${state||"—"}</span>
          </div>
          <div style="margin-top:10px">
            <div><b>Holder:</b> \${esc((t.attendee_first||'') + ' ' + (t.attendee_last||''))}</div>
            <div class="muted">Order: \${esc(data.order?.short_code || '—')}</div>
          </div>
        </div>
        <div class="qrbox">
          \${qr}
          <div class="code">\${esc(t.qr||'')}</div>
        </div>
      </div>\`;
  }

  // Probe whether an endpoint exists (so we can enable the button).
  async function checkWalletEndpoint(url){
    try{
      const r = await fetch(url, { method: 'HEAD' });
      // Consider 200/204/405 as "exists" (405 => method not allowed but route there).
      if (r.status===200 || r.status===204 || r.status===405) return true;
      // Treat 401/403 as "exists but protected" (still OK for our click-through).
      if (r.status===401 || r.status===403) return true;
      return false;
    }catch(_e){ return false; }
  }

  function isIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }
  function isAndroid(){ return /Android/.test(navigator.userAgent); }

  function enableBtn(el, onClick){
    el.setAttribute('aria-disabled','false');
    el.tabIndex = 0;
    el.addEventListener('click', onClick, { once:false });
    el.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
    });
  }

  async function initWalletButtons(){
    const appleBtn  = $("#btn-apple");
    const googleBtn = $("#btn-google");
    const wlMsg     = $("#wl-msg");

    // Platform hint
    if (isIOS()) wlMsg.textContent = "Tip: On iPhone, Apple Wallet is the best experience.";
    else if (isAndroid()) wlMsg.textContent = "Tip: On Android, Google Wallet is the best experience.";

    const [appleOK, googleOK] = await Promise.all([
      checkWalletEndpoint(appleUrl),
      checkWalletEndpoint(googleUrl)
    ]);

    if (appleOK){
      enableBtn(appleBtn, ()=>{
        // Your Apple endpoint should return a .pkpass file (or redirect to one).
        window.location.href = appleUrl;
      });
    }

    if (googleOK){
      enableBtn(googleBtn, ()=>{
        // Your Google endpoint can redirect to a Save link or return a JWT/Save URL.
        // Open in a new tab to preserve the ticket page.
        window.open(googleUrl, '_blank', 'noopener,noreferrer');
      });
    }

    // If neither OK, explain nicely.
    if (!appleOK && !googleOK){
      wlMsg.textContent = "Wallet download is not available yet. Please try again later.";
    }
  }

  // Boot:
  loadTicket();
  initWalletButtons();
</script>
</body>
</html>`;
}
