// /src/ui/admin_sitesettings.js

export const adminSiteSettingsJS = `
(function(){
  const API = {
    settings_get: "/api/admin/settings",
    settings_set: "/api/admin/settings/update",
    wa_templates_list: "/api/admin/whatsapp/templates",
    wa_templates_sync: "/api/admin/whatsapp/templates/sync",
    wa_templates_create: "/api/admin/whatsapp/templates/create"
  };

  function hEsc(s){ return String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }

  window.AdminPanels.settings = async function renderSettings(){
    const el = $("panel-settings");
    el.innerHTML = "<h2>Site Settings</h2><div class='muted'>Loading…</div>";

    let S = {};
    try {
      const j = await fetch(API.settings_get).then(r=>r.json());
      if (j && j.ok) S = j.settings || {};
    } catch {}
    // Defaults
    const YOCO_MODE = S.YOCO_MODE || "sandbox";

    // Build the settings UI (General • WhatsApp • Yoco)
    el.innerHTML = [
      "<h2>Site Settings</h2>",
      "<div class='tabs' style='margin-top:0'>",
        "<div class='tab active' data-sub='general'>General</div>",
        "<div class='tab' data-sub='whatsapp'>WhatsApp</div>",
        "<div class='tab' data-sub='yoco'>Yoco</div>",
      "</div>",

      // --- General ---
      "<div id='sub-general'>",
        "<div class='row'>",
          "<div>",
            "<label>Site Name</label>",
            "<input id='SITE_NAME' value='", hEsc(S.SITE_NAME||""), "'/>",
          "</div>",
          "<div>",
            "<label>Logo URL</label>",
            "<input id='SITE_LOGO_URL' value='", hEsc(S.SITE_LOGO_URL||""), "'/>",
          "</div>",
        "</div>",
        "<div class='row'>",
          "<div>",
            "<label>PUBLIC_BASE_URL</label>",
            "<input id='PUBLIC_BASE_URL' value='", hEsc(S.PUBLIC_BASE_URL||""), "'/>",
            "<div class='muted' style='margin-top:4px'>Example: https://tickets.villiersdorpskou.co.za</div>",
          "</div>",
          "<div></div>",
        "</div>",
        "<div style='margin-top:12px'><button class='btn primary' id='saveGeneral'>Save General</button></div>",
        "<hr style='margin:16px 0'/>",
      "</div>",

      // --- WhatsApp ---
      "<div id='sub-whatsapp' class='hide'>",
        "<h3 style='margin:0 0 10px'>WhatsApp Settings</h3>",
        "<div class='row'>",
          "<div>",
            "<label>VERIFY_TOKEN</label>",
            "<input id='VERIFY_TOKEN' value='", hEsc(S.VERIFY_TOKEN||""), "'/>",
          "</div>",
          "<div>",
            "<label>WHATSAPP_TOKEN</label>",
            "<input id='WHATSAPP_TOKEN' value='", hEsc(S.WHATSAPP_TOKEN||""), "'/>",
          "</div>",
        "</div>",
        "<div class='row'>",
          "<div>",
            "<label>PHONE_NUMBER_ID</label>",
            "<input id='PHONE_NUMBER_ID' value='", hEsc(S.PHONE_NUMBER_ID||""), "'/>",
          "</div>",
          "<div>",
            "<label>BUSINESS_ID</label>",
            "<input id='BUSINESS_ID' value='", hEsc(S.BUSINESS_ID||""), "'/>",
          "</div>",
        "</div>",
        "<div class='row'>",
          "<div>",
            "<label>WHATSAPP_TEMPLATE_NAME</label>",
            "<input id='WHATSAPP_TEMPLATE_NAME' value='", hEsc(S.WHATSAPP_TEMPLATE_NAME||""), "'/>",
          "</div>",
          "<div>",
            "<label>WHATSAPP_TEMPLATE_LANG</label>",
            "<input id='WHATSAPP_TEMPLATE_LANG' value='", hEsc(S.WHATSAPP_TEMPLATE_LANG||"en_US"), "'/>",
          "</div>",
        "</div>",
        "<div style='margin-top:12px'><button class='btn primary' id='saveWA'>Save WhatsApp</button></div>",

        "<h3 style='margin:16px 0 8px'>Templates</h3>",
        "<div class='row'>",
          "<div class='split'>",
            "<button class='btn' id='syncTemplates'>Sync templates</button>",
            "<button class='btn' id='newTemplate'>New template</button>",
          "</div>",
        "</div>",
        "<div id='waTmplBox' style='margin-top:10px' class='muted'>Loading templates…</div>",
        "<hr style='margin:16px 0'/>",
      "</div>",

      // --- Yoco ---
      "<div id='sub-yoco' class='hide'>",
        "<h3 style='margin:0 0 10px'>Yoco Settings</h3>",
        "<div class='row'>",
          "<div>",
            "<label>Mode</label>",
            "<select id='YOCO_MODE'>",
              "<option value='sandbox' ", (YOCO_MODE!=="live"?"selected":""), ">Sandbox</option>",
              "<option value='live' ", (YOCO_MODE==="live"?"selected":""), ">Live</option>",
            "</select>",
          "</div>",
          "<div></div>",
        "</div>",

        "<h4 style='margin:12px 0 6px'>Sandbox keys</h4>",
        "<div class='row'>",
          "<div>",
            "<label>Test public key</label>",
            "<input id='YOCO_TEST_PUBLIC_KEY' value='", hEsc(S.YOCO_TEST_PUBLIC_KEY||""), "'/>",
          "</div>",
          "<div>",
            "<label>Test secret key</label>",
            "<input id='YOCO_TEST_SECRET_KEY' value='", hEsc(S.YOCO_TEST_SECRET_KEY||""), "'/>",
          "</div>",
        "</div>",
        "<div class='row'>",
          "<div>",
            "<label>Test webhook secret</label>",
            "<input id='YOCO_TEST_WEBHOOK_SECRET' value='", hEsc(S.YOCO_TEST_WEBHOOK_SECRET||""), "'/>",
          "</div>",
          "<div></div>",
        "</div>",

        "<h4 style='margin:12px 0 6px'>Live keys</h4>",
        "<div class='row'>",
          "<div>",
            "<label>Live public key</label>",
            "<input id='YOCO_LIVE_PUBLIC_KEY' value='", hEsc(S.YOCO_LIVE_PUBLIC_KEY||""), "'/>",
          "</div>",
          "<div>",
            "<label>Live secret key</label>",
            "<input id='YOCO_LIVE_SECRET_KEY' value='", hEsc(S.YOCO_LIVE_SECRET_KEY||""), "'/>",
          "</div>",
        "</div>",
        "<div class='row'>",
          "<div>",
            "<label>Live webhook secret</label>",
            "<input id='YOCO_LIVE_WEBHOOK_SECRET' value='", hEsc(S.YOCO_LIVE_WEBHOOK_SECRET||""), "'/>",
          "</div>",
          "<div></div>",
        "</div>",

        "<div style='margin-top:12px'><button class='btn primary' id='saveYoco'>Save Yoco</button></div>",
      "</div>"
    ].join("");

    // Sub-tab logic
    const subtabs = el.querySelectorAll(".tabs .tab");
    const pGeneral = $("sub-general");
    const pWA = $("sub-whatsapp");
    const pY = $("sub-yoco");
    subtabs.forEach(t=>{
      t.onclick = ()=>{
        subtabs.forEach(x=>x.classList.remove("active"));
        t.classList.add("active");
        const k = t.dataset.sub;
        pGeneral.classList.toggle("hide", k!=="general");
        pWA.classList.toggle("hide", k!=="whatsapp");
        pY.classList.toggle("hide", k!=="yoco");
      };
    });

    // Save handlers
    $("saveGeneral").onclick = ()=> saveSettings({
      SITE_NAME: $("SITE_NAME").value,
      SITE_LOGO_URL: $("SITE_LOGO_URL").value,
      PUBLIC_BASE_URL: $("PUBLIC_BASE_URL").value
    });

    $("saveWA").onclick = ()=> saveSettings({
      VERIFY_TOKEN: $("VERIFY_TOKEN").value,
      WHATSAPP_TOKEN: $("WHATSAPP_TOKEN").value,
      PHONE_NUMBER_ID: $("PHONE_NUMBER_ID").value,
      BUSINESS_ID: $("BUSINESS_ID").value,
      WHATSAPP_TEMPLATE_NAME: $("WHATSAPP_TEMPLATE_NAME").value,
      WHATSAPP_TEMPLATE_LANG: $("WHATSAPP_TEMPLATE_LANG").value
    });

    $("saveYoco").onclick = ()=> saveSettings({
      YOCO_MODE: $("YOCO_MODE").value,
      YOCO_TEST_PUBLIC_KEY: $("YOCO_TEST_PUBLIC_KEY").value,
      YOCO_TEST_SECRET_KEY: $("YOCO_TEST_SECRET_KEY").value,
      YOCO_TEST_WEBHOOK_SECRET: $("YOCO_TEST_WEBHOOK_SECRET").value,
      YOCO_LIVE_PUBLIC_KEY: $("YOCO_LIVE_PUBLIC_KEY").value,
      YOCO_LIVE_SECRET_KEY: $("YOCO_LIVE_SECRET_KEY").value,
      YOCO_LIVE_WEBHOOK_SECRET: $("YOCO_LIVE_WEBHOOK_SECRET").value
    });

    // Templates: list + actions
    async function loadTemplates(){
      const box = $("waTmplBox");
      box.textContent = "Loading templates…";
      try {
        const j = await fetch(API.wa_templates_list).then(r=>r.json());
        if (!j || !j.ok) throw new Error("Failed to load");
        const rows = j.templates || [];
        if (!rows.length){
          box.innerHTML = "<div class='muted'>No templates in database.</div>";
          return;
        }
        box.innerHTML = [
          "<table><thead><tr>",
            "<th>Name</th><th>Language</th><th>Status</th><th>Category</th><th>Updated</th>",
          "</tr></thead><tbody>",
          rows.map(t=>{
            const when = t.updated_at ? new Date(t.updated_at*1000).toLocaleString() : "";
            return "<tr>" +
              "<td>"+hEsc(t.name||"")+"</td>" +
              "<td>"+hEsc(t.language||"")+"</td>" +
              "<td>"+hEsc(t.status||"")+"</td>" +
              "<td>"+hEsc(t.category||"")+"</td>" +
              "<td>"+hEsc(when)+"</td>" +
            "</tr>";
          }).join("") ,
          "</tbody></table>"
        ].join("");
      } catch {
        $("waTmplBox").innerHTML = "<div class='muted'>Error loading templates.</div>";
      }
    }

    $("syncTemplates").onclick = async ()=>{
      try {
        const r = await fetch(API.wa_templates_sync, { method:"POST" });
        const j = await r.json().catch(()=>({ok:false}));
        if (!j.ok) throw 0;
        // after sync, re-load list
        await loadTemplates();
        alert("Templates synced. Count in DB: " + (j.count || 0));
      } catch {
        alert("Sync failed");
      }
    };

    $("newTemplate").onclick = async ()=>{
      const name = prompt("Template name (exactly as in Meta):","");
      if (!name) return;
      const language = prompt("Language tag (e.g. en_US, af):", "en_US") || "en_US";
      const category = prompt("Category (e.g. TRANSACTIONAL, MARKETING):","TRANSACTIONAL") || "TRANSACTIONAL";
      try {
        const r = await fetch(API.wa_templates_create, {
          method:"POST",
          headers:{ "content-type":"application/json" },
          body: JSON.stringify({ name, language, category, status:"pending" })
        });
        const j = await r.json().catch(()=>({ok:false}));
        if (!j.ok) throw 0;
        await loadTemplates();
        alert("Template created locally. Submit to Meta from your Business config.");
      } catch {
        alert("Create failed");
      }
    };

    // Initial template load when visiting WA subtab
    // If the WA subtab is already active (not default), load immediately; else load on click
    const waTab = el.querySelector(".tabs .tab[data-sub='whatsapp']");
    if (waTab && waTab.classList.contains("active")) {
      loadTemplates();
    } else if (waTab) {
      waTab.addEventListener("click", loadTemplates, { once:true });
    }

    // deep-link support
    window.AdminPanels.settingsSwitch = function(which){
      const map = { general:pGeneral, whatsapp:pWA, yoco:pY };
      subtabs.forEach(x => x.classList.remove("active"));
      pGeneral.classList.add("hide");
      pWA.classList.add("hide");
      pY.classList.add("hide");
      if (which === "whatsapp") {
        el.querySelector(".tabs .tab[data-sub='whatsapp']").classList.add("active");
        pWA.classList.remove("hide");
        loadTemplates();
      } else if (which === "yoco") {
        el.querySelector(".tabs .tab[data-sub='yoco']").classList.add("active");
        pY.classList.remove("hide");
      } else {
        el.querySelector(".tabs .tab[data-sub='general']").classList.add("active");
        pGeneral.classList.remove("hide");
      }
    };
  };

  async function saveSettings(updates){
    try{
      const r = await fetch("/api/admin/settings/update", {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify({ updates })
      });
      if (!r.ok){ alert("Save failed"); return; }
      alert("Saved");
    }catch{
      alert("Save failed");
    }
  }
})();
`;
