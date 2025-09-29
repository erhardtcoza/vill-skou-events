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

  /* -------------------- VENDOR MODAL (add/edit) -------------------- */
  const vendorModal = document.createElement("div");
  vendorModal.style.cssText = "position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.35);z-index:1000";
  vendorModal.innerHTML = [
    "<div id='vend-modal-card' style='background:#fff;min-width:320px;max-width:680px;width:95%;border-radius:12px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.2)'>",
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
  document.body.appendChild(vendorModal);
  vendorModal.addEventListener("click", (e)=>{ if (e.target===vendorModal) closeVendorModal(); });
  document.getElementById("vend-cancel").onclick = ()=>closeVendorModal();

  function openVendorModal(title, values){
    document.getElementById("vend-modal-title").textContent = title;
    const f = document.getElementById("vend-form");
    f.reset();
    f.event_id.value = String(sel.value||"");
    const v = values || {};
    ["id","name","contact_name","phone","email","stand_number","staff_quota","vehicle_quota","event_id"].forEach(k=>{
      if (f[k]!==undefined && v[k]!==undefined) f[k].value = v[k];
    });
    vendorModal.style.display = "flex";
    setTimeout(()=>document.querySelector("#vend-form input[name=name]")?.focus(), 10);
  }
  function closeVendorModal(){ vendorModal.style.display = "none"; }

  /* -------------------- PASSES MODAL (view/print/delete/add) -------------- */
  const passesModal = document.createElement("div");
  passesModal.style.cssText = "position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.35);z-index:1001";
  passesModal.innerHTML = [
    "<div style='background:#fff;min-width:320px;max-width:820px;width:96%;border-radius:12px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.2)'>",
      "<div style='display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px'>",
        "<h3 id='passes-title' style='margin:0'>Vendor passes</h3>",
        "<div>",
          "<button id='passes-add-staff' class='btn tiny'>+ Staff badge</button> ",
          "<button id='passes-add-vehicle' class='btn tiny outline'>+ Vehicle badge</button> ",
          "<button id='passes-close' class='btn outline'>Close</button>",
        "</div>",
      "</div>",
      "<div id='passes-body' class='muted'>Loading…</div>",
    "</div>"
  ].join("");
  document.body.appendChild(passesModal);
  passesModal.addEventListener("click", (e)=>{ if (e.target===passesModal) closePassesModal(); });
  document.getElementById("passes-close").onclick = ()=>closePassesModal();

  let __passesVendorId = null;
  function openPassesModal(vendor){
    __passesVendorId = Number(vendor?.id||0);
    document.getElementById("passes-title").textContent = "Badges · " + (vendor?.name||"Vendor");
    passesModal.style.display = "flex";
    loadPasses();
  }
  function closePassesModal(){ passesModal.style.display = "none"; __passesVendorId = null; }

  async function loadPasses(){
    const body = document.getElementById("passes-body");
    const vid = __passesVendorId;
    if (!vid){ body.textContent = "No vendor."; return; }
    body.textContent = "Loading…";
    const j = await fetch("/api/admin/vendor/"+vid+"/passes", {credentials:"include"})
      .then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ body.textContent = "Kon nie passes laai nie."; return; }
    const rows = (j.passes||[]).map(p=>{
      const plate = p.type==="vehicle" ? (p.vehicle_reg||"") : "";
      const state = p.state||"unused";
      const tsIn  = p.first_in_at ? new Date(p.first_in_at*1000).toLocaleString() : "";
      const tsOut = p.last_out_at ? new Date(p.last_out_at*1000).toLocaleString() : "";
      return "<tr>"
        +"<td>"+esc(p.type||"")+"</td>"
        +"<td>"+esc(p.label||"")+"</td>"
        +"<td>"+esc(plate)+"</td>"
        +"<td>"+esc(p.qr||"")+"</td>"
        +"<td>"+esc(state)+"</td>"
        +"<td style='white-space:nowrap'>"+esc(tsIn)+"</td>"
        +"<td style='white-space:nowrap'>"+esc(tsOut)+"</td>"
        +"<td>"
          +"<button class='btn tiny outline pass-print' data-qr='"+encodeURIComponent(p.qr||"")+"'>Print</button> "
          +"<button class='btn tiny pass-del' data-id='"+p.id+"'>Delete</button>"
        +"</td>"
      +"</tr>";
    }).join("");

    body.innerHTML = [
      "<div style='overflow:auto'>",
      "<table style='width:100%;border-collapse:collapse;table-layout:fixed'>",
        "<colgroup>",
          "<col style='width:10%'>",   // type
          "<col style='width:16%'>",   // label
          "<col style='width:12%'>",   // plate
          "<col style='width:20%'>",   // qr
          "<col style='width:10%'>",   // state
          "<col style='width:16%'>",   // first in
          "<col style='width:16%'>",   // last out
          "<col style='width:10%'>",   // actions
        "</colgroup>",
        "<thead>",
          "<tr>",
            "<th style='text-align:left;padding:8px 6px;border-bottom:1px solid #eef1f3'>Type</th>",
            "<th style='text-align:left;padding:8px 6px;border-bottom:1px solid #eef1f3'>Label</th>",
            "<th style='text-align:left;padding:8px 6px;border-bottom:1px solid #eef1f3'>Plate</th>",
            "<th style='text-align:left;padding:8px 6px;border-bottom:1px solid #eef1f3'>QR</th>",
            "<th style='text-align:left;padding:8px 6px;border-bottom:1px solid #eef1f3'>State</th>",
            "<th style='text-align:left;padding:8px 6px;border-bottom:1px solid #eef1f3'>First in</th>",
            "<th style='text-align:left;padding:8px 6px;border-bottom:1px solid #eef1f3'>Last out</th>",
            "<th style='text-align:left;padding:8px 6px;border-bottom:1px solid #eef1f3'>Actions</th>",
          "</tr>",
        "</thead>",
        "<tbody>",
          rows || "<tr><td colspan='8' class='muted' style='padding:10px'>No badges</td></tr>",
        "</tbody>",
      "</table>",
      "</div>"
    ].join("");

    // actions
    body.querySelectorAll(".pass-print").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const qr = decodeURIComponent(btn.getAttribute("data-qr")||"");
        if (qr) window.open("/badge/"+encodeURIComponent(qr), "_blank");
      });
    });
    body.querySelectorAll(".pass-del").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const pid = Number(btn.getAttribute("data-id")||0);
        if (!pid) return;
        if (!confirm("Delete this badge?")) return;
        btn.disabled = true;
        await fetch("/api/admin/vendor/"+vid+"/pass/delete", {
          method:"POST", credentials:"include",
          headers:{ "content-type":"application/json" },
          body: JSON.stringify({ pass_id: pid })
        }).then(r=>r.json()).catch(()=>({ok:false}));
        loadPasses(); // refresh list
      });
    });
  }

  // create from within modal
  document.getElementById("passes-add-staff").onclick = ()=> addPass("staff");
  document.getElementById("passes-add-vehicle").onclick = async ()=>{
    const plate = prompt("Vehicle plate (optional):",""); // simple prompt; can be upgraded to a proper input
    await addPass("vehicle", plate||"");
  };
  async function addPass(kind, vehicle_reg){
    const vid = __passesVendorId;
    if (!vid) return;
    const btnId = kind==="staff" ? "passes-add-staff" : "passes-add-vehicle";
    const btn = document.getElementById(btnId);
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = "Working…";
    const j = await fetch("/api/admin/vendor/"+vid+"/pass/add", {
      method:"POST", credentials:"include",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({ type: kind, label: (kind==="staff"?"STAFF":"VEHICLE"), vehicle_reg: vehicle_reg||undefined })
    }).then(r=>r.json()).catch(()=>({ok:false}));
    btn.disabled = false; btn.textContent = old;
    if (!j.ok || !j.qr){ alert("Kon nie badge skep nie."); return; }
    loadPasses();
    // Open printable
    window.open("/badge/"+encodeURIComponent(j.qr), "_blank");
  }

  /* -------------------- LIST / ACTIONS -------------------- */
  async function loadV(){
    const id = Number(sel.value||0);
    box.innerHTML = "<div class='muted'>Loading…</div>";

    const j = await fetch("/api/admin/vendors?event_id="+id, {credentials:"include"})
      .then(r=>r.json()).catch(()=>({ok:false}));
    if (!j.ok){ box.innerHTML = "<div class='muted'>Kon nie vendors laai nie</div>"; return; }

    const rows = (j.vendors||[]).map(v=>{
      // safe JSON in data attr
      const payload = encodeURIComponent(JSON.stringify(v));
      return "<tr>"
        +"<td class='td-name'>"+esc(v.name||"")+"</td>"
        +"<td class='td-contact'>"+esc(v.contact_name||"")+(v.phone?(" · "+esc(v.phone)):"")+(v.email?(" · "+esc(v.email)):"")+"</td>"
        +"<td class='td-stand'>"+esc(v.stand_number||"")+"</td>"
        +"<td class='td-actions'>"
          +"<button class='btn tiny vend-edit' data-json='"+payload+"'>Edit</button> "
          +"<button class='btn tiny outline vend-passes' data-json='"+payload+"'>Passes</button>"
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

    // action bindings
    box.querySelectorAll(".vend-edit").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        try {
          const v = JSON.parse(decodeURIComponent(btn.getAttribute("data-json")||"%7B%7D"));
          openVendorModal("Edit vendor", {
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
    box.querySelectorAll(".vend-passes").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        try{
          const v = JSON.parse(decodeURIComponent(btn.getAttribute("data-json")||"%7B%7D"));
          openPassesModal(v);
        }catch{ alert("Kon nie vendor data lees nie."); }
      });
    });
  }

  // save vendor
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
    closeVendorModal();
    loadV();
  };

  // actions
  addBtn.onclick = ()=> openVendorModal("Add vendor", { id:"", name:"", contact_name:"", phone:"", email:"", stand_number:"", staff_quota:0, vehicle_quota:0 });
  sel.onchange = loadV;

  // initial render
  loadV();
};
`;
