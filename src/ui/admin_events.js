// /src/ui/admin_events.js
export const adminEventsJS = `
window.AdminPanels.events = async function renderEvents(){
  const el = $("panel-events");
  if (!el) return;

  // ---------- styles (once) ----------
  (function ensureStyles(){
    const id = "ev-admin-styles";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = \`
      .ev-card-actions { margin-bottom:10px; display:flex; gap:8px; }
      table.ev-table { width:100%; border-collapse:collapse; }
      .ev-table th, .ev-table td { padding:10px 12px; border-bottom:1px solid #eef1f3; }
      .ev-table th { text-align:left; }
      .ev-table td.num, .ev-table th.num { text-align:right; white-space:nowrap; }
      .ev-table td.center, .ev-table th.center { text-align:center; }
      .ev-actions { display:flex; gap:8px; }
      .btn.small { font-size:12px; padding:6px 10px; }
      .btn.danger { background:#d92d20; color:#fff; border:1px solid #d92d20; }
      .pill { background:#f4f6f8; border:1px solid #eef1f3; padding:4px 8px; border-radius:999px; }
      /* modal */
      .ev-modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); display:flex; align-items:center; justify-content:center; z-index:1000; }
      .ev-modal { width:min(800px, 94vw); background:#fff; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.25); }
      .ev-modal header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid #eef1f3; }
      .ev-modal .body { padding:14px 16px; }
      .ev-form { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
      .ev-form .full { grid-column: 1 / -1; }
      .ev-form label { display:block; font-weight:600; margin:0 0 4px; }
      .ev-form input, .ev-form select, .ev-form textarea {
        width:100%; padding:8px 10px; border:1px solid #e5e7eb; border-radius:8px; font:inherit;
      }
      .ev-modal .footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid #eef1f3; }
      .muted { color:#667085; }
    \`;
    document.head.appendChild(s);
  })();

  el.innerHTML = "<h2 style='margin-top:0'>Events</h2><div class='ev-card-actions'><button id='ev-add' class='btn'>Add event</button></div><div id='ev-list'>Loading…</div>";

  const box = $("ev-list");

  function fmtDateRange(s,e){
    const f = (ts)=> {
      if (!ts) return "";
      const d = new Date(Number(ts)*1000);
      return isFinite(d) ? d.toLocaleDateString() : "";
    };
    const ds = f(s), de = f(e);
    if (ds && de && ds !== de) return ds + " → " + de;
    return ds || de || "—";
  }

  async function getJSON(url){
    try { const r = await fetch(url, { credentials:"include" }); return await r.json(); }
    catch { return { ok:false }; }
  }
  async function postJSON(url, data){
    try {
      const r = await fetch(url, {
        method:"POST",
        headers:{ "content-type":"application/json" },
        credentials:"include",
        body: JSON.stringify(data||{})
      });
      return await r.json();
    } catch { return { ok:false }; }
  }

  async function loadList(){
    const j = await getJSON("/api/admin/events");
    if (!j.ok){ box.textContent = "Kon nie laai nie."; return; }

    // Filter out deleted if any slipped through
    const rows = (j.events||[])
      .filter(ev => String(ev.status||"").toLowerCase() !== "deleted")
      .map(ev => (
        "<tr>"
          +"<td class='num'>"+ev.id+"</td>"
          +"<td>"+esc(ev.name||"")+"</td>"
          +"<td class='center'>"+esc(ev.slug||"")+"</td>"
          +"<td>"+esc(ev.venue||"")+"</td>"
          +"<td class='center'>"+fmtDateRange(ev.starts_at, ev.ends_at)+"</td>"
          +"<td class='center'>"+esc(ev.status||"")+"</td>"
          +"<td><div class='ev-actions'>"
            +"<button class='btn small outline' data-ev-edit='"+ev.id+"'>Edit</button>"
            +"<button class='btn small danger' data-ev-del='"+ev.id+"'>Delete</button>"
          +"</div></td>"
        +"</tr>"
      )).join("");

    box.innerHTML = [
      "<table class='ev-table'>",
        "<thead><tr>",
          "<th class='num'>ID</th>",
          "<th>Name</th>",
          "<th class='center'>Slug</th>",
          "<th>Venue</th>",
          "<th class='center'>When</th>",
          "<th class='center'>Status</th>",
          "<th>Actions</th>",
        "</tr></thead>",
        "<tbody>", rows || "<tr><td colspan='7' class='muted'>Geen events</td></tr>", "</tbody>",
      "</table>"
    ].join("");

    // wire edit/delete
    box.querySelectorAll("[data-ev-edit]").forEach(b=>{
      b.onclick = ()=> openForm(Number(b.getAttribute("data-ev-edit"))||0);
    });
    box.querySelectorAll("[data-ev-del]").forEach(b=>{
      b.onclick = async ()=>{
        const id = Number(b.getAttribute("data-ev-del"))||0;
        if (!id) return;
        if (!confirm("Delete event #"+id+"? This is a soft delete (status = deleted).")) return;
        const res = await postJSON("/api/admin/events/save", { id, status:"deleted" });
        if (!res.ok) { alert("Kon nie uitvee nie."); return; }
        await loadList();
      };
    });
  }

  async function openForm(id){
    let ev = {
      id: 0, name:"", slug:"", venue:"",
      starts_at: 0, ends_at: 0, status: "active",
      hero_url: "", poster_url: "", gallery_urls: ""
    };
    if (id) {
      const j = await getJSON("/api/admin/events/"+id);
      if (j.ok && j.event) ev = j.event;
    }

    const back = document.createElement("div");
    back.className = "ev-modal-backdrop";
    back.innerHTML = [
      "<div class='ev-modal'>",
        "<header>",
          "<strong>", id ? "Edit event #"+id : "Add event", "</strong>",
          "<button class='btn small outline' id='ev-close-x'>Close</button>",
        "</header>",
        "<div class='body'>",
          "<form id='ev-form' class='ev-form'>",
            "<div class='full'><label>Name</label><input id='f-name' value='"+esc(ev.name||"")+"' required></div>",
            "<div><label>Slug</label><input id='f-slug' value='"+esc(ev.slug||"")+"' placeholder='skou-2025' required></div>",
            "<div><label>Status</label>",
              "<select id='f-status'>",
                ["active","draft","archived","deleted"].map(s=>"<option value='"+s+"' "+(String(ev.status||"")===s?"selected":"")+">"+s+"</option>").join(""),
              "</select>",
            "</div>",
            "<div class='full'><label>Venue</label><input id='f-venue' value='"+esc(ev.venue||"")+"'></div>",
            "<div><label>Starts (epoch seconds)</label><input id='f-start' type='number' value='"+(Number(ev.starts_at||0))+"'></div>",
            "<div><label>Ends (epoch seconds)</label><input id='f-end' type='number' value='"+(Number(ev.ends_at||0))+"'></div>",
            "<div class='full'><label>Hero URL</label><input id='f-hero' value='"+esc(ev.hero_url||"")+"'></div>",
            "<div class='full'><label>Poster URL</label><input id='f-poster' value='"+esc(ev.poster_url||"")+"'></div>",
            "<div class='full'><label>Gallery URLs (comma separated)</label><textarea id='f-gallery' rows='2'>"+esc(ev.gallery_urls||"")+"</textarea></div>",
          "</form>",
          "<div class='muted' style='margin-top:8px'>Tip: For dates you can paste a UNIX timestamp (seconds). Current range shown in list is formatted automatically.</div>",
        "</div>",
        "<div class='footer'>",
          (id ? "<button class='btn small danger' id='ev-soft-delete'>Delete</button>" : ""),
          "<button class='btn small outline' id='ev-cancel'>Cancel</button>",
          "<button class='btn' id='ev-save'>Save</button>",
        "</div>",
      "</div>"
    ].join("");

    function close(){ back.remove(); }
    back.addEventListener("click", (e)=>{ if (e.target === back) close(); });
    back.querySelector("#ev-close-x").onclick = close;
    back.querySelector("#ev-cancel").onclick = (e)=>{ e.preventDefault(); close(); };

    back.querySelector("#ev-save").onclick = async (e)=>{
      e.preventDefault();
      const payload = {
        id: id||0,
        name: $("f-name").value.trim(),
        slug: $("f-slug").value.trim(),
        status: $("f-status").value.trim(),
        venue: $("f-venue").value.trim(),
        starts_at: Number($("f-start").value||0),
        ends_at: Number($("f-end").value||0),
        hero_url: $("f-hero").value.trim() || null,
        poster_url: $("f-poster").value.trim() || null,
        gallery_urls: $("f-gallery").value.trim() || null,
      };
      if (!payload.name || !payload.slug){ alert("Name and Slug are required."); return; }
      const res = await postJSON("/api/admin/events/save", payload);
      if (!res.ok){ alert("Kon nie stoor nie."); return; }
      close(); loadList();
    };

    const delBtn = back.querySelector("#ev-soft-delete");
    if (delBtn){
      delBtn.onclick = async (e)=>{
        e.preventDefault();
        if (!confirm("Delete this event? This sets status = deleted.")) return;
        const res = await postJSON("/api/admin/events/save", { id, status:"deleted" });
        if (!res.ok){ alert("Kon nie uitvee nie."); return; }
        close(); loadList();
      };
    }

    document.body.appendChild(back);
  }

  $("ev-add").onclick = ()=> openForm(0);

  // initial
  await loadList();
};
`;
