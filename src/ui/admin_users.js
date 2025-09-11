// /src/ui/admin_users.js
export const adminUsersJS = `
window.AdminPanels.users = async function renderUsers(){
  const el = $("panel-users");
  el.innerHTML = "<h2>Users</h2><div class='muted'>Loading…</div>";
  const j = await fetch("/api/admin/users").then(r=>r.json()).catch(()=>({ok:false}));
  if (!j.ok){ el.innerHTML = "<div class='muted'>Kon nie laai nie</div>"; return; }

  const rows = (j.users||[]).map(u=>{
    return "<tr>"
      +"<td>"+String(u.id)+"</td>"
      +"<td>"+esc(u.username)+"</td>"
      +"<td>"+esc(u.role)+"</td>"
      +"</tr>";
  }).join("");

  el.innerHTML = [
    "<h2>Users</h2>",
    "<table style='width:100%;border-collapse:collapse'>",
    "<thead><tr><th>ID</th><th>Username</th><th>Role</th></tr></thead>",
    "<tbody>", rows || "<tr><td colspan='3' class='muted'>No users</td></tr>", "</tbody>",
    "</table>"
  ].join("");
};
`;
