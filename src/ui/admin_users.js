// /src/ui/admin_users.js
export const adminUsersJS = `
(function(){
  if (!window.AdminPanels) window.AdminPanels = {};
  const ESC = (window.esc) ? window.esc : (s=>String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])));
  const $id = (id)=>document.getElementById(id);

  async function api(url, opts){
    const r = await fetch(url, opts);
    const j = await r.json().catch(()=>({ok:false,error:"bad json"}));
    if (!r.ok || j.ok===false) throw new Error(j.error || ("HTTP "+r.status));
    return j;
  }

  function tableCSS(){
    return "style=\\\"width:100%;border-collapse:collapse\\\"";
  }
  function thStyle(){ return "style=\\\"text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;font-weight:700\\\""; }
  function tdStyle(){ return "style=\\\"padding:10px;border-bottom:1px solid #e5e7eb\\\""; }

  function btnPrimary(attrs, text){
    return '<button '+attrs+' class="tab" style="font-weight:800;background:#0a7d2b;color:#fff;border-color:#0a7d2b">'+text+'</button>';
  }
  function btn(attrs, text){
    return '<button '+attrs+' class="tab" style="font-weight:800">'+text+'</button>';
  }
  function btnDanger(attrs, text){
    return '<button '+attrs+' class="tab" style="font-weight:800;background:#b42318;color:#fff;border-color:#b42318">'+text+'</button>';
  }

  function formCard(user){
    const u = user || {};
    return ''
    + '<div id="users-form" class="card" style="margin:12px 0;padding:14px">'
    +   '<h3 style="margin:0 0 8px">'+(u.id? 'Edit user #'+u.id : 'Add user')+'</h3>'
    +   '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;align-items:end">'
    +     '<label>Username<br><input id="u_username" style="width:100%" value="'+ESC(u.username||'')+'" placeholder="username"></label>'
    +     '<label>Role<br><input id="u_role" style="width:100%" value="'+ESC(u.role||'')+'" placeholder="admin / pos / scan"></label>'
    +     '<label>Password '+(u.id? '<span style="opacity:.6">(leave blank to keep)</span>':'' )+'<br><input id="u_password" type="password" style="width:100%" value=""></label>'
    +     '<div style="grid-column:1/-1;display:flex;gap:8px">'
    +       btnPrimary('id="u_save"', 'Save')
    +       + btn('id="u_cancel"', 'Cancel')
    +     '</div>'
    +   '</div>'
    + '</div>';
  }

  async function loadUsers(){
    const j = await fetch("/api/admin/users").then(r=>r.json()).catch(()=>({ok:false, users:[]}));
    if (!j.ok) throw new Error("Failed to load users");
    return j.users || [];
  }

  async function render(){
    const host = $id("panel-users");
    host.innerHTML =
      '<div class="card">'
      +  '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      +    '<h2 style="margin:0">Users</h2>'
      +    btnPrimary('id="u_add"', 'Add user')
      +  '</div>'
      +  '<div id="users-form-slot"></div>'
      +  '<table '+tableCSS()+'>'
      +    '<thead><tr>'
      +      '<th '+thStyle()+'>ID</th>'
      +      '<th '+thStyle()+'>Username</th>'
      +      '<th '+thStyle()+'>Role</th>'
      +      '<th '+thStyle()+' style="text-align:right;padding-right:0">Actions</th>'
      +    '</tr></thead>'
      +    '<tbody id="u_tbody"><tr><td '+tdStyle()+' colspan="4" class="muted">Loading…</td></tr></tbody>'
      +  '</table>'
      + '</div>';

    const rows = await loadUsers();
    paintRows(rows);

    // Add
    $id("u_add").onclick = ()=>{
      const slot = $id("users-form-slot");
      slot.innerHTML = formCard(null);
      wireForm(null);
    };
  }

  function paintRows(rows){
    const tb = $id("u_tbody");
    tb.innerHTML = "";
    if (!rows.length){
      tb.innerHTML = '<tr><td '+tdStyle()+' colspan="4" class="muted">No users yet.</td></tr>';
      return;
    }
    rows.forEach(u=>{
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td '+tdStyle()+'>'+String(u.id)+'</td>'
        + '<td '+tdStyle()+'>'+ESC(u.username)+'</td>'
        + '<td '+tdStyle()+'>'+ESC(u.role||"")+'</td>'
        + '<td '+tdStyle()+' style="text-align:right">'
        +   btn('data-edit="'+u.id+'"', 'Edit') + ' '
        +   btnDanger('data-del="'+u.id+'"', 'Delete')
        + '</td>';
      tb.appendChild(tr);
    });

    // Edit handlers
    tb.querySelectorAll("[data-edit]").forEach(b=>{
      b.onclick = ()=>{
        const id = Number(b.getAttribute("data-edit"));
        const user = rows.find(r=>r.id===id);
        const slot = $id("users-form-slot");
        slot.innerHTML = formCard(user);
        wireForm(user);
      };
    });
    // Delete handlers
    tb.querySelectorAll("[data-del]").forEach(b=>{
      b.onclick = async ()=>{
        const id = Number(b.getAttribute("data-del"));
        if (!confirm("Delete user #"+id+"?")) return;
        try{
          await api("/api/admin/users/delete", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ id }) });
          // remove row quickly without full reload
          b.closest("tr").remove();
          if (!$id("u_tbody").children.length){
            $id("u_tbody").innerHTML = '<tr><td '+tdStyle()+' colspan="4" class="muted">No users yet.</td></tr>';
          }
        }catch(e){ alert("Delete failed: "+e.message); }
      };
    });
  }

  function wireForm(user){
    const isEdit = !!(user && user.id);
    const saveBtn = $id("u_save");
    const cancelBtn = $id("u_cancel");

    cancelBtn.onclick = ()=>{ $id("users-form-slot").innerHTML = ""; };

    saveBtn.onclick = async ()=>{
      const username = ($id("u_username").value||"").trim();
      const role     = ($id("u_role").value||"").trim();
      const password = ($id("u_password").value||"").trim();

      if (!username) return alert("Username is required.");
      if (!role)     return alert("Role is required.");

      try{
        if (isEdit){
          const body = { id: user.id, username, role };
          if (password) body.password = password;
          await api("/api/admin/users/update", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(body) });
        } else {
          if (!password) return alert("Password is required for new users.");
          await api("/api/admin/users/create", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ username, role, password }) });
        }
        // Refresh list
        const rows = await loadUsers();
        paintRows(rows);
        $id("users-form-slot").innerHTML = "";
      }catch(e){
        alert("Save failed: "+e.message);
      }
    };
  }

  // Panel entry point
  window.AdminPanels.users = async function(){
    const el = $id("panel-users");
    el.innerHTML = '<div class="card"><h2 style="margin:0 0 8px">Users</h2><div class="muted">Loading…</div></div>';
    try { await render(); } catch(e){ el.innerHTML = '<div class="card"><h2 style="margin:0 0 8px">Users</h2><div class="muted">Could not load.</div></div>'; }
  };
})();
`;
