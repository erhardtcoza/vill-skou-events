// /src/ui/ticket_single.js
// Single-ticket page with Skou logo, event name, attendee + type, and BIG QR.
// Also includes Apple/Google Wallet CTAs that use hosted badge images if configured.

export function ticketSingleHTML(token) {
  const safeToken = String(token || "").replace(/[^a-zA-Z0-9._-]/g, "");
  const appleUrl  = `/api/wallet/apple/by-token/${encodeURIComponent(safeToken)}`;
  const googleUrl = `/api/wallet/google/by-token/${encodeURIComponent(safeToken)}`;

  // Inline SVG fallbacks for wallet badges (used if hosted images not configured).
  const FallbackAppleSVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="236" height="48" viewBox="0 0 236 48" aria-hidden="true" focusable="false">
    <rect x="0.5" y="0.5" width="235" height="47" rx="10" fill="#000"/>
    <rect x="0.5" y="0.5" width="235" height="47" rx="10" fill="none" stroke="#000"/>
    <path fill="#fff" transform="translate(16,10) scale(0.95)"
      d="M18.7 11.2c0-3 1.7-5.7 4.2-7.2-1.5-2.1-3.9-3.4-6.5-3.5-2.7-.3-5.3 1.6-6.6 1.6-1.4 0-3.6-1.6-5.9-1.5-3.1.1-5.9 1.8-7.5 4.5-3.2 5.4-.8 13.3 2.3 17.6 1.5 2.2 3.3 4.7 5.7 4.6 2.3-.1 3.2-1.5 6-1.5 2.7 0 3.6 1.5 5.9 1.4 2.4 0 3.9-2.2 5.4-4.4 1.7-2.5 2.4-4.9 2.4-5 0-.1-5.4-2.1-5.4-7.1z"/>
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

  const FallbackGoogleSVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="260" height="48" viewBox="0 0 260 48" aria-hidden="true" focusable="false">
    <rect x="0.5" y="0.5" width="259" height="47" rx="10" fill="#1A73E8"/>
    <rect x="0.5" y="0.5" width="259" height="47" rx="10" fill="none" stroke="#1A73E8"/>
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
      --accent:#E10600; /* Vinet red if you want to accent pills etc. */
    }
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:var(--bg);color:var(--text)}
    .wrap{max-width:720px;margin:0 auto;padding:16px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px}
    h1{margin:0 0 6px;font-size:22px}
    .muted{color:var(--muted)}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    @media (max-width:720px){ .grid{grid-template-columns:1fr} }

    /* Header with logo + event name */
    .header{display:flex;gap:12px;align-items:center;margin-bottom:8px}
    .logo{width:54px;height:54px;border-radius:10px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden}
    .logo img{max-width:100%;max-height:100%;display:block}

    /* Ticket meta */
    .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:4px 10px;font-size:12px}
    .pill.accent{border-color:var(--accent); color:var(--accent);}

    /* QR area: BIG for security scanning */
    .qrbox{display:flex;gap:16px;align-items:center;justify-content:flex-end}
    .qrbox .code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-weight:700;word-break:break-all}
    .qr{width:300px;height:300px}      /* big QR */
    @media (max-width:720px){ .qr{width:260px;height:260px} }

    /* Wallet CTAs */
    .wallet-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}
    .wallet-btn{display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;background:transparent;cursor:pointer;border-radius:12px;outline:none}
    .wallet-btn img, .wallet-btn svg{display:block}
    .wallet-btn:focus-visible{box-shadow:0 0 0 3px rgba(26,115,232,.35)}
    .wallet-btn[aria-disabled="true"]{opacity:.5;pointer-events:none}

    #wl-msg{font-size:13px;color:var(--muted)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card" id="ticket-card">
      <div class="muted">Loading…</div>
    </div>

    <div class="card" style="margin-top:12px">
      <h2 style="margin:0 0 10px;font-size:18px">Mobile Wallet</h2>
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

  // --- Public settings fetchers (for default logo + hosted wallet badge urls) ---
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

  // --- Ticket loader (renders logo, event name, attendee, type, BIG QR) ---
  async function loadTicket(){
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

    const t  = data.ticket || {};
    const ev = data.event || {};
    const tt = data.type  || {};
    const state = String(t.state || "").toUpperCase();

    // Resolve logo: event.logo_url first, else site default
    let logoUrl = ev.logo_url || null;
    if (!logoUrl){
      const s = await getPublicSettings(['DEFAULT_EVENT_LOGO_URL']);
      logoUrl = s.DEFAULT_EVENT_LOGO_URL || null;
    }
    const logoHTML = logoUrl ? \`<div class="logo"><img src="\${esc(logoUrl)}" alt="Event logo" loading="eager"></div>\`
                             : \`<div class="logo" aria-hidden="true"></div>\`;

    const stateColor = state==="UNUSED" ? "#0a7d2b" :
                       state==="IN"     ? "#1f6feb" :
                       state==="OUT"    ? "#936000" :
                       state==="VOID"   ? "#b91c1c" : "#6b7280";

    const qrHTML = t.qr
      ? \`<img class="qr" src="/api/public/qr/\${encodeURIComponent(t.qr)}?s=600" alt="QR" width="300" height="300" loading="eager"/>\`
      : "";

    const holder = (t.attendee_first||'') + ' ' + (t.attendee_last||'');
    const typeName = tt.name || "Ticket";

    card.innerHTML = \`
      <div class="header">
        \${logoHTML}
        <div>
          <div class="muted" style="font-size:12px">Villiersdorp Landbou Skou</div>
          <h1 style="margin:2px 0 4px">\${esc(ev.name||"")}</h1>
          <div class="muted">\${ev.starts_at?new Date(ev.starts_at*1000).toLocaleString():''} • \${esc(ev.venue||'')}</div>
        </div>
      </div>

      <div class="grid">
        <div>
          <div style="margin-top:8px">
            <div style="font-size:16px"><b>Attendee:</b> \${esc(holder.trim() || '—')}</div>
            <div style="margin-top:8px">
              <span class="pill accent">\${esc(typeName)}</span>
              <span class="pill" style="border-color:\${stateColor};color:\${stateColor}">\${state||"—"}</span>
              <span class="pill">Order: \${esc(data.order?.short_code || '—')}</span>
            </div>
          </div>
        </div>

        <div class="qrbox">
          \${qrHTML}
          <div class="code">\${esc(t.qr||'')}</div>
        </div>
      </div>\`;
  }

  // --- Wallet endpoint probing + artwork + hints ---
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
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', (e)=>{ if (e.key==='Enter'||e.key===' ') { e.preventDefault(); onClick(); }});
  }

  async function applyBadgeArtwork(){
    const appleBtn  = $("#btn-apple");
    const googleBtn = $("#btn-google");
    const s = await getPublicSettings(['WALLET_BADGE_APPLE_URL','WALLET_BADGE_GOOGLE_URL']);

    async function swap(btn, url, alt, w, h){
      if (!url) return;
      try{
        const head = await fetch(url, { method:'HEAD' });
        if (!head.ok) return;
        btn.innerHTML = \`<img src="\${url}" alt="\${alt}" width="\${w}" height="\${h}" loading="lazy">\`;
      }catch(_e){}
    }
    await swap(appleBtn,  s.WALLET_BADGE_APPLE_URL,  'Add to Apple Wallet', 236, 48);
    await swap(googleBtn, s.WALLET_BADGE_GOOGLE_URL, 'Save to Google Wallet', 260, 48);
  }

  async function initWalletButtons(){
    const appleBtn  = $("#btn-apple");
    const googleBtn = $("#btn-google");
    const wlMsg     = $("#wl-msg");

    if (isIOS()) wlMsg.textContent = "Tip: On iPhone, Apple Wallet is the best experience.";
    else if (isAndroid()) wlMsg.textContent = "Tip: On Android, Google Wallet is the best experience.";

    await applyBadgeArtwork();

    const [appleOK, googleOK] = await Promise.all([
      checkWalletEndpoint(appleUrl),
      checkWalletEndpoint(googleUrl)
    ]);

    if (appleOK)  enableBtn(appleBtn,  ()=>{ window.location.href = appleUrl; });
    if (googleOK) enableBtn(googleBtn, ()=>{ window.open(googleUrl, '_blank', 'noopener,noreferrer'); });

    if (!appleOK && !googleOK){
      wlMsg.textContent = "Wallet download is not available yet. Please try again later.";
    }
  }

  // Boot
  loadTicket();
  initWalletButtons();
</script>
</body>
</html>`;
}
