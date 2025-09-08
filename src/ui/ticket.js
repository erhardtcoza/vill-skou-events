// /src/ui/ticket.js
import { esc } from "../utils/html.js";

export function ticketHTML(code) {
  const safe = esc(code || "");

  return /*html*/`
<!doctype html>
<html lang="af">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Jou kaartjies · ${safe}</title>
  <link rel="icon" href="/favicon.ico" />
  <style>
    :root {
      --bg:#f7f7f7; --panel:#fff; --ink:#111; --muted:#6b7280;
      --brand:#166534; --brand-ink:#fff; --chip:#e5e7eb;
      --ok:#065f46; --warn:#92400e; --void:#991b1b;
    }
    * { box-sizing:border-box }
    html,body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.45 system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji"; }
    a { color:var(--brand); text-decoration:none }
    header { max-width:960px; margin:20px auto 0; padding:0 16px; }
    h1 { margin:0 0 8px; font-size:28px }
    .lead { color:var(--muted); margin:0 0 20px }
    .grid { max-width:960px; margin:0 auto 40px; padding:0 16px; display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:16px; }
    .card { background:var(--panel); border-radius:14px; box-shadow:0 1px 2px rgba(0,0,0,.05); padding:14px; display:flex; flex-direction:column; gap:10px; }
    .row { display:flex; gap:10px; align-items:center; justify-content:space-between; }
    .tt { font-weight:600; }
    .pill { display:inline-block; padding:2px 8px; border-radius:999px; background:var(--chip); color:#111; font-size:12px }
    .state-unused { color:var(--ok) }
    .state-in { color:var(--ok) }
    .state-out { color:var(--warn) }
    .state-void { color:var(--void) }
    .qr { align-self:center; background:#fff; padding:8px; border-radius:8px; }
    .qr img { display:block; width:200px; height:200px; image-rendering: pixelated; }
    .muted { color:var(--muted); font-size:13px }
    .toolbar { display:flex; gap:8px; flex-wrap:wrap; }
    .btn { display:inline-flex; align-items:center; justify-content:center; padding:8px 12px; border-radius:10px; background:var(--brand); color:var(--brand-ink); font-weight:600; border:0; cursor:pointer }
    .btn.secondary { background:#111; color:#fff }
    .empty { max-width:960px; margin:24px auto; padding:0 16px; color:var(--muted) }
  </style>
</head>
<body>
  <header>
    <h1>Jou kaartjies · ${safe}</h1>
    <p class="lead">Wys die QR by die hek sodat dit gescan kan word.</p>
  </header>

  <div id="root" class="grid" aria-live="polite"></div>
  <p id="empty" class="empty" hidden>Kon nie kaartjies vind met kode <strong>${safe}</strong> nie.</p>

  <script type="module">
    const code = ${JSON.stringify(String(code || ""))};

    // Simple helper to escape text when building small bits
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

    // External QR service (no client libs). Swap later if you prefer in-worker SVG.
    const qrURL = (data, size=220) =>
      \`https://api.qrserver.com/v1/create-qr-code/?size=\${size}x\${size}&data=\${encodeURIComponent(data)}\`;

    async function load() {
      try {
        const r = await fetch(\`/api/public/tickets/by-code/\${encodeURIComponent(code)}\`, { credentials: "include" });
        const j = await r.json().catch(() => ({}));
        if (!j.ok) throw new Error(j.error || "Load failed");
        const list = Array.isArray(j.tickets) ? j.tickets : [];
        render(list);
      } catch (e) {
        console.error(e);
        document.getElementById("empty").hidden = false;
      }
    }

    function stateClass(st) {
      switch ((st||'').toLowerCase()) {
        case 'unused': return 'state-unused';
        case 'in': return 'state-in';
        case 'out': return 'state-out';
        case 'void': return 'state-void';
        default: return '';
      }
    }

    function render(tickets) {
      const root = document.getElementById("root");
      root.innerHTML = "";
      if (!tickets.length) {
        document.getElementById("empty").hidden = false;
        return;
      }
      document.getElementById("empty").hidden = true;

      for (const t of tickets) {
        const who = [t.attendee_first, t.attendee_last].filter(Boolean).join(" ").trim();
        const stateCls = stateClass(t.state);
        const priceR = (Number(t.price_cents||0)/100).toFixed(2);

        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = \`
          <div class="row">
            <div class="tt">\${esc(t.type_name || "Kaartjie")}</div>
            <div class="pill">R\${priceR}</div>
          </div>
          <div class="row">
            <div class="muted">\${who ? esc(who) : ""}</div>
            <div class="\${stateCls} muted">\${esc(t.state || "")}</div>
          </div>
          <div class="qr">
            <img alt="QR code" width="200" height="200" loading="lazy"
                 src="\${qrURL(t.qr, 220)}" />
          </div>
          <div class="toolbar">
            <a class="btn" target="_blank" rel="noopener" href="\${qrURL(t.qr, 500)}">Open groter QR</a>
            <button class="btn secondary" data-copy="\${esc(t.qr)}">Kopieer kode</button>
          </div>
          <div class="muted">Kode: \${esc(t.qr)}</div>
        \`;
        // wire copy
        card.querySelector('button[data-copy]').addEventListener('click', async (ev) => {
          const val = ev.currentTarget.getAttribute('data-copy');
          try { await navigator.clipboard.writeText(val); ev.currentTarget.textContent = "Gekopieer"; setTimeout(()=>ev.currentTarget.textContent="Kopieer kode", 1400); } catch {}
        });
        root.appendChild(card);
      }
    }

    load();
  </script>
</body>
</html>
`;
}
