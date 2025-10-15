// /src/ui/admin_pos.js
// Inline JS snippet consumed by /src/ui/admin.js
export const adminPOSJS = `
(function(){
  if (!window.AdminPanels) window.AdminPanels = {};
  const esc = (s)=>String(s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
  const rands = (c)=>"R"+((Number(c)||0)/100).toFixed(2);

  async function api(url, opts){
    const r = await fetch(url, opts);
    let j = {};
    try { j = await r.json(); } catch {}
    if (!r.ok || j.ok === false) {
      const msg = (j && (j.error||j.message)) || ("HTTP "+r.status);
      const err = new Error(msg);
      err.status = r.status;
      throw err;
    }
    return j;
  }

  function fmtTs(unix){
    if (!unix) return "";
    const d = new Date(Number(unix)*1000);
    return d.toLocaleString();
  }

  function drawer(){
    let el = document.getElementById('pos-drawer');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'pos-drawer';
    el.style.cssText = 'position:fixed;inset:0;display:none;background:rgba(0,0,0,.35);z-index:50';
    el.innerHTML =
      '<div style="position:absolute;right:0;top:0;height:100%;width:min(760px,95vw);background:#fff;box-shadow:-8px 0 28px rgba(0,0,0,.15);display:flex;flex-direction:column">'
        + '<div style="padding:14px 16px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
          + '<div id="pos-drawer-title" style="font-weight:800">Session</div>'
          + '<button id="pos-drawer-close" class="tab" style="font-weight:800">Close</button>'
        + '</div>'
        + '<div id="pos-drawer-body" style="padding:14px;overflow:auto"></div>'
      + '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', (e)=>{ if (e.target===el) el.style.display='none'; });
    el.querySelector('#pos-drawer-close').onclick = ()=> el.style.display='none';
    return el;
  }

  function showDrawer(title, html){
    const d = drawer();
    d.querySelector('#pos-drawer-title').textContent = title;
    d.querySelector('#pos-drawer-body').innerHTML = html;
    d.style.display = 'block';
  }

  function sessionsTable(sessions){
    if (!Array.isArray(sessions) || !sessions.length) {
      return '<div class="muted">No POS sessions yet.</div>';
    }
    return (
      '<style>'
      + '.pos-table{width:100%;border-collapse:collapse}'
      + '.pos-table th,.pos-table td{padding:10px 8px;border-bottom:1px solid #eef1f3;vertical-align:middle}'
      + '.pos-table th{font-size:13px;color:#667085;text-align:left}'
      + '.pos-table td.num{text-align:right;font-variant-numeric:tabular-nums}'
      + '.pos-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}'
      + '.btn{padding:6px 10px;border:1px solid #e5e7eb;border-radius:999px;background:#fff;cursor:pointer}'
      + '.btn.primary{background:#0a7d2b;border-color:#0a7d2b;color:#fff;font-weight:800}'
      + '.btn.warn{background:#b42318;border-color:#b42318;color:#fff}'
      + '.chip{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid #e5e7eb;font-size:12px}'
      + '</style>'
      + '<table class="pos-table">'
        + '<thead><tr>'
          + '<th style="width:60px">ID</th>'
          + '<th>Cashier</th>'
          + '<th>Gate</th>'
          + '<th>Opened</th>'
          + '<th>Closed</th>'
          + '<th class="num">Cash</th>'
          + '<th class="num">Card</th>'
          + '<th>Closed by</th>'
          + '<th style="text-align:right;width:280px">Actions</th>'
        + '</tr></thead><tbody>'
        + sessions.map(s => (
            '<tr data-id="'+s.id+'">'
              + '<td><span class="chip">'+s.id+'</span></td>'
              + '<td>'+esc(s.cashier_name||'')+'</td>'
              + '<td>'+esc(s.gate_name||String(s.gate_id||""))+'</td>'
              + '<td>'+esc(fmtTs(s.opened_at))+'</td>'
              + '<td>'+esc(s.closed_at ? fmtTs(s.closed_at) : '')+'</td>'
              + '<td class="num">'+esc(rands(s.cash_cents))+'</td>'
              + '<td class="num">'+esc(rands(s.card_cents))+'</td>'
              + '<td>'+esc(s.closing_manager||'')+'</td>'
              + '<td>'
                + '<div class="pos-actions">'
                  + '<button class="btn js-view">View</button>'
                  + (!s.closed_at ? '<button class="btn primary js-close">Close</button>' : '')
                  + '<button class="btn warn js-del">Delete</button>'
                + '</div>'
              + '</td>'
            + '</tr>'
        )).join('')
        + '</tbody></table>'
    );
  }

  async function loadSessions(into){
    into.innerHTML = '<div class="muted">Loading sessions…</div>';
    let data;
    try {
      data = await api('/api/admin/pos/sessions');
    } catch(e){
      into.innerHTML = '<div class="muted">Could not load sessions: '+esc(e.message||'error')+'</div>';
      return;
    }
    const sessions = data.sessions || [];
    into.innerHTML = sessionsTable(sessions);

    // wire row actions
    into.querySelectorAll('tbody tr').forEach(tr=>{
      const id = tr.getAttribute('data-id');
      const btnView  = tr.querySelector('.js-view');
      const btnClose = tr.querySelector('.js-close');
      const btnDel   = tr.querySelector('.js-del');

      if (btnView) btnView.onclick = ()=> viewSession(id);
      if (btnClose) btnClose.onclick = ()=> closeSession(id, into);
      if (btnDel) btnDel.onclick = ()=> deleteSession(id, into);
    });
  }

  async function viewSession(id){
    // Try a couple of conventional endpoints; show a helpful message if none exist.
    const tryEndpoints = [
      '/api/admin/pos/session/'+encodeURIComponent(id)+'/transactions',
      '/api/admin/pos/session/'+encodeURIComponent(id)+'/payments'
    ];
    let ok = false, rows = [];
    for (const url of tryEndpoints){
      try {
        const j = await api(url);
        rows = j.items || j.transactions || j.payments || [];
        ok = true;
        break;
      } catch(e){ /* keep trying */ }
    }
    if (!ok){
      showDrawer('Session #'+id, '<div class="muted">No transactions endpoint found yet for this session.<br>Expected one of:<br><code>'
        + esc(tryEndpoints.join('</code><br><code>')) + '</code></div>');
      return;
    }
    const html =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
        + '<div class="muted">Transactions for session <strong>#'+id+'</strong> ('+rows.length+')</div>'
      + '</div>'
      + '<table style="width:100%;border-collapse:collapse">'
        + '<thead><tr>'
          + '<th style="text-align:left;padding:8px;border-bottom:1px solid #eef1f3">#</th>'
          + '<th style="text-align:left;padding:8px;border-bottom:1px solid #eef1f3">When</th>'
          + '<th style="text-align:left;padding:8px;border-bottom:1px solid #eef1f3">Method</th>'
          + '<th style="text-align:right;padding:8px;border-bottom:1px solid #eef1f3">Amount</th>'
          + '<th style="text-align:left;padding:8px;border-bottom:1px solid #eef1f3">Ref</th>'
        + '</tr></thead><tbody>'
        + rows.map((r,i)=>(
            '<tr>'
              + '<td style="padding:8px;border-bottom:1px solid #f1f3f6">'+(r.id||i+1)+'</td>'
              + '<td style="padding:8px;border-bottom:1px solid #f1f3f6">'+esc(fmtTs(r.created_at||r.paid_at||r.ts))+'</td>'
              + '<td style="padding:8px;border-bottom:1px solid #f1f3f6">'+esc(r.method||r.type||'')+'</td>'
              + '<td style="padding:8px;border-bottom:1px solid #f1f3f6;text-align:right">'+rands(r.amount_cents||r.total_cents||r.amount)+'</td>'
              + '<td style="padding:8px;border-bottom:1px solid #f1f3f6">'+esc(r.ref||r.reference||r.order_code||'')+'</td>'
            + '</tr>'
        )).join('') + '</tbody></table>';
    showDrawer('Session #'+id, html);
  }

  async function closeSession(id, into){
    if (!confirm('Close session #'+id+'?')) return;
    try{
      await api('/api/admin/pos/session/'+encodeURIComponent(id)+'/close', { method:'POST' });
      await loadSessions(into);
    }catch(e){
      showDrawer('Close session', '<div style="line-height:1.5">Server does not expose a close endpoint yet.<br>'
        + 'Expected: <code>/api/admin/pos/session/'+esc(id)+'/close</code><br><br>'
        + 'Error: '+esc(e.message||'')+'</div>');
    }
  }

  async function deleteSession(id, into){
    if (!confirm('Delete session #'+id+'? This cannot be undone.')) return;
    try{
      await api('/api/admin/pos/session/'+encodeURIComponent(id)+'/delete', { method:'POST' });
      await loadSessions(into);
    }catch(e){
      showDrawer('Delete session', '<div style="line-height:1.5">Server does not expose a delete endpoint yet.<br>'
        + 'Expected: <code>/api/admin/pos/session/'+esc(id)+'/delete</code><br><br>'
        + 'Error: '+esc(e.message||'')+'</div>');
    }
  }

  // Register panel
  window.AdminPanels.pos = async function(){
    const host = document.getElementById('panel-pos');
    host.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
        + '<h2 style="margin:0">POS Sessions</h2>'
        + '<div class="muted">Audit and manage cashier sessions</div>'
      + '</div>'
      + '<div id="pos-sessions-box"></div>';
    const box = document.getElementById('pos-sessions-box');
    loadSessions(box);
  };
})();
`;
