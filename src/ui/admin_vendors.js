// /src/ui/admin_vendors.js
export const adminVendorsJS = `
window.AdminPanels.vendors = async function renderVendors(){
  const el = $("panel-vendors");
  el.innerHTML = "<h2>Vendors</h2>";

  // header
  const header = document.createElement("div");
  header.style.cssText = "display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:8px";
  header.innerHTML = "<label style='min-width:60px'>Event</label>";
  el.appendChild(header);

  const evs = await fetch("/api/admin/events", {credentials:"include"})
    .then(r=>r.json()).catch(()=>({ok:false,events:[]}));
  if (!evs.ok || !evs.events?.length) {
    el.insertAdjacentHTML("beforeend","<div class='muted'>Kon nie events laai nie.</div>");
    return;
  }

  const sel = document.createElement("select");
  sel.innerHTML = evs.events.map(ev=>"<option value='"+ev.id+"'>"+esc(ev.name)+"</option>").join("");
  header.appendChild(sel);

  const addBtn = document.createElement("button");
  addBtn.textContent = "Add vendor";
  addBtn.className = "btn";
  header.appendChild(addBtn);

  // where the list renders
  const box = document.createElement("div");
  el.appendChild(box);

  // ---------- modal ----------
  const modal = document.createElement("div");
  modal.style.cssText = "position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.35);z-index:1000";
  modal.innerHTML = [
    "<div id='vend-modal-card' style='background:#fff;min-width:320px;max-width:640px;width:95%;border-radius:12px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.2)'>",
      "<h3 id='vend-modal-title' style='margin:0 0 10px'>Vendor</h3>",
      "<form id='vend-form' class='grid' style='grid-template-columns:1fr 1fr;gap:10px'>",
        "<input type='hidden' name='id' />",
        "<input type='hidden' name='event_id' />",

        "<div style='grid-column:span 2'><label>Name</label><input name='name' required placeholder='Vendor name'/></div>",
        "<div><label>Contact person</label><input name='contact_name' placeholder='Contact'/></div>",
        "<div><label>Phone (MSISDN)</label><input name='phone' placeholder='2771…'/></div>",
        "<div><label>Email</label><input name='email' type='email' placeholder='email@…'/></div>",
        "<div><label>Stand number</label><input name='stand_number' placeholder='A1'/></div>",
        "<div><label>Staff quota</label><input name='staff_quota' type='number' min='0' value='0'/></div>",
        "<div><label>Vehicle quota</label><input name='vehicle_quota' type='number' min='0' value='0'/></div>",
      "</form>",
      "<div style='display:flex;gap:10px;justify-content:flex-end;margin-top:12px'>",
        "<button id='vend-cancel' class='btn outline'>Cancel</button>",
        "<button id='vend-save' class='btn'>Save</button>",
      "</div>",
    "</div>"
  ].join("");
  document.body.appendChild(modal);
  modal.addEventListener("click", (e)=>{ if (e.target===modal) closeModal(); });
  document.getElementById("vend-cancel").onclick = ()=>closeModal();

  function openModal(title, values){
    document.getElementById("vend-modal-title").textContent = title;
    const f = document.getElementById("vend-form");
    f.reset();
    f.event_id.value = String(sel.value||"");
    const v = values || {};
    // fill fields if provided
    ["id","name","contact_name","phone","email","stand_number","staff_quota","vehicle_quota","event_id"].forEach(k=>{
      if (f[k]!==undefined && v[k]!==undefined) f[k].value = v[k];
    });
    modal.style.display = "flex";
    setTimeout(()=>document.querySelector("#vend-form input[name=name]")?.focus(), 10);
  }
  function closeModal(){ modal.style.display = "none"; }

  // ---------- list/table ----------
  async function loadV(){
    const id = Number(sel.value||0);
    box.innerHTML = "<div class='muted'>Loading…</div>";

    const j = await fetch("/api/admin/vendors?event_id="+id, {credentials:"include"})
      .then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ box.innerHTML = "<div class='muted'>Kon nie vendors laai nie</div>"; return; }

    const rows = (j.vendors||[]).map(v=>{
      // NB: DO NOT HTML-escape JSON; encode it safely for data-* attribute.
      const payload = encodeURIComponent(JSON.stringify(v));
      return "<tr>"
        +"<td class='td-name'>"+esc(v.name||"")+"</td>"
        +"<td class='td-contact'>"+esc(v.contact_name||"")+(v.phone?(" · "+esc(v.phone)):"")+(v.email?(" · "+esc(v.email)):"")+"</td>"
        +"<td class='td-stand'>"+esc(v.stand_number||"")+"</td>"
        +"<td class='td-actions'>"
          +"<button class='btn tiny vend-edit' data-json='"+payload+"'>Edit</button>"
          +"<button class='btn tiny outline vend-pass' data-id='"+v.id+"' data-kind='staff'>New staff badge</button>"
          +"<button class='btn tiny outline vend-pass' data-id='"+v.id+"' data-kind='vehicle'>New vehicle badge</button>"
        +"</td>"
      +"</tr>";
    }).join("");

    box.innerHTML = [
      "<div style='overflow:auto'>",
        "<table style='width:100%;border-collapse:collapse;table-layout:fixed'>",
          "<colgroup>",
            "<col style='width:36%'>",
            "<col style='width:40%'>",
            "<col style='width:10%'>",
            "<col style='width:14%'>",
          "</colgroup>",
          "<thead>",
            "<tr>",
              "<th style='text-align:left;padding:8px 6px;border-bottom:1px solid #eef1f3'>Name</th>",
              "<th style='text-align:left;padding:8px 6px;border-bottom:1px solid #eef1f3'>Contact</th>",
              "<th style='text-align:left;padding:8px 6px;border-bottom:1px solid #eef1f3'>Stand</th>",
              "<th style='text-align:left;padding:8px 6px;border-bottom:1px solid #eef1f3'>Actions</th>",
            "</tr>",
          "</thead>",
          "<tbody>",
            rows || "<tr><td colspan='4' class='muted' style='padding:10px'>No vendors</td></tr>",
          "</tbody>",
        "</table>",
      "</div>"
    ].join("");

    // event delegation for action buttons
    box.querySelectorAll(".vend-edit").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        try {
          const v = JSON.parse(decodeURIComponent(btn.getAttribute("data-json")||"%7B%7D"));
          openModal("Edit vendor", {
            id: v.id, event_id: v.event_id,
            name: v.name||"", contact_name: v.contact_name||"",
            phone: v.phone||"", email: v.email||"",
            stand_number: v.stand_number||"",
            staff_quota: v.staff_quota ?? 0, vehicle_quota: v.vehicle_quota ?? 0
          });
        } catch {
          alert("Kon nie vendor data lees nie.");
        }
      });
    });

    box.querySelectorAll(".vend-pass").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const vendorId = Number(btn.getAttribute("data-id")||0);
        const kind = btn.getAttribute("data-kind");
        if (!vendorId) return;
        btn.disabled = true; const old = btn.textContent; btn.textContent = "Working…";
        const j = await fetch("/api/admin/vendor/"+vendorId+"/pass/add", {
          method:"POST", credentials:"include",
          headers:{ "content-type":"application/json" },
          body: JSON.stringify({ type: kind, label: kind==="staff" ? "STAFF" : "VEHICLE" })
        }).then(r=>r.json()).catch(()=>({ok:false}));
        btn.disabled = false; btn.textContent = old;
        if (!j.ok || !j.qr){ alert("Kon nie badge skep nie."); return; }
        // open printable badge (server already has /badge/:qr)
        window.open("/badge/"+encodeURIComponent(j.qr), "_blank");
      });
    });
  }

  // save
  document.getElementById("vend-save").onclick = async ()=>{
    const f = document.getElementById("vend-form");
    const payload = {
      id: Number(f.id.value||0),
      event_id: Number(f.event_id.value||0),
      name: String(f.name.value||"").trim(),
      contact_name: String(f.contact_name.value||"").trim() || null,
      phone: String(f.phone.value||"").trim() || null,
      email: String(f.email.value||"").trim() || null,
      stand_number: String(f.stand_number.value||"").trim() || null,
      staff_quota: Number(f.staff_quota.value||0),
      vehicle_quota: Number(f.vehicle_quota.value||0),
    };
    if (!payload.event_id || !payload.name){
      alert("Name en Event is verpligtend.");
      return;
    }

    const btn = document.getElementById("vend-save");
    btn.disabled = true; btn.textContent = "Saving…";
    const res = await fetch("/api/admin/vendors/save", {
      method:"POST", credentials:"include",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify(payload)
    }).then(r=>r.json()).catch(()=>({ok:false}));
    btn.disabled = false; btn.textContent = "Save";

    if (!res.ok){ alert("Kon nie stoor nie."); return; }
    closeModal();
    loadV();
  };

  // actions
  addBtn.onclick = ()=> openModal("Add vendor", { id:"", name:"", contact_name:"", phone:"", email:"", stand_number:"", staff_quota:0, vehicle_quota:0 });
  sel.onchange = loadV;

  // initial render
  loadV();
};
`;
