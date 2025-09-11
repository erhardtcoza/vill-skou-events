// /src/ui/admin_sitesettings.js
export const adminSiteSettingsJS = /* js */ `
(function(){

  const API = {
    settings_get: "/api/admin/settings",
    settings_set: "/api/admin/settings/update",
    wa_templates_list: "/api/admin/whatsapp/templates",
    wa_templates_sync: "/api/admin/whatsapp/templates/sync",
    wa_templates_create: "/api/admin/whatsapp/templates/create"
  };

  function el(id){ return document.getElementById(id); }
  function esc(s){ return String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }

  async function saveSettings(updates){
    const r = await fetch(API.settings_set, {
      method: "POST",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ updates })
    });
    if (!r.ok) throw new Error("Save failed");
  }

  function settingsTabsHTML(){
    return [
      "<div class='tabs' style='margin-top:0'>",
        "<div class='tab active' data-sub='general'>General</div>",
        "<div class='tab' data-sub='whatsapp'>WhatsApp</div>",
        "<div class='tab' data-sub='yoco'>Yoco</div>",
      "</div>",
      "<div id='sub-general'></div>",
      "<div id='sub-whatsapp' class='hide'></div>",
      "<div id='sub-yoco' class='hide'></div>"
    ].join("");
  }

  function renderGeneral(S){
    const box = el("sub-general");
    box.className = "card";
    box.innerHTML = [
      "<h2>General Site Settings</h2>",
      "<div class='row'>",
        "<div>",
          "<label>Site Name</label>",
          "<input id='SITE_NAME' value='"+esc(S.SITE_NAME||"")+"' />",
        "</div>",
        "<div>",
          "<label>Logo URL</label>",
          "<input id='SITE_LOGO_URL' value='"+esc(S.SITE_LOGO_URL||"")+"' />",
        "</div>",
      "</div>",
      "<div style='margin-top:10px'>",
        "<button class='btn primary' id='saveGeneral'>Save General</button>",
      "</div>"
    ].join("");

    el("saveGeneral").onclick = async ()=>{
      try{
        await saveSettings({
          SITE_NAME: el("SITE_NAME").value,
          SITE_LOGO_URL: el("SITE_LOGO_URL").value
        });
        alert("Saved");
      }catch(e){ alert(e.message||"Save failed"); }
    };
  }

  function renderWhatsApp(S){
    const box = el("sub-whatsapp");
    box.className = "card";
    const webhookHint = (location.origin || "") + "/whatsapp/webhook"; // your WA inbound, if any

    box.innerHTML = [
      "<h2>WhatsApp Settings</h2>",
      "<div class='row'>",
        "<div>",
          "<label>PUBLIC_BASE_URL</label>",
          "<input id='PUBLIC_BASE_URL' value='"+esc(S.PUBLIC_BASE_URL||"")+"' />",
        "</div>",
        "<div>",
          "<label>VERIFY_TOKEN</label>",
          "<input id='VERIFY_TOKEN' value='"+esc(S.VERIFY_TOKEN||"")+"' />",
        "</div>",
      "</div>",
      "<div class='row'>",
        "<div>",
          "<label>PHONE_NUMBER_ID</label>",
          "<input id='PHONE_NUMBER_ID' value='"+esc(S.PHONE_NUMBER_ID||"")+"' />",
        "</div>",
        "<div>",
          "<label>BUSINESS_ID</label>",
          "<input id='BUSINESS_ID' value='"+esc(S.BUSINESS_ID||"")+"' />",
        "</div>",
      "</div>",
      "<div class='row'>",
        "<div>",
          "<label>WHATSAPP_TOKEN</label>",
          "<input id='WHATSAPP_TOKEN' value='"+esc(S.WHATSAPP_TOKEN||"")+"' />",
        "</div>",
        "<div>",
          "<label>Webhook (info)</label>",
          "<input value='"+esc(webhookHint)+"' readonly />",
        "</div>",
      "</div>",
      "<div style='margin-top:10px'>",
        "<button class='btn primary' id='saveWA'>Save WhatsApp</button>",
      "</div>",

      "<hr style='margin:16px 0'/>",
      "<h3>Templates</h3>",
      "<div class='row'>",
        "<div class='split'>",
          "<button class='btn' id='syncTemplates'>Sync templates</button>",
          "<button class='btn' id='newTemplate'>New template</button>",
        "</div>",
      "</div>",
      "<div id='waTplMsg' class='muted' style='margin-top:8px'></div>",
      "<div id='waTplList' style='margin-top:10px'></div>",
      "<div id='waTplForm' class='hide' style='margin-top:12px'></div>"
    ].join("");

    el("saveWA").onclick = async ()=>{
      try{
        await saveSettings({
          PUBLIC_BASE_URL:  el("PUBLIC_BASE_URL").value,
          VERIFY_TOKEN:     el("VERIFY_TOKEN").value,
          PHONE_NUMBER_ID:  el("PHONE_NUMBER_ID").value,
          BUSINESS_ID:      el("BUSINESS_ID").value,
          WHATSAPP_TOKEN:   el("WHATSAPP_TOKEN").value
        });
        alert("Saved");
      }catch(e){ alert(e.message||"Save failed"); }
    };

    el("syncTemplates").onclick = async ()=>{
      el("waTplMsg").textContent = "Syncing…";
      try{
        const r = await fetch(API.wa_templates_sync, { method:"POST" });
        const j = await r.json().catch(()=>({ok:false}));
        if (!j.ok) throw new Error(j.error||"Sync failed");
        el("waTplMsg").textContent = "Synced ✓";
        loadTemplates(); // refresh list
      }catch(e){
        el("waTplMsg").textContent = "Error: " + (e.message||"Sync failed");
      }
    };

    el("newTemplate").onclick = ()=>{
      const form = el("waTplForm");
      form.classList.remove("hide");
      form.innerHTML = [
        "<div class='card' style='background:#fafafa'>",
          "<div class='row'>",
            "<div>",
              "<label>Template Name</label>",
              "<input id='tpl_name' placeholder='e.g. order_update' />",
            "</div>",
            "<div>",
              "<label>Language (e.g. en_US / af_ZA)</label>",
              "<input id='tpl_lang' value='en_US' />",
            "</div>",
          "</div>",
          "<div class='row'>",
            "<div>",
              "<label>Category</label>",
              "<select id='tpl_category'>",
                "<option value='TRANSACTIONAL'>TRANSACTIONAL</option>",
                "<option value='MARKETING'>MARKETING</option>",
                "<option value='UTILITY'>UTILITY</option>",
              "</select>",
            "</div>",
            "<div>",
              "<label>Body (text)</label>",
              "<textarea id='tpl_body' rows='4' placeholder='Body text…'></textarea>",
            "</div>",
          "</div>",
          "<div style='margin-top:10px'>",
            "<button class='btn primary' id='tpl_save'>Save Template</button>",
            "<button class='btn' id='tpl_cancel' style='margin-left:8px'>Cancel</button>",
          "</div>",
        "</div>"
      ].join("");

      el("tpl_cancel").onclick = ()=> form.classList.add("hide");
      el("tpl_save").onclick = async ()=>{
        const payload = {
          name: el("tpl_name").value.trim(),
          language: el("tpl_lang").value.trim() || "en_US",
          category: el("tpl_category").value,
          body: el("tpl_body").value
        };
        if (!payload.name) { alert("Name required"); return; }
        try{
          const r = await fetch(API.wa_templates_create, {
            method:"POST",
            headers:{ "content-type":"application/json" },
            body: JSON.stringify(payload)
          });
          const j = await r.json().catch(()=>({ok:false}));
          if (!j.ok) throw new Error(j.error||"Create failed");
          form.classList.add("hide");
          loadTemplates();
        }catch(e){ alert(e.message||"Create failed"); }
      };
    };

    // Load list on first render
    async function loadTemplates(){
      const list = el("waTplList");
      list.innerHTML = "<div class='muted'>Loading templates…</div>";
      try{
        const r = await fetch(API.wa_templates_list);
        const j = await r.json().catch(()=>({ok:false}));
        if (!j.ok) throw new Error(j.error||"Load failed");
        const rows = j.templates || [];
        if (!rows.length) { list.innerHTML = "<div class='muted'>No templates found.</div>"; return; }
        list.innerHTML = [
          "<table><thead><tr>",
          "<th>Name</th><th>Lang</th><th>Status</th><th>Category</th><th>Updated</th>",
          "</tr></thead><tbody>",
          ...rows.map(t=>[
            "<tr>",
            "<td>", esc(t.name||""), "</td>",
            "<td>", esc(t.language||""), "</td>",
            "<td>", esc(t.status||""), "</td>",
            "<td>", esc(t.category||""), "</td>",
            "<td>", t.updated_at ? new Date((t.updated_at*1000)||0).toLocaleString() : "", "</td>",
            "</tr>"
          ].join("")),
          "</tbody></table>"
        ].join("");
      }catch(e){
        list.innerHTML = "<div class='muted'>Error loading templates.</div>";
      }
    }
    loadTemplates();
  }

  function renderYoco(S){
    const box = el("sub-yoco");
    box.className = "card";
    const webhookUrl = (location.origin || "") + "/api/payments/yoco/webhook";

    box.innerHTML = [
      "<h2>Yoco Settings</h2>",
      "<div class='row'>",
        "<div>",
          "<label>Mode</label>",
          "<select id='YOCO_MODE'>",
            "<option value='sandbox' ", (S.YOCO_MODE!=='live'?"selected":""), ">Sandbox</option>",
            "<option value='live' ",   (S.YOCO_MODE==='live'?"selected":""),   ">Live</option>",
          "</select>",
        "</div>",
        "<div>",
          "<label>Webhook URL (configure in Yoco)</label>",
          "<input value='"+esc(webhookUrl)+"' readonly />",
        "</div>",
      "</div>",

      "<h3 style='margin-top:16px'>Sandbox keys</h3>",
      "<div class='row'>",
        "<div>",
          "<label>Test public key</label>",
          "<input id='YOCO_TEST_PUBLIC_KEY' value='"+esc(S.YOCO_TEST_PUBLIC_KEY||"")+"' />",
        "</div>",
        "<div>",
          "<label>Test secret key</label>",
          "<input id='YOCO_TEST_SECRET_KEY' value='"+esc(S.YOCO_TEST_SECRET_KEY||"")+"' />",
        "</div>",
      "</div>",
      "<div class='row'>",
        "<div>",
          "<label>Test webhook secret</label>",
          "<input id='YOCO_TEST_WEBHOOK_SECRET' value='"+esc(S.YOCO_TEST_WEBHOOK_SECRET||"")+"' />",
        "</div>",
        "<div></div>",
      "</div>",

      "<h3 style='margin-top:16px'>Live keys</h3>",
      "<div class='row'>",
        "<div>",
          "<label>Live public key</label>",
          "<input id='YOCO_LIVE_PUBLIC_KEY' value='"+esc(S.YOCO_LIVE_PUBLIC_KEY||"")+"' />",
        "</div>",
        "<div>",
          "<label>Live secret key</label>",
          "<input id='YOCO_LIVE_SECRET_KEY' value='"+esc(S.YOCO_LIVE_SECRET_KEY||"")+"' />",
        "</div>",
      "</div>",
      "<div class='row'>",
        "<div>",
          "<label>Live webhook secret</label>",
          "<input id='YOCO_LIVE_WEBHOOK_SECRET' value='"+esc(S.YOCO_LIVE_WEBHOOK_SECRET||"")+"' />",
        "</div>",
        "<div></div>",
      "</div>",

      "<h3 style='margin-top:16px'>Legacy (optional)</h3>",
      "<div class='row'>",
        "<div>",
          "<label>YOCO_PUBLIC_KEY</label>",
          "<input id='YOCO_PUBLIC_KEY' value='"+esc(S.YOCO_PUBLIC_KEY||"")+"' />",
        "</div>",
        "<div>",
          "<label>YOCO_SECRET_KEY</label>",
          "<input id='YOCO_SECRET_KEY' value='"+esc(S.YOCO_SECRET_KEY||"")+"' />",
        "</div>",
      "</div>",

      "<div style='margin-top:10px'>",
        "<button class='btn primary' id='saveYoco'>Save Yoco</button>",
      "</div>"
    ].join("");

    el("saveYoco").onclick = async ()=>{
      try{
        await saveSettings({
          YOCO_MODE: el("YOCO_MODE").value,

          YOCO_TEST_PUBLIC_KEY: el("YOCO_TEST_PUBLIC_KEY").value,
          YOCO_TEST_SECRET_KEY: el("YOCO_TEST_SECRET_KEY").value,
          YOCO_TEST_WEBHOOK_SECRET: el("YOCO_TEST_WEBHOOK_SECRET").value,

          YOCO_LIVE_PUBLIC_KEY: el("YOCO_LIVE_PUBLIC_KEY").value,
          YOCO_LIVE_SECRET_KEY: el("YOCO_LIVE_SECRET_KEY").value,
          YOCO_LIVE_WEBHOOK_SECRET: el("YOCO_LIVE_WEBHOOK_SECRET").value,

          // legacy fields, kept for compatibility
          YOCO_PUBLIC_KEY: el("YOCO_PUBLIC_KEY").value,
          YOCO_SECRET_KEY: el("YOCO_SECRET_KEY").value
        });
        alert("Saved");
      }catch(e){ alert(e.message||"Save failed"); }
    };
  }

  async function renderAll(){
    const panel = document.getElementById("panel-settings");
    panel.innerHTML = "<h2>Site Settings</h2>" + settingsTabsHTML();

    // sub-tab switching
    const tabs = panel.querySelectorAll(".tabs .tab");
    function switchSub(name){
      tabs.forEach(t=>t.classList.toggle("active", t.dataset.sub===name));
      ["general","whatsapp","yoco"].forEach(k=>{
        const n = document.getElementById("sub-"+k);
        if (n) n.classList.toggle("hide", k!==name);
      });
    }
    tabs.forEach(t => t.onclick = ()=> switchSub(t.dataset.sub));

    // load settings then render panes
    const j = await fetch(API.settings_get).then(r=>r.json()).catch(()=>({ok:false,settings:{}}));
    const S = j.settings || {};

    renderGeneral(S);
    renderWhatsApp(S);
    renderYoco(S);

    switchSub("general");

    // expose for deep-link control from main admin.js
    window.AdminPanels.settingsSwitch = (sub)=> switchSub(sub || "general");
  }

  // register with main admin shell
  window.AdminPanels.settings = renderAll;

})();
`;
