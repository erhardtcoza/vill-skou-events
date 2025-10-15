// /src/ui/admin_bar_wallet.js
// Inline JS snippet consumed by /src/ui/admin.js
export const adminBarWalletJS = `
(function(){
  if (!window.AdminBar) window.AdminBar = {};
  const rands=c=>'R'+((Number(c)||0)/100).toFixed(2);
  const time=t=> t? new Date(t*1000).toLocaleString() : '—';

  function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; }

  window.AdminBar.wallets = async function(container){
    container.innerHTML = '';
    
    const controls = el(\`
      <div class="card" style="margin-bottom:16px">
        <input id="bw-q" placeholder="Search (id, name, mobile)" style="min-width:260px">
        <button id="bw-go" class="tab" style="font-weight:800">Search</button>
      </div>\`);

    const table = el(\`
      <div class="card">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Status</th><th>Balance</th><th>Created</th></tr></thead>
          <tbody id="bw-tb"></tbody>
        </table>
      </div>\`);

    container.appendChild(controls);
    container.appendChild(table);
    const $ = s => container.querySelector(s);

    async function load(){
      const p = new URLSearchParams();
      const q = $('#bw-q').value.trim(); if(q) p.set('q', q);
      const r = await fetch('/api/admin/bar/wallets?'+p.toString());
      const j = await r.json().catch(()=>({}));
      const arr = j.wallets || [];
      const tb = $('#bw-tb'); tb.innerHTML='';
      for (const w of arr){
        const tr=document.createElement('tr');
        tr.innerHTML=\`<td>\${w.id}</td><td>\${w.name||''}</td><td>\${w.mobile||''}</td><td>\${w.status}</td><td>\${rands(w.balance_cents)}</td><td>\${time(w.created_at)}</td>\`;
        tb.appendChild(tr);
      }
    }

    $('#bw-go').onclick = load;
    load();
  };
})();
`;
