// /src/ui/admin_sitesettings.js
export const adminSiteSettingsJS = `
window.AdminPanels.settings = async function renderSettings(){
  const el = $("panel-settings");
  el.innerHTML = "<h2>Site Settings</h2><div class='muted'>Loading…</div>";
  const j = await fetch("/api/admin/settings").then(r=>r.json()).catch(()=>({ok:false,settings:{}}));
  const S = j.ok ? (j.settings||{}) : {};

  // helpers
  const get = (k, d="") => (S[k] ?? d);
  const save = async (updates) => {
    const r = await fetch("/api/admin/settings/update", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({ updates })
    });
    if (!r.ok) { alert("Save failed"); return; }
    alert("Saved");
  };

  // sub-tabs UI
  el.innerHTML = [
    "<h2>Site Settings</h2>",
    "<div class='tabs' style='margin-top:0'>",
      "<div class='tab active' data-sub='general'>General</div>",
      "<div class='tab' data-sub='whatsapp'>WhatsApp</div>",
      "<div class='tab' data-sub='yoco'>Yoco</div>",
    "</div>",

    // General
    "<div id='sub-general'>",
      "<div style='display:grid;grid-template-columns:1fr 1fr;gap:12px'>",
        "<div><label>Site Name</label><input id='SITE_NAME' value='"+esc(get("SITE_NAME","Villiersdorp Skou"))+"'/></div>",
        "<div><label>Logo URL</label><input id='SITE_LOGO_URL' value='"+esc(get("SITE_LOGO_URL",""))+"'/></div>",
      "</div>",
      "<div style='margin-top:10px'><button id='saveGeneral' class='btn primary' style='padding:10px 12px;border-radius:10px;border:0;background:#0a7d2b;color:#fff;font-weight:700;cursor:pointer'>Save General</button></div>",
      "<hr style='margin:16px 0'/>",
    "</div>",

    // WhatsApp
    "<div id='sub-whatsapp' class='hide'>",
      "<div style='display:grid;grid-template-columns:1fr 1fr;gap:12px'>",
        "<div><label>WHATSAPP_TOKEN</label><input id='WHATSAPP_TOKEN' value='"+esc(get("WHATSAPP_TOKEN",""))+"'/></div>",
        "<div><label>VERIFY_TOKEN</label><input id='VERIFY_TOKEN' value='"+esc(get("VERIFY_TOKEN",""))+"'/></div>",
        "<div><label>PHONE_NUMBER_ID</label><input id='PHONE_NUMBER_ID' value='"+esc(get("PHONE_NUMBER_ID",""))+"'/></div>",
        "<div><label>BUSINESS_ID</label><input id='BUSINESS_ID' value='"+esc(get("BUSINESS_ID",""))+"'/></div>",
        "<div><label>PUBLIC_BASE_URL</label><input id='PUBLIC_BASE_URL' value='"+esc(get("PUBLIC_BASE_URL",""))+"'/></div>",
      "</div>",
      "<div style='margin-top:10px;display:flex;gap:8px;flex-wrap:wrap'>",
        "<button id='saveWA' class='btn primary' style='padding:10px 12px;border-radius:10px;border:0;background:#0a7d2b;color:#fff;font-weight:700;cursor:pointer'>Save WhatsApp</button>",
        "<button id='syncTemplates' class='btn' style='padding:10px 12px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;cursor:pointer'>Sync templates</button>",
        "<button id='newTemplate' class='btn' style='padding:10px 12px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;cursor:pointer'>New template</button>",
      "</div>",
      "<hr style='margin:16px 0'/>",
    "</div>",

    // Yoco
    "<div id='sub-yoco' class='hide'>",
      "<div><label>Mode</label>",
        "<select id='YOCO_MODE'>",
          "<option value='sandbox' ", (get("YOCO_MODE","sandbox")!=="live"?"selected":""), ">Sandbox</option>",
          "<option value='live' ", (get("YOCO_MODE","sandbox")==="live"?"selected":""), ">Live</option>",
        "</select>",
      "</div>",
      "<div style='margin:12px 0; font-weight:700'>Sandbox (Test) Keys</div>",
      "<div style='display:grid;grid-template-columns:1fr 1fr;gap:12px'>",
        "<div><label>Test Public Key</label><input id='YOCO_TEST_PUBLIC_KEY' value='"+esc(get("YOCO_TEST_PUBLIC_KEY",""))+"'/></div>",
        "<div><label>Test Secret Key</label><input id='YOCO_TEST_SECRET_KEY' value='"+esc(get("YOCO_TEST_SECRET_KEY",""))+"'/></div>",
      "</div>",
      "<div style='margin:12px 0; font-weight:700'>Live Keys</div>",
      "<div style='display:grid;grid-template-columns:1fr 1fr;gap:12px'>",
        "<div><label>Live Public Key</label><input id='YOCO_LIVE_PUBLIC_KEY' value='"+esc(get("YOCO_LIVE_PUBLIC_KEY",""))+"'/></div>",
        "<div><label>Live Secret Key</label><input id='YOCO_LIVE_SECRET_KEY' value='"+esc(get("YOCO_LIVE_SECRET_KEY",""))+"'/></div>",
      "</div>",
      "<div style='margin-top:10px'><button id='saveYoco' class='btn primary' style='padding:10px 12px;border-radius:10px;border:0;background:#0a7d2b;color:#fff;font-weight:700;cursor:pointer'>Save Yoco</button></div>",
    "</div>"
  ].join("");

  // sub-tabs logic
  const tabs = el.querySelectorAll(".tabs .tab");
  const panels = {
    general: el.querySelector("#sub-general"),
    whatsapp: el.querySelector("#sub-whatsapp"),
    yoco: el.querySelector("#sub-yoco")
  };
  function showSub(name){
    tabs.forEach(t=>t.classList.toggle("active", t.dataset.sub===name));
    Object.values(panels).forEach(p=>p.classList.add("hide"));
    (panels[name]||panels.general).classList.remove("hide");
  }
  tabs.forEach(t=> t.onclick = ()=> showSub(t.dataset.sub||"general"));
  showSub("general");

  // save handlers
  el.querySelector("#saveGeneral").onclick = ()=> save({
    SITE_NAME: (document.getElementById("SITE_NAME").value||"").trim(),
    SITE_LOGO_URL: (document.getElementById("SITE_LOGO_URL").value||"").trim()
  });

  el.querySelector("#saveWA").onclick = ()=> save({
    WHATSAPP_TOKEN: (document.getElementById("WHATSAPP_TOKEN").value||"").trim(),
    VERIFY_TOKEN: (document.getElementById("VERIFY_TOKEN").value||"").trim(),
    PHONE_NUMBER_ID: (document.getElementById("PHONE_NUMBER_ID").value||"").trim(),
    BUSINESS_ID: (document.getElementById("BUSINESS_ID").value||"").trim(),
    PUBLIC_BASE_URL: (document.getElementById("PUBLIC_BASE_URL").value||"").trim()
  });

  el.querySelector("#saveYoco").onclick = ()=> save({
    YOCO_MODE: (document.getElementById("YOCO_MODE").value||"sandbox"),
    YOCO_TEST_PUBLIC_KEY: (document.getElementById("YOCO_TEST_PUBLIC_KEY").value||"").trim(),
    YOCO_TEST_SECRET_KEY: (document.getElementById("YOCO_TEST_SECRET_KEY").value||"").trim(),
    YOCO_LIVE_PUBLIC_KEY: (document.getElementById("YOCO_LIVE_PUBLIC_KEY").value||"").trim(),
    YOCO_LIVE_SECRET_KEY: (document.getElementById("YOCO_LIVE_SECRET_KEY").value||"").trim()
  });

  // template actions (safe placeholders if API not present)
  const syncBtn = el.querySelector("#syncTemplates");
  if (syncBtn) syncBtn.onclick = async ()=>{
    try{
      const r = await fetch("/api/admin/whatsapp/templates/sync", { method:"POST" });
      const j = await r.json().catch(()=>({ok:false}));
      if (!j.ok) throw new Error(j.error||"Sync failed");
      alert("Templates synced");
    }catch(e){ alert(e.message||"Not available"); }
  };
  const newBtn = el.querySelector("#newTemplate");
  if (newBtn) newBtn.onclick = async ()=>{
    const name = prompt("Template name (snake_case)"); if (!name) return;
    const lang = prompt("Language (e.g. af or en_US)", "af") || "af";
    // Simple stub payload; extend later with header/body/buttons
    try{
      const r = await fetch("/api/admin/whatsapp/templates/create", {
        method:"POST", headers:{ "content-type":"application/json" },
        body: JSON.stringify({ name, language: lang, category: "TRANSACTIONAL" })
      });
      const j = await r.json().catch(()=>({ok:false}));
      if (!j.ok) throw new Error(j.error||"Create failed");
      alert("Template requested");
    }catch(e){ alert(e.message||"Not available"); }
  };

  // allow deep-link switch via main shell
  window.AdminPanels.settingsSwitch = showSub;
};
`;
