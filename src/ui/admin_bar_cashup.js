// /src/ui/admin_bar_cashup.js
// Inline JS snippet consumed by /src/ui/admin.js
export const adminBarCashupJS = `
(function(){
  if (!window.AdminBar) window.AdminBar = {};
  const rands = c => 'R' + ((Number(c)||0)/100).toFixed(2);
  const el = html => { const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; };

  function tdStyle(){ return 'padding:8px;border-bottom:1px solid #eef2f7' }

  // Normalize possible backend shapes for wallet cashups
  function normalizeWallet(res){
    const arr = res?.days || res?.rows || res?.items || res?.data || [];
    return (Array.isArray(arr) ? arr : []).map(d=>{
      const day  = d.day || d.date || d.d || d.Day || d[0] || '';
      const cash = d.cash_cents ?? d.cash ?? d.cash_total_cents ?? d.cashTotal_cents ?? 0;
      const card = d.card_cents ?? d.card ?? d.card_total_cents ?? d.cardTotal_cents ?? 0;
      let total  = d.total_cents ?? d.total ?? d.sum_cents ?? 0;
      if (!total) total = Number(cash||0) + Number(card||0);
      return { day, cash_cents:Number(cash||0), card_cents:Number(card||0), total_cents:Number(total||0) };
    });
  }

  // Normalize possible backend shapes for item sales
  function normalizeSales(res){
    const arr = res?.items || res?.rows || res?.data || [];
    return (Array.isArray(arr) ? arr : []).map(x=>{
      const item_name = x.item_name || x.name || x.item || x[0] || '';
      const qty = x.qty ?? x.quantity ?? x.count ?? x.units ?? 0;
      const cents = x.cents ?? x.total_cents ?? x.total ?? x.sum_cents ?? 0;
      return { item_name, qty:Number(qty||0), cents:Number(cents||0) };
    });
  }

  async function safeJSON(url){
    try {
      const r = await fetch(url);
      const j = await r.json().catch(()=>({ ok:false, error:'bad json' }));
      if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP '+r.status));
      return j;
    } catch(e){
      console.warn('[bar cashup] fetch failed', url, e);
      return { __error: (e && e.message) || 'Request failed' };
    }
  }

  window.AdminBar.cashup = async function(container){
    container.innerHTML = '';
    const grid = el(\`
      <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card">
          <h3 style="margin:0 0 10px">Wallet cashup (Top-ups)</h3>
          <table id="bc-top" style="width:100%;border-collapse:collapse">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Day</th>
                <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Cash</th>
                <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Card</th>
                <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Total</th>
              </tr>
            </thead>
            <tbody><tr><td style="\${tdStyle()}" colspan="4" class="muted">Loading…</td></tr></tbody>
          </table>
        </div>
        <div class="card">
          <h3 style="margin:0 0 10px">Bar cashup (Sales by item)</h3>
          <table id="bc-items" style="width:100%;border-collapse:collapse">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Item</th>
                <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Qty</th>
                <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Total</th>
              </tr>
            </thead>
            <tbody><tr><td style="\${tdStyle()}" colspan="3" class="muted">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>\`);
    container.appendChild(grid);

    const tb1 = grid.querySelector('#bc-top tbody');
    const tb2 = grid.querySelector('#bc-items tbody');

    // Load both datasets in parallel
    const [topRes, salesRes] = await Promise.all([
      safeJSON('/api/admin/bar/cashup/wallet'),
      safeJSON('/api/admin/bar/cashup/sales')
    ]);

    // ---- Wallet cashups
    tb1.innerHTML = '';
    if (topRes.__error){
      tb1.innerHTML = \`<tr><td style="\${tdStyle()}" colspan="4">Error: \${topRes.__error}</td></tr>\`;
    } else {
      const rows = normalizeWallet(topRes);
      if (!rows.length){
        tb1.innerHTML = \`<tr><td style="\${tdStyle()}" colspan="4" class="muted">No top-ups found.</td></tr>\`;
      } else {
        let cashSum=0, cardSum=0, totalSum=0;
        rows.forEach(d=>{
          cashSum += d.cash_cents; cardSum += d.card_cents; totalSum += d.total_cents;
          const tr = document.createElement('tr');
          tr.innerHTML =
            \`<td style="\${tdStyle()}">\${esc(d.day)}</td>\`+
            \`<td style="\${tdStyle()};text-align:right">\${rands(d.cash_cents)}</td>\`+
            \`<td style="\${tdStyle()};text-align:right">\${rands(d.card_cents)}</td>\`+
            \`<td style="\${tdStyle()};text-align:right;font-weight:600">\${rands(d.total_cents)}</td>\`;
          tb1.appendChild(tr);
        });
        const trTot = document.createElement('tr');
        trTot.innerHTML =
          \`<td style="\${tdStyle()};font-weight:700">Total</td>\`+
          \`<td style="\${tdStyle()};text-align:right;font-weight:700">\${rands(cashSum)}</td>\`+
          \`<td style="\${tdStyle()};text-align:right;font-weight:700">\${rands(cardSum)}</td>\`+
          \`<td style="\${tdStyle()};text-align:right;font-weight:800">\${rands(totalSum)}</td>\`;
        tb1.appendChild(trTot);
      }
    }

    // ---- Sales by item
    tb2.innerHTML = '';
    if (salesRes.__error){
      tb2.innerHTML = \`<tr><td style="\${tdStyle()}" colspan="3">Error: \${salesRes.__error}</td></tr>\`;
    } else {
      const items = normalizeSales(salesRes);
      if (!items.length){
        tb2.innerHTML = \`<tr><td style="\${tdStyle()}" colspan="3" class="muted">No bar sales yet.</td></tr>\`;
      } else {
        let total=0;
        items.forEach(it=>{
          total += it.cents||0;
          const tr=document.createElement('tr');
          tr.innerHTML =
            \`<td style="\${tdStyle()}">\${esc(it.item_name||('Item '+(it.item_id||'')))}</td>\`+
            \`<td style="\${tdStyle()};text-align:right">\${it.qty||0}</td>\`+
            \`<td style="\${tdStyle()};text-align:right;font-weight:600">\${rands(it.cents||0)}</td>\`;
          tb2.appendChild(tr);
        });
        const trTot = document.createElement('tr');
        trTot.innerHTML =
          \`<td style="\${tdStyle()};font-weight:700">Total</td>\`+
          \`<td style="\${tdStyle()};text-align:right"></td>\`+
          \`<td style="\${tdStyle()};text-align:right;font-weight:800">\${rands(total)}</td>\`;
        tb2.appendChild(trTot);
      }
    }
  };
})();
`;
