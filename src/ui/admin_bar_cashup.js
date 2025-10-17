// /src/ui/admin_bar_cashup.js
// Inline JS snippet consumed by /src/ui/admin.js
export const adminBarCashupJS = `
(function(){
  if (!window.AdminBar) window.AdminBar = {};
  const rands=c=>'R'+((Number(c)||0)/100).toFixed(2);

  function el(html){
    const d=document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function tableWrap(title, id){
    return el(
\`<div class="card" style="padding:12px">
   <h3 style="margin:0 0 10px">\${title}</h3>
   <div id="\${id}-err" class="muted" style="display:none;color:#b42318;margin-bottom:8px"></div>
   <div id="\${id}-loading" class="muted" style="margin:6px 0">Loading…</div>
   <table id="\${id}-tbl" style="width:100%;border-collapse:collapse;display:none">
     <thead>
       <tr>
         <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Col 1</th>
         <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Col 2</th>
         <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Col 3</th>
         <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Col 4</th>
       </tr>
     </thead>
     <tbody></tbody>
   </table>
   <div id="\${id}-empty" class="muted" style="display:none">No data found for the selected period.</div>
 </div>\`);
  }

  window.AdminBar.cashup = async function(container){
    container.innerHTML = '';

    const grid = el(
\`<div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px"></div>\`
    );
    container.appendChild(grid);

    // Wallet top-ups (cash/card/total) by day
    const topupsBox = tableWrap("Wallet cashup (Top-ups by day)", "bcTop");
    grid.appendChild(topupsBox);
    topupsBox.querySelector('thead tr').innerHTML =
      '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Day</th>'
    + '<th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Cash</th>'
    + '<th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Card</th>'
    + '<th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Total</th>';

    // Bar sales per item
    const itemsBox  = tableWrap("Bar cashup (Sales by item)", "bcItems");
    grid.appendChild(itemsBox);
    itemsBox.querySelector('thead tr').innerHTML =
      '<th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb">Item</th>'
    + '<th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Qty</th>'
    + '<th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb">Total</th>'
    + '<th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb"></th>';

    // Helpers to show states
    function showError(boxId, msg){
      const err = document.getElementById(boxId+'-err');
      const loading = document.getElementById(boxId+'-loading');
      const tbl = document.getElementById(boxId+'-tbl');
      const empty = document.getElementById(boxId+'-empty');
      if (err){ err.style.display='block'; err.textContent = msg || 'Error loading data.'; }
      if (loading) loading.style.display='none';
      if (tbl) tbl.style.display='none';
      if (empty) empty.style.display='none';
    }
    function showEmpty(boxId){
      const err = document.getElementById(boxId+'-err');
      const loading = document.getElementById(boxId+'-loading');
      const tbl = document.getElementById(boxId+'-tbl');
      const empty = document.getElementById(boxId+'-empty');
      if (err) err.style.display='none';
      if (loading) loading.style.display='none';
      if (tbl) tbl.style.display='none';
      if (empty) empty.style.display='block';
    }
    function showTable(boxId){
      const err = document.getElementById(boxId+'-err');
      const loading = document.getElementById(boxId+'-loading');
      const tbl = document.getElementById(boxId+'-tbl');
      const empty = document.getElementById(boxId+'-empty');
      if (err) err.style.display='none';
      if (loading) loading.style.display='none';
      if (tbl) tbl.style.display='table';
      if (empty) empty.style.display='none';
    }

    // Load Top-ups
    async function loadTopups(){
      const boxId = 'bcTop';
      try{
        const j = await fetch('/api/admin/bar/cashup/wallet').then(r=>r.json());
        const days = (j && j.days) || [];
        if (!days.length) return showEmpty(boxId);

        const tb = document.querySelector('#'+boxId+'-tbl tbody');
        tb.innerHTML = '';
        let sc = 0, cc = 0, tc = 0;

        days.forEach(d=>{
          sc += Number(d.cash_cents||0);
          cc += Number(d.card_cents||0);
          tc += Number(d.total_cents||0);
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td style="padding:8px;border-bottom:1px solid #e5e7eb">'+(d.day||'')+'</td>'
          + '<td style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb">'+rands(d.cash_cents)+'</td>'
          + '<td style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb">'+rands(d.card_cents)+'</td>'
          + '<td style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb">'+rands(d.total_cents)+'</td>';
          tb.appendChild(tr);
        });

        // Totals row
        const trTot = document.createElement('tr');
        trTot.innerHTML =
          '<td style="padding:8px;border-top:2px solid #e5e7eb;font-weight:700">Total</td>'
        + '<td style="padding:8px;text-align:right;border-top:2px solid #e5e7eb;font-weight:700">'+rands(sc)+'</td>'
        + '<td style="padding:8px;text-align:right;border-top:2px solid #e5e7eb;font-weight:700">'+rands(cc)+'</td>'
        + '<td style="padding:8px;text-align:right;border-top:2px solid #e5e7eb;font-weight:700">'+rands(tc)+'</td>';
        tb.appendChild(trTot);

        showTable(boxId);
      } catch(e){
        showError(boxId, (e && e.message) || 'Failed to load wallet cashup.');
      }
    }

    // Load Sales
    async function loadSales(){
      const boxId = 'bcItems';
      try{
        const j = await fetch('/api/admin/bar/cashup/sales').then(r=>r.json());
        const items = (j && j.items) || [];
        if (!items.length) return showEmpty(boxId);

        const tb = document.querySelector('#'+boxId+'-tbl tbody');
        tb.innerHTML = '';
        let total = 0;
        items.forEach(it=>{
          total += Number(it.cents||0);
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td style="padding:8px;border-bottom:1px solid #e5e7eb">'+(it.item_name || ('Item '+(it.item_id||'')))+'</td>'
          + '<td style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb">'+(Number(it.qty||0))+'</td>'
          + '<td style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb">'+rands(it.cents||0)+'</td>'
          + '<td style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb"></td>';
          tb.appendChild(tr);
        });

        // Totals row
        const trTot = document.createElement('tr');
        trTot.innerHTML =
          '<td style="padding:8px;border-top:2px solid #e5e7eb;font-weight:700">Total</td>'
        + '<td style="padding:8px;text-align:right;border-top:2px solid #e5e7eb;font-weight:700"></td>'
        + '<td style="padding:8px;text-align:right;border-top:2px solid #e5e7eb;font-weight:700">'+rands(total)+'</td>'
        + '<td style="padding:8px;text-align:right;border-top:2px solid #e5e7eb;font-weight:700"></td>';
        tb.appendChild(trTot);

        showTable(boxId);
      } catch(e){
        showError(boxId, (e && e.message) || 'Failed to load bar sales.');
      }
    }

    // Kick off loads in parallel
    loadTopups();
    loadSales();
  };
})();
`;
