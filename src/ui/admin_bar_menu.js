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

  async function saveItem(body){
    const r = await fetch('/api/admin/bar/items/save', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify(body)
    });
    return r.json().catch(()=>({}));
  }

  async function delItem(id){
    await fetch('/api/admin/bar/items/delete', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ id:Number(id) })
    });
  }

  async function toggleMain(id, flag){
    await fetch('/api/admin/bar/items/toggle-main', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ id:Number(id), main_menu: flag?1:0 })
    });
  }

  // ---- Inline editor helpers ----
  function activateCellEditor(td, initial, parse, format, onCommit){
    if (td.querySelector('input')) return; // already editing
    const input = document.createElement('input');
    input.type = 'text';
    input.value = format ? format(initial) : (initial ?? '');
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    input.style.padding = '6px 8px';
    input.style.border = '1px solid #e5e7eb';
    input.style.borderRadius = '8px';
    const prevHTML = td.innerHTML;
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const commit = async (ok=true)=>{
      const raw = input.value;
      const val = parse ? parse(raw) : raw;
      td.innerHTML = prevHTML; // temp restore while we save/paint
      if (ok) await onCommit(val);
    };
    input.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') commit(true);
      else if (e.key === 'Escape') commit(false);
    });
    input.addEventListener('blur', ()=>commit(true));
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
            <th style="width:16%">Category</th>
            <th style="width:28%">Name</th>
            <th style="width:18%">Variant</th>
            <th style="width:12%">Price</th>
            <th style="width:8%">Active</th>
            <th style="width:8%">Main</th>
            <th style="width:10%"></th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>\`);

    container.appendChild(controls);
    container.appendChild(table);

    const $ = s => container.querySelector(s);
    let _items = [];

    function rowHTML(it){
      // data-field = which property to edit on double click
      return \`
        <td data-id="\${it.id}" data-field="category" class="bar-edit">\${it.category}</td>
        <td data-id="\${it.id}" data-field="name" class="bar-edit">\${it.name}</td>
        <td data-id="\${it.id}" data-field="variant" class="bar-edit">\${it.variant||''}</td>
        <td data-id="\${it.id}" data-field="price_cents" class="bar-edit">\${rands(it.price_cents)}</td>
        <td style="text-align:center">
          <input type="checkbox" data-active="\${it.id}" \${it.active? 'checked':''}>
        </td>
        <td style="text-align:center">
          <input type="checkbox" data-main="\${it.id}" \${it.main_menu? 'checked':''}>
        </td>
        <td>
          <button data-del="\${it.id}" class="tab" style="font-weight:800;background:#b42318;color:#fff;border-color:#b42318">Delete</button>
        </td>\`;
    }

    async function paint(){
      const tb = $('#bar-tbl tbody'); tb.innerHTML = '';
      for (const it of _items){
        const tr = document.createElement('tr');
        tr.innerHTML = rowHTML(it);
        tb.appendChild(tr);
      }

      // Inline edit on double-click (event delegation)
      tb.addEventListener('dblclick', (e)=>{
        const cell = e.target.closest('.bar-edit');
        if (!cell) return;
        const id = Number(cell.dataset.id);
        const field = cell.dataset.field;
        const it = _items.find(x=>x.id===id);
        if (!it) return;

        if (field === 'price_cents') {
          activateCellEditor(
            cell,
            it.price_cents,
            (raw)=> raw.trim()==='' ? null : toCents(raw),
            (v)=> v==null ? '' : (v/100).toFixed(2),
            async (val)=>{
              await saveItem({ id, price_cents: val, name: it.name, category: it.category, variant: it.variant, active: it.active, main_menu: it.main_menu });
              await load(); // repaint with fresh data
            }
          );
        } else {
          activateCellEditor(
            cell,
            it[field] || '',
            (raw)=> raw.trim(),
            (v)=> String(v||''),
            async (val)=>{
              const body = { id, name: it.name, category: it.category, variant: it.variant, active: it.active, main_menu: it.main_menu, price_cents: it.price_cents };
              body[field] = val;
              await saveItem(body);
              await load();
            }
          );
        }
      }, { once: true }); // reattached each paint

      // Active toggle
      tb.querySelectorAll('[data-active]').forEach(ch=>{
        ch.addEventListener('change', async ()=>{
          const id = Number(ch.getAttribute('data-active'));
          const it = _items.find(x=>x.id===id);
          if (!it) return;
          await saveItem({
            id,
            name: it.name, category: it.category, variant: it.variant,
            price_cents: it.price_cents, main_menu: it.main_menu,
            active: ch.checked ? 1 : 0
          });
          await load();
        });
      });

      // Main toggle
      tb.querySelectorAll('[data-main]').forEach(ch=>{
        ch.addEventListener('change', async ()=>{
          await toggleMain(ch.getAttribute('data-main'), ch.checked);
          // no reload strictly necessary, but keeps UI in sync with filters
          await load();
        });
      });

      // Delete
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

      // Fill categories (preserve current selection)
      const cats = catsFrom(_items);
      const sel = $('#bar-cat');
      const cur = sel.value;
      sel.innerHTML = '<option value="">All categories</option>' + cats.map(c=>\`<option>\${c}</option>\`).join('');
      if (cats.includes(cur)) sel.value = cur;

      await paint();
    }

    // controls
    $('#bar-refresh').onclick = load;
    $('#bar-addNew').onclick = async ()=>{
      // Create a quick empty row via save, then reload and you can inline edit
      const j = await saveItem({ name:'', category:'', variant:'', price_cents: null, active:1, main_menu:0 });
      await load();
    };

    await load();
  };
})();
`;
