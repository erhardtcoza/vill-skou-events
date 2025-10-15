// /src/ui/admin_bar_menu.js
// Inline JS snippet consumed by /src/ui/admin.js
export const adminBarMenuJS = `
(function(){
  if (!window.AdminBar) window.AdminBar = {};
  const rands = c => (c==null? '—' : 'R'+(Number(c)/100).toFixed(2));
  const toCents = v => { const n=Number(String(v||'').replace(',','.')); return Number.isFinite(n)? Math.round(n*100) : null; };

  function el(html){
    const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild;
  }

  function catsFrom(items){
    return Array.from(new Set(items.map(i=>i.category))).sort((a,b)=>a.localeCompare(b));
  }

  async function fetchItems(q, cat, onlyActive, onlyMain){
    const p = new URLSearchParams();
    if (q)       p.set('q', q);
    if (cat)     p.set('category', cat);
    if (onlyActive) p.set('active', '1');
    if (onlyMain)   p.set('main_menu', '1');
    const r = await fetch('/api/admin/bar/items?'+p.toString());
    const j = await r.json().catch(()=>({}));
    return j.items||[];
  }

  async function toggleMain(id, flag){
    await fetch('/api/admin/bar/items/toggle-main', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ id:Number(id), main_menu: flag?1:0 })
    });
  }

  async function saveItem(body){
    const r = await fetch('/api/admin/bar/items/save', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify(body)
    });
    return r.json();
  }

  async function delItem(id){
    await fetch('/api/admin/bar/items/delete', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ id:Number(id) })
    });
  }

  function editPrompt(it, onDone){
    const name = prompt('Name', it?.name||''); if (name==null) return;
    const category = prompt('Category', it?.category||''); if (category==null) return;
    const variant = prompt('Variant (e.g. Enkel, Bottle)', it?.variant||''); if (variant==null) return;
    const price = prompt('Price (Rands, leave empty for none)', it?.price_cents!=null ? (it.price_cents/100).toFixed(2): '');
    const main = confirm('Show in main menu? ' + (it?.main_menu? '(currently yes)': '(currently no)'));
    onDone({
      id: it?.id || undefined,
      name, category, variant,
      price_cents: price===''? null : toCents(price),
      main_menu: main?1:0,
      active: 1
    });
  }

  window.AdminBar.menu = async function(container){
    container.innerHTML = '';
    const controls = el(\`
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input id="bar-q" placeholder="Search name/category…" style="flex:1;min-width:220px">
          <select id="bar-cat"><option value="">All categories</option></select>
          <label class="pill"><input id="bar-onlyActive" type="checkbox" checked> Active only</label>
          <label class="pill"><input id="bar-onlyMain" type="checkbox"> Main menu only</label>
          <button id="bar-refresh" class="tab" style="font-weight:800">Refresh</button>
          <button id="bar-addNew" class="tab" style="font-weight:800;background:#0a7d2b;color:#fff;border-color:#0a7d2b">Add item</button>
        </div>
      </div>\`);
    const table = el(\`
      <div class="card">
        <table id="bar-tbl" style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th>Category</th><th>Name</th><th>Variant</th>
            <th>Price</th><th>Active</th><th>Main</th><th></th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>\`);

    container.appendChild(controls);
    container.appendChild(table);

    const $ = s => container.querySelector(s);

    let _items = [];

    async function paint(){
      const tb = $('#bar-tbl tbody'); tb.innerHTML = '';
      for (const it of _items){
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td>\${it.category}</td>
          <td>\${it.name}</td>
          <td>\${it.variant||''}</td>
          <td>\${rands(it.price_cents)}</td>
          <td>\${it.active? 'Yes':'No'}</td>
          <td><input type="checkbox" data-main="\${it.id}" \${it.main_menu? 'checked':''}></td>
          <td>
            <button data-edit="\${it.id}" class="tab" style="font-weight:800">Edit</button>
            <button data-del="\${it.id}" class="tab" style="font-weight:800;background:#b42318;color:#fff;border-color:#b42318">Delete</button>
          </td>\`;
        tb.appendChild(tr);
      }
      // wire
      tb.querySelectorAll('[data-main]').forEach(ch=>{
        ch.addEventListener('change', ()=> toggleMain(ch.getAttribute('data-main'), ch.checked));
      });
      tb.querySelectorAll('[data-edit]').forEach(b=>{
        b.addEventListener('click', ()=>{
          const it = _items.find(x=>String(x.id)===b.getAttribute('data-edit'));
          editPrompt(it, async (body)=>{ await saveItem(body); await load(); });
        });
      });
      tb.querySelectorAll('[data-del]').forEach(b=>{
        b.addEventListener('click', async ()=>{
          if (!confirm('Delete item?')) return;
          await delItem(Number(b.getAttribute('data-del')));
          await load();
        });
      });
    }

    async function load(){
      const q = $('#bar-q').value.trim();
      const cat = $('#bar-cat').value;
      const onlyActive = $('#bar-onlyActive').checked;
      const onlyMain   = $('#bar-onlyMain').checked;
      _items = await fetchItems(q, cat, onlyActive, onlyMain);
      // Fill cats once (or refresh set)
      const cats = catsFrom(_items);
      const sel = $('#bar-cat');
      const cur = sel.value;
      sel.innerHTML = '<option value="">All categories</option>' + cats.map(c=>\`<option>\${c}</option>\`).join('');
      if (cats.includes(cur)) sel.value = cur;
      await paint();
    }

    // events
    $('#bar-refresh').onclick = load;
    $('#bar-addNew').onclick = ()=> editPrompt(null, async (body)=>{ await saveItem(body); await load(); });

    await load();
  };
})();
`;
