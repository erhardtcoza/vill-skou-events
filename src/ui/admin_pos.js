// /src/ui/admin_pos.js
export const adminPOSJS = `
window.AdminPanels.posadmin = async function renderPOSAdmin(){
  const root = $("panel-pos");
  if (!root) return;

  // ---------- styles ----------
  (function ensureStyles(){
    const id="pos-admin-styles";
    if (document.getElementById(id)) return;
    const s=document.createElement("style");
    s.id=id;
    s.textContent = \`
      .pos-card { border:1px solid #eef1f3; border-radius:12px; padding:16px; }
      table.pos-sessions { width:100%; border-collapse:collapse; }
      .pos-sessions th, .pos-sessions td { padding:8px 10px; border-bottom:1px solid #eef1f3; }
      .pos-sessions th { text-align:left; }
      .pos-sessions td.num { text-align:right; white-space:nowrap; }
      .pos-sessions td.compact { white-space:nowrap; }
      .pos-actions { display:flex; gap:8px; }
      .btn.small { font-size:12px; padding:6px 10px; }
      .muted { color:#6b7280; }
      .pill { background:#f4f6f8; border:1px solid #eef1f3; padding:4px 8px; border-radius:999px; }
      /* modal */
      .pos-modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); display:flex; align-items:center; justify-content:center; z-index:1000; }
      .pos-modal { width:min(920px, 92vw); max-height:90vh; overflow:auto; background:#fff; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.25); }
      .pos-modal header { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid #eef1f3; }
      .pos-modal .body { padding:12px 16px; }
      table.txs { width:100%; border-collapse:collapse; margin-top:10px; }
      .txs th, .txs td { padding:6px 8px; border-bottom:1px solid #eef1f3; }
      .txs td.num { text-align:right; white-space:nowrap; }
    \`;
    document.head.appendChild(s);
  })();

  root.innerHTML = "<h2>POS Sessions</h2><div class='pos-card'><div id='pos-sessions-box'>Loading…</div></div>";

  const box = document.getElementById("pos-sessions-box");

  function rands(cents){ return "R" + (Number(cents||0)/100).toFixed(2); }
  function dt(v){
    if (!v) return "—";
    try {
      const d = new Date((Number(v)||0)*1000);
      if (!isFinite(d)) return "—";
      return d.toLocaleString();
    } catch { return "—"; }
  }

  async function fetchJSON(url, opts){
    try { const r = await fetch(url, { credentials:"include", ...(opts||{}) }); return await r.json(); }
    catch { return { ok:false }; }
  }

  async function loadSessions(){
    const j = await fetchJSON("/api/admin/pos/sessions");
    if (!j.ok) { box.textContent = "Kon nie laai nie."; return; }
    const rows = (j.sessions||[]).map(s=>{
      const open = !s.closed_at;
      const actions = [
        "<button class='btn small outline' data-view='"+s.id+"'>View</button>",
        open
          ? "<button class='btn small' data-close='"+s.id+"'>Close</button>"
          : "",
        "<button class='btn small danger' data-del='"+s.id+"'>Delete</button>",
      ].filter(Boolean).join("");
      return "<tr>"
        +"<td class='compact'>"+s.id+"</td>"
        +"<td>"+esc(s.cashier_name||"")+"</td>"
        +"<td>"+esc(s.gate_name||String(s.gate_id||""))+"</td>"
        +"<td class='compact'>"+dt(s.opened_at)+"</td>"
        +"<td class='compact'>"+dt(s.closed_at)+"</td>"
        +"<td class='num'>"+rands(s.cash_cents)+"</td>"
        +"<td class='num'>"+rands(s.card_cents)+"</td>"
        +"<td>"+esc(s.closing_manager||"")+"</td>"
        +"<td><div class='pos-actions'>"+actions+"</div></td>"
        +"</tr>";
    }).join("");

    box.innerHTML = [
      "<table class='pos-sessions'>",
        "<thead><tr>",
          "<th class='compact'>ID</th>",
          "<th>Cashier</th>",
          "<th>Gate</th>",
          "<th class='compact'>Opened</th>",
          "<th class='compact'>Closed</th>",
          "<th class='num'>Cash</th>",
          "<th class='num'>Card</th>",
          "<th>Closed by</th>",
          "<th>Actions</th>",
        "</tr></thead>",
        "<tbody>", rows || "<tr><td colspan='9' class='muted'>Geen sessies nie.</td></tr>", "</tbody>",
      "</table>",
      "<div style='margin-top:10px' class='muted'>Tip: Klik “View” om transaksies vir oudit te sien.</div>"
    ].join("");

    // wire actions
    box.querySelectorAll("[data-close]").forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.getAttribute("data-close");
        if (!confirm("Close session #"+id+"?")) return;
        const r = await fetchJSON("/api/admin/pos/session/"+encodeURIComponent(id)+"/close", { method:"POST" });
        if (!r.ok){ alert("Kon nie sluit nie."); return; }
        await loadSessions();
      };
    });
    box.querySelectorAll("[data-del]").forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.getAttribute("data-del");
        if (!confirm("Delete session #"+id+"? This cannot be undone.")) return;
        const r = await fetchJSON("/api/admin/pos/session/"+encodeURIComponent(id)+"/delete", { method:"POST" });
        if (!r.ok){ alert("Kon nie uitvee nie."); return; }
        await loadSessions();
      };
    });
    box.querySelectorAll("[data-view]").forEach(btn=>{
      btn.onclick = ()=> openViewer(btn.getAttribute("data-view"));
    });
  }

  async function openViewer(id){
    // Try fetch transactions; show graceful error if API not present yet.
    const j = await fetchJSON("/api/admin/pos/session/"+encodeURIComponent(id)+"/transactions");
    const payments = j.ok ? (j.payments||[]) : [];
    const sales    = j.ok ? (j.sales||[])    : [];
    const totalCash = payments.filter(p=>p.method==="pos_cash").reduce((s,p)=>s+Number(p.amount_cents||0),0);
    const totalCard = payments.filter(p=>p.method==="pos_card").reduce((s,p)=>s+Number(p.amount_cents||0),0);

    const back = document.createElement("div");
    back.className = "pos-modal-backdrop";
    back.innerHTML = [
      "<div class='pos-modal'>",
        "<header><strong>Session #"+id+" · Transactions</strong>",
        "<div style='display:flex;gap:8px;align-items:center'>",
          "<span class='pill'>Cash: "+rands(totalCash)+"</span>",
          "<span class='pill'>Card: "+rands(totalCard)+"</span>",
          "<button class='btn small outline' id='posv-close'>Close</button>",
        "</div>",
        "</header>",
        "<div class='body'>",
          j.ok ? "" : "<div class='muted'>Transactions endpoint not available yet.</div>",
          "<h3 style='margin:8px 0 4px'>Payments</h3>",
          "<table class='txs'><thead><tr><th>When</th><th>Method</th><th>Ref</th><th class='num'>Amount</th></tr></thead><tbody>",
            payments.map(p=>("<tr>"
              +"<td class='compact'>"+dt(p.created_at)+"</td>"
              +"<td>"+esc(p.method||"")+"</td>"
              +"<td>"+esc(p.ref||"")+"</td>"
              +"<td class='num'>"+rands(p.amount_cents)+"</td>"
            +"</tr>")).join("") || "<tr><td colspan='4' class='muted'>Geen betalings</td></tr>",
          "</tbody></table>",
          "<h3 style='margin:14px 0 4px'>Sales</h3>",
          "<table class='txs'><thead><tr><th>When</th><th>Kind</th><th>Device/Cashier</th><th class='num'>Amount</th></tr></thead><tbody>",
            sales.map(s=>("<tr>"
              +"<td class='compact'>"+dt(s.created_at)+"</td>"
              +"<td>"+esc(s.kind||"")+"</td>"
              +"<td>"+esc(s.source||"")+"</td>"
              +"<td class='num'>"+rands(s.amount_cents)+"</td>"
            +"</tr>")).join("") || "<tr><td colspan='4' class='muted'>Geen verkope</td></tr>",
          "</tbody></table>",
        "</div>",
      "</div>"
    ].join("");

    back.addEventListener("click", (e)=>{ if (e.target === back) back.remove(); });
    back.querySelector("#posv-close").onclick = ()=> back.remove();
    document.body.appendChild(back);
  }

  await loadSessions();
};
`;
