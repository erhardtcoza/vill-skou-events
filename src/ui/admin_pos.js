// /src/ui/admin_pos.js
export const adminPosJS = `
window.AdminPanels.pos = async function renderPos(){
  const el = $("panel-pos");
  el.innerHTML = "<h2>POS Sessions</h2>";

  // quick styles for neat alignment
  const style = document.createElement("style");
  style.textContent = \`
    .pos-table { width:100%; border-collapse:collapse; }
    .pos-table th, .pos-table td { padding:8px 10px; border-bottom:1px solid #eef1f3; }
    .pos-table th { text-align:left; }
    .pos-table td.num, .pos-table th.num { text-align:right; }
    .pos-actions { display:flex; gap:8px; }
    .pill-open { background:#fff5e6; color:#8a5a00; padding:2px 8px; border-radius:999px; font-size:12px; }
    .pill-closed { background:#e8f7ee; color:#0a6b3a; padding:2px 8px; border-radius:999px; font-size:12px; }
    .drawer { margin-top:14px; border:1px solid #eef1f3; border-radius:12px; padding:12px; display:none; }
    .drawer.open { display:block; }
    .btn.small { padding:6px 10px; font-size:13px; }
    .muted { color:#6a7480; }
  \`;
  document.head.appendChild(style);

  function cents(n){ return "R" + (Number(n||0)/100).toFixed(2); }
  function dt(sec){
    if (!sec) return "<span class='muted'>—</span>";
    const d = new Date((Number(sec)||0)*1000);
    return d.toLocaleDateString() + ", " + d.toLocaleTimeString();
  }

  const box = document.createElement("div");
  el.appendChild(box);

  const drawer = document.createElement("div");
  drawer.className = "drawer";
  el.appendChild(drawer);

  async function load(){
    const j = await fetch("/api/admin/pos/sessions", { credentials:"include" })
      .then(r=>r.json()).catch(()=>({ok:false,sessions:[]}));
    if (!j.ok){ box.innerHTML = "<div class='muted'>Kon nie laai nie.</div>"; return; }

    const rows = (j.sessions||[]).map(s=>{
      const isClosed = !!s.closed_at;
      const pill = isClosed
        ? "<span class='pill-closed'>closed</span>"
        : "<span class='pill-open'>open</span>";

      const act = [
        "<div class='pos-actions'>",
          "<button class='btn small outline' data-view='"+s.id+"'>View</button>",
          isClosed ? "" :
            "<button class='btn small' data-close='"+s.id+"'>Close</button>",
          "<button class='btn small danger' data-del='"+s.id+"'>Delete</button>",
        "</div>"
      ].join("");

      return "<tr>"
        + "<td class='num'>"+s.id+"</td>"
        + "<td>"+esc(s.cashier_name||"")+"</td>"
        + "<td>"+esc(s.gate_name||"")+"</td>"
        + "<td>"+dt(s.opened_at)+"</td>"
        + "<td>"+dt(s.closed_at)+"</td>"
        + "<td class='num'>"+cents(s.cash_cents)+"</td>"
        + "<td class='num'>"+cents(s.card_cents)+"</td>"
        + "<td>"+esc(s.closing_manager||"")+"</td>"
        + "<td>"+pill+"</td>"
        + "<td>"+act+"</td>"
        + "</tr>";
    }).join("");

    box.innerHTML = [
      "<table class='pos-table'>",
        "<thead>",
          "<tr>",
            "<th class='num'>ID</th>",
            "<th>Cashier</th>",
            "<th>Gate</th>",
            "<th>Opened</th>",
            "<th>Closed</th>",
            "<th class='num'>Cash</th>",
            "<th class='num'>Card</th>",
            "<th>Closed by</th>",
            "<th>Status</th>",
            "<th>Actions</th>",
          "</tr>",
        "</thead>",
        "<tbody>", rows || "<tr><td colspan='10' class='muted'>Geen sessies</td></tr>", "</tbody>",
      "</table>"
    ].join("");

    // wire actions
    box.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>openView(b.dataset.view));
    box.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>doClose(b.dataset.close));
    box.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>doDelete(b.dataset.del));
  }

  async function doClose(id){
    const who = prompt("Closing manager name (optional):",""); // simple
    const r = await fetch("/api/admin/pos/session/"+encodeURIComponent(id)+"/close", {
      method:"POST", credentials:"include",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({ closing_manager: who || null })
    }).then(r=>r.json()).catch(()=>({ok:false}));
    if (!r.ok) alert(r.error || "Close failed");
    await load();
  }

  async function doDelete(id){
    if (!confirm("Delete session "+id+"? This will also delete its payments.")) return;
    const r = await fetch("/api/admin/pos/session/"+encodeURIComponent(id)+"/delete", {
      method:"POST", credentials:"include"
    }).then(r=>r.json()).catch(()=>({ok:false}));
    if (!r.ok) alert(r.error || "Delete failed");
    // if the details drawer shows this id, hide it
    if (drawer.dataset.forId === String(id)) drawer.classList.remove("open");
    await load();
  }

  async function openView(id){
    drawer.dataset.forId = String(id);
    drawer.innerHTML = "<div class='muted'>Loading…</div>";
    drawer.classList.add("open");

    const j = await fetch("/api/admin/pos/session/"+encodeURIComponent(id)+"/details", {
      credentials:"include"
    }).then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ drawer.innerHTML = "<div class='muted'>Kon nie details laai nie.</div>"; return; }

    const s = j.session || {};
    const pays = j.payments || [];

    const rows = pays.map(p=>(
      "<tr>"
        +"<td>"+p.id+"</td>"
        +"<td>"+(p.method==="pos_cash"?"Cash":"Card")+"</td>"
        +"<td class='num'>R"+(p.amount_cents/100).toFixed(2)+"</td>"
        +"<td>"+esc(p.reference||"")+"</td>"
        +"<td>"+(new Date(p.created_at*1000)).toLocaleString()+"</td>"
      +"</tr>"
    )).join("");

    drawer.innerHTML = [
      "<div style='display:flex;justify-content:space-between;gap:10px;align-items:center'>",
        "<h3 style='margin:0'>Session #"+s.id+" · "+esc(s.cashier_name||"")+"</h3>",
        "<button class='btn small outline' id='pos-close-drawer'>Close</button>",
      "</div>",
      "<div class='muted' style='margin-bottom:10px'>Gate: "+esc(s.gate_name||"")+" · Opened "+(s.opened_at?new Date(s.opened_at*1000).toLocaleString():"—")
        +" · Closed "+(s.closed_at?new Date(s.closed_at*1000).toLocaleString():"—")
        +"</div>",
      "<table class='pos-table'>",
        "<thead><tr><th>ID</th><th>Method</th><th class='num'>Amount</th><th>Ref</th><th>When</th></tr></thead>",
        "<tbody>", rows || "<tr><td colspan='5' class='muted'>Geen transaksies</td></tr>", "</tbody>",
      "</table>"
    ].join("");

    document.getElementById("pos-close-drawer").onclick = ()=>drawer.classList.remove("open");
  }

  await load();
};
`;