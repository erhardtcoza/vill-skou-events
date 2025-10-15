// /src/ui/admin_bar_cashup.js
// Inline JS snippet consumed by /src/ui/admin.js
export const adminBarCashupJS = `
(function(){
  if (!window.AdminBar) window.AdminBar = {};
  const rands=c=>'R'+((Number(c)||0)/100).toFixed(2);
  function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; }

  window.AdminBar.cashup = async function(container){
    container.innerHTML = '';
    const grid = el(\`
      <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card">
          <h3 style="margin:0 0 10px">Wallet cashup (Top-ups)</h3>
          <table id="bc-top" style="width:100%;border-collapse:collapse">
            <thead><tr><th>Day</th><th>Cash</th><th>Card</th><th>Total</th></tr></thead><tbody></tbody>
          </table>
        </div>
        <div class="card">
          <h3 style="margin:0 0 10px">Bar cashup (Sales by item)</h3>
          <table id="bc-items" style="width:100%;border-collapse:collapse">
            <thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody></tbody>
          </table>
        </div>
      </div>\`);
    container.appendChild(grid);

    const tb1 = grid.querySelector('#bc-top tbody');
    const tb2 = grid.querySelector('#bc-items tbody');

    const top = await fetch('/api/admin/bar/cashup/wallet').then(r=>r.json()).catch(()=>({days:[]}));
    tb1.innerHTML='';
    (top.days||[]).forEach(d=>{
      const tr=document.createElement('tr');
      tr.innerHTML=\`<td>\${d.day}</td><td>\${rands(d.cash_cents)}</td><td>\${rands(d.card_cents)}</td><td>\${rands(d.total_cents)}</td>\`;
      tb1.appendChild(tr);
    });

    const sales = await fetch('/api/admin/bar/cashup/sales').then(r=>r.json()).catch(()=>({items:[]}));
    tb2.innerHTML='';
    (sales.items||[]).forEach(it=>{
      const tr=document.createElement('tr');
      tr.innerHTML=\`<td>\${it.item_name||('Item '+it.item_id)}</td><td>\${it.qty||0}</td><td>\${rands(it.cents||0)}</td>\`;
      tb2.appendChild(tr);
    });
  };
})();
`;
