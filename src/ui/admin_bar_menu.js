// /src/ui/admin_bar_menu.js
export async function barMenuHTML(){
return `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin · Bar menu</title>
<style>
  :root{ --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --border:#e5e7eb }
  body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:1100px;margin:20px auto;padding:0 16px}
  .tabs{display:flex;gap:10px;margin:10px 0 18px}
  .tab{display:inline-block;padding:10px 14px;border-radius:999px;border:1px solid var(--border);background:#fff;text-decoration:none;font-weight:800}
  .tab.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
  .card{background:#fff;border-radius:14px;box-shadow:0 12px 26px rgba(0,0,0,.06);padding:18px}
  table{width:100%;border-collapse:collapse}
  th,td{border-bottom:1px solid var(--border);padding:10px 8px;text-align:left}
  .pill{padding:4px 10px;border-radius:999px;border:1px solid var(--border);display:inline-block}
  input,select{padding:10px;border:1px solid var(--border);border-radius:10px;font:inherit}
  .btn{background:var(--accent);color:#fff;border:0;border-radius:10px;padding:10px 14px;font-weight:800;cursor:pointer}
  .btn.alt{background:#111}
</style>
</head><body>
<div class="wrap">
  <h1 style="margin:0 0 8px">Bar · Menu</h1>
  <div class="tabs">
    <a class="tab primary" href="/admin/bar/menu">Menu</a>
    <a class="tab" href="/admin/bar/wallets">Wallets</a>
    <a class="tab" href="/admin/bar/cashup">Cashups</a>
  </div>

  <div class="card" style="margin-bottom:16px">
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <input id="q" placeholder="Search name/category…" style="flex:1;min-width:220px">
      <select id="cat"><option value="">All categories</option></select>
      <label class="pill"><input id="onlyActive" type="checkbox" checked> Active only</label>
      <label class="pill"><input id="onlyMain" type="checkbox"> Main menu only</label>
      <button id="refresh" class="btn alt">Refresh</button>
      <button id="addNew" class="btn">Add item</button>
    </div>
  </div>

  <div class="card">
    <table id="tbl">
      <thead><tr>
        <th>Category</th><th>Name</th><th>Variant</th>
        <th class="num">Price</th><th>Active</th><th>Main</th><th></th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<script>
const $ = s=>document.querySelector(s);
const rands = c => (c==null? '—' : 'R'+(Number(c)/100).toFixed(2));
const toCents = v => { const n=Number(String(v||'').replace(',','.')); return Number.isFinite(n)? Math.round(n*100) : null; };

async function fetchItems(){
  const p = new URLSearchParams();
  const q=$('#q').value.trim(); if(q) p.set('q',q);
  const cat=$('#cat').value; if(cat) p.set('category',cat);
  if($('#onlyActive').checked) p.set('active','1');
  if($('#onlyMain').checked) p.set('main_menu','1');
  const r = await fetch('/api/admin/bar/items?'+p.toString());
  return (await r.json()).items||[];
}
function catsFrom(items){
  return Array.from(new Set(items.map(i=>i.category))).sort((a,b)=>a.localeCompare(b));
}
function paint(items){
  const tb=$('#tbl tbody'); tb.innerHTML='';
  for(const it of items){
    const tr=document.createElement('tr');
    tr.innerHTML = \`
      <td>\${it.category}</td>
      <td>\${it.name}</td>
      <td>\${it.variant||''}</td>
      <td>\${rands(it.price_cents)}</td>
      <td>\${it.active? 'Yes':'No'}</td>
      <td><input type="checkbox" data-main="\${it.id}" \${it.main_menu? 'checked':''}></td>
      <td>
        <button data-edit="\${it.id}" class="btn alt">Edit</button>
        <button data-del="\${it.id}" class="btn" style="background:#b42318">Delete</button>
      </td>\`;
    tb.appendChild(tr);
  }
  // wire up actions
  tb.querySelectorAll('[data-main]').forEach(ch=>{
    ch.addEventListener('change', async ()=>{
      await fetch('/api/admin/bar/items/toggle-main', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ id: Number(ch.getAttribute('data-main')), main_menu: ch.checked?1:0 })
      });
    });
  });
  tb.querySelectorAll('[data-edit]').forEach(b=> b.onclick = ()=> edit(items.find(x=>x.id==b.getAttribute('data-edit'))));
  tb.querySelectorAll('[data-del]').forEach(b=> b.onclick = async ()=>{
    if(!confirm('Delete item?')) return;
    await fetch('/api/admin/bar/items/delete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:Number(b.getAttribute('data-del'))})});
    load();
  });
}
async function load(){
  const items = await fetchItems();
  // fill category filter once
  if (!$('#cat').dataset.filled){
    const sel=$('#cat'); for (const c of catsFrom(items)){ const o=document.createElement('option'); o.textContent=c;o.value=c; sel.appendChild(o);}
    $('#cat').dataset.filled='1';
  }
  paint(items);
}
function edit(it){
  const name = prompt('Name', it?.name||''); if(name==null) return;
  const category = prompt('Category', it?.category||''); if(category==null) return;
  const variant = prompt('Variant (e.g. Enkel, Bottle)', it?.variant||''); if(variant==null) return;
  const price = prompt('Price (Rands, leave empty for none)', it?.price_cents!=null ? (it.price_cents/100).toFixed(2): '');
  const main = confirm('Show in main menu? ' + (it?.main_menu? '(currently yes)': '(currently no)'));
  const body = {
    id: it?.id||undefined, name, category, variant,
    price_cents: price===''? null : toCents(price),
    main_menu: main?1:0, active: 1
  };
  fetch('/api/admin/bar/items/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(load);
}
$('#refresh').onclick = load;
$('#addNew').onclick = ()=> edit(null);
load();
</script>
</body></html>`;
}
