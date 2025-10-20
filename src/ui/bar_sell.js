// /src/ui/bar_sell.js
export function barSellHTML() {
  return `<!doctype html><html lang="af"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Bar verkope</title>
<style>
  :root{
    --ink:#0b1320; --muted:#667085; --bg:#f6f8f7; --card:#fff; --accent:#0a7d2b; --danger:#b42318; --border:#e5e7eb;
  }
  *{ box-sizing:border-box }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif }
  .wrap{ max-width:1100px; margin:20px auto; padding:0 16px }
  h1{ margin:0 0 16px }
  /* Two-column layout */
  .grid{ display:grid; grid-template-columns: 1.1fr .9fr; gap:16px; align-items:start }
  @media (max-width:980px){ .grid{ grid-template-columns:1fr } }

  .card{ background:var(--card); border-radius:14px; box-shadow:0 12px 26px rgba(0,0,0,.08); padding:16px; }
  .row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap }
  input{ padding:12px; border:1px solid var(--border); border-radius:12px; font:inherit; background:#fff }
  .chip{ display:inline-flex; align-items:center; padding:8px 12px; border:1px solid var(--border); border-radius:999px; background:#f9fafb; cursor:pointer; }
  .chip.active{ background:var(--accent); color:#fff; border-color:var(--accent) }
  .muted{ color:var(--muted) }
  .items{ display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px; margin-top:10px; max-height:52vh; overflow:auto; padding-right:6px; }
  @media (max-width:520px){ .items{ max-height:40vh } }
  .item{ border:1px solid var(--border); border-radius:12px; padding:12px; cursor:pointer; background:#fff }
  .item:hover{ border-color:#cbd5e1 }
  .item .name{ font-weight:800; margin:0 0 6px }
  .item .price{ color:#444 }
  /* Cart (smaller + scroll on mobile) */
  .cart{ min-height:120px; max-height:200px; overflow:auto; background:#fafafa; border:1px dashed var(--border); border-radius:12px; padding:10px }
  @media (max-width:520px){ .cart{ min-height:80px; max-height:140px } }
  .cart-line{ display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f1f3f5 }
  .cart-line:last-child{ border-bottom:0 }
  .btn{ padding:12px 16px; border-radius:12px; border:0; cursor:pointer; font-weight:800 }
  .btn.primary{ background:var(--accent); color:#fff }
  .btn.alt{ background:#111; color:#fff }
  .btn.light{ background:#e5e7eb; color:#111 }
  .total{ font-size:18px; font-weight:900 }
  .small{ padding:8px 10px; font-size:14px; border-radius:10px }
  .disabled{ opacity:.6; pointer-events:none }
  .note{ font-size:13px; color:var(--muted); margin-top:6px }
</style>
</head><body>
<div class="wrap">
  <h1>Bar verkope</h1>

  <div class="grid">
    <!-- LEFT: catalogue (on mobile the cart appears above items via DOM order below) -->
    <div class="card" id="left-card">
      <div class="row" style="justify-content:space-between">
        <input id="wallet" placeholder="Wallet ID of selfoon" style="flex:1; min-width:180px"/>
        <button id="scanBtn" class="btn light small">Scan</button>
        <button id="loadBtn" class="btn light small">Laai</button>
      </div>
      <div id="cust" class="muted note" style="margin-top:8px">—</div>

      <!-- MOBILE: render cart near top. We'll place same cart box here so on small screens it's shown first -->
      <div id="cartMobileWrapper" style="display:none; margin-top:12px">
        <h3 style="margin:0 0 8px">Mandjie</h3>
        <div id="cartMobile" class="cart"></div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px">
          <div><span class="muted">Totaal</span> • <span id="totalMobile" class="total">R0.00</span></div>
          <div class="row">
            <button id="checkoutBtnMobile" class="btn primary small">Klaar</button>
            <button id="clearBtnMobile" class="btn light small">Maak skoon</button>
          </div>
        </div>
        <div id="leftMsgMobile" class="muted note" style="margin-top:8px"></div>
      </div>

      <div id="cats" class="row" style="margin:12px 0 6px"></div>
      <div id="items" class="items"></div>
      <div id="leftMsg" class="muted note" style="margin-top:8px"></div>
    </div>

    <!-- RIGHT: cart + checkout for desktop -->
    <div class="card" id="right-card" style="position:relative">
      <h3 style="margin:0 0 10px">Mandjie</h3>
      <div id="cart" class="cart"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px">
        <div><span class="muted">Totaal</span> • <span id="total" class="total">R0.00</span></div>
        <div class="row">
          <button id="checkoutBtn" class="btn primary">Klaar</button>
          <button id="clearBtn" class="btn light">Maak skoon</button>
        </div>
      </div>
      <div id="rightMsg" class="muted note" style="margin-top:8px"></div>
    </div>
  </div>
</div>

<script>
/* ---------- helpers ---------- */
const $ = (id)=>document.getElementById(id);
const digits = (s)=>String(s||'').replace(/\\D+/g,'');
const rands = (c)=> 'R'+((Number(c)||0)/100).toFixed(2);
const cents = (n)=> Number(n||0)|0;

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

/* ---------- caching for items ---------- */
const ITEMS_CACHE_KEY = 'BAR_ITEMS_CACHE_V1';
const ITEMS_TTL_MS = 1000 * 60 * 60; // 1 hour

async function loadItemsCached(){
  // try local cache first
  try {
    const raw = localStorage.getItem(ITEMS_CACHE_KEY);
    if (raw){
      const parsed = JSON.parse(raw);
      if (parsed && parsed.ts && (Date.now() - parsed.ts) < ITEMS_TTL_MS && Array.isArray(parsed.items)){
        // kick off background refresh
        fetchAndRefreshItems();
        return parsed.items;
      }
    }
  } catch (e) {}
  // fallback to fetch
  const items = await fetchAndRefreshItems();
  return items;
}

async function fetchAndRefreshItems(){
  try {
    const r = await fetch('/api/items');
    const j = await r.json().catch(()=>({}));
    const items = (j && j.items) || [];
    try {
      localStorage.setItem(ITEMS_CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
    } catch (e) {}
    return items;
  } catch (e) {
    return [];
  }
}

/* ---------- app state ---------- */
let walletId = null, version = 0, balance = 0;
let allItems = [];     // API payload
let cart = new Map();  // id -> { id, name, price_cents, qty }
let currentCat = null;

/* ---------- rendering helpers ---------- */
function money(c){ return rands(Number(c||0)); }

function uniqueCats(items){
  const set = new Set(items.map(i => String(i.category||'')));
  return Array.from(set).filter(Boolean);
}

function displayName(it){
  const base = it.name || '';
  const v = (it.variant||'').trim();
  return v ? \`\${base} · \${v}\` : base;
}

function renderCats(){
  const cats = uniqueCats(allItems);
  const html = cats.map(c => \`<span class="chip \${c===currentCat?'active':''}" data-cat="\${c}">\${(c||'')}</span>\`).join('');
  $('cats').innerHTML = html || '<span class="muted">Geen kategorieë</span>';
  $('cats').querySelectorAll('[data-cat]').forEach(el=>{
    el.onclick = ()=> { currentCat = el.getAttribute('data-cat'); renderCats(); renderItems(); };
  });
}

function renderItems(){
  const list = allItems.filter(it => it.category === currentCat);
  $('items').innerHTML = list.map(it => \`
    <div class="item" data-id="\${it.id}">
      <div class="name">\${displayName(it)}</div>
      <div class="price">\${it.price_cents==null ? '' : money(it.price_cents)}</div>
    </div>\`
  ).join('');
  $('leftMsg').textContent = list.length ? '' : 'Geen items in hierdie kategorie.';
  $('items').querySelectorAll('[data-id]').forEach(el=>{
    el.onclick = () => addToCart(Number(el.getAttribute('data-id')));
  });
}

function renderCartTo(targetId, totalId, msgId){
  const rows = Array.from(cart.values());
  const box = $(targetId);
  box.innerHTML = rows.length ? rows.map(r => \`
    <div class="cart-line" data-id="\${r.id}">
      <div>\${r.qty}× \${r.name}</div>
      <div>\${money(r.qty * (r.price_cents||0))}</div>
    </div>\`
  ).join('') : '<div class="muted">Leeg.</div>';

  const total = rows.reduce((s,r)=> s + r.qty*(r.price_cents||0), 0);
  $(totalId).textContent = money(total);
  if (msgId) $(msgId).textContent = balance ? ('Oorblyf: '+money(balance-total)) : '';
}

function renderCartAll(){
  renderCartTo('cart', 'total', 'rightMsg');
  renderCartTo('cartMobile', 'totalMobile', 'leftMsgMobile');
}

/* ---------- cart manipulation ---------- */
function addToCart(id){
  const it = allItems.find(x => Number(x.id)===Number(id));
  if (!it) return;
  const key = String(id);
  const name = displayName(it);
  const price = cents(it.price_cents);
  const cur = cart.get(key) || { id: id, name, price_cents: price, qty: 0 };
  cur.qty++;
  cart.set(key, cur);
  renderCartAll();
}

function clearCart(){ cart.clear(); renderCartAll(); }

/* ---------- wallet API helpers ---------- */
async function loadWalletByIdOrMobile(value){
  // try wallet id
  try {
    const r1 = await fetch('/api/wallets/'+encodeURIComponent(value));
    const j1 = await r1.json().catch(()=>({}));
    if (r1.ok && j1 && j1.ok !== false) return j1.wallet || j1;
  } catch {}
  const d = digits(value);
  if (!d) throw new Error('not_found');
  const r2 = await fetch('/api/wallets/by-mobile/'+encodeURIComponent(d));
  const j2 = await r2.json().catch(()=>({}));
  if (!r2.ok || j2.ok===false) throw new Error('not_found');
  return j2.wallet || j2;
}

/* ---------- actions ---------- */
$('scanBtn').onclick = () => {
  const v = prompt('Voer/scan wallet ID of selfoon:');
  if (!v) return;
  $('wallet').value = v.trim();
  $('loadBtn').click();
};

$('loadBtn').onclick = async () => {
  const raw = ($('wallet').value||'').trim();
  if (!raw){ alert('Voer wallet ID of selfoon in'); return; }

  try {
    const w = await loadWalletByIdOrMobile(raw);
    if (!w) { alert('Wallet nie gevind'); return; }
    walletId = w.id;
    version = Number(w.version||0);
    balance = cents(w.balance_cents);
    $('cust').textContent = (w.mobile || w.name || 'Wallet') + ' • Balans ' + money(balance);
    // ensure mobile cart wrapper visibility for mobile devices
    toggleMobileCart();
  } catch (e) {
    alert('Wallet nie gevind');
  }
};

/* ---------- checkout logic (no negatives allowed) ---------- */
async function doCheckout(expected_version){
  const rows = Array.from(cart.values());
  if (!walletId || !rows.length) { alert('Leë mandjie of geen beursie gelaai.'); return; }

  const total = rows.reduce((s,r)=> s + r.qty*(r.price_cents||0), 0);
  if (total <= 0) { alert('Leë mandjie.'); return; }

  // enforce non-negative: block checkout if would go negative
  const newBal = Number(balance || 0) - total;
  if (newBal < 0) {
    alert('Balans onvoldoende. Kan nie keur dat beursie negatief gaan nie.'); 
    return;
  }

  // build payload
  const payload = {
    items: rows.map(r => ({
      id: r.id,
      name: r.name,
      qty: r.qty,
      unit_price_cents: r.price_cents
    })),
    expected_version: typeof expected_version === 'number' ? expected_version : -1,
    bartender_id: 'bar-1',
    device_id: 'dev-1'
  };

  // disable checkout buttons while processing
  setCheckoutBusy(true);
  try {
    const r = await fetch('/api/wallets/'+encodeURIComponent(walletId)+'/deduct', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || j.ok===false) throw new Error(j.error||'deduct_failed');

    // success: update balance/version, clear cart
    balance = cents(j.new_balance_cents);
    version = Number(j.version || version);
    clearCart();
    $('cust').textContent = 'Balans ' + money(balance);
    $('rightMsg').textContent = 'Afgereken. Nuwe balans: ' + money(balance);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    alert(e.message || 'Fout met afrekening.');
  } finally {
    setCheckoutBusy(false);
  }
}

function setCheckoutBusy(isBusy){
  const els = [ $('checkoutBtn'), $('checkoutBtnMobile') ];
  els.forEach(el=>{ if(el) el.disabled = !!isBusy; el && el.classList.toggle('disabled', !!isBusy); });
}

/* Wire checkout buttons */
$('checkoutBtn').onclick = ()=> doCheckout(version);
$('checkoutBtnMobile').onclick = ()=> doCheckout(version);
$('clearBtn').onclick = clearCart;
$('clearBtnMobile').onclick = clearCart;

/* ---------- items boot & UI tweaks ---------- */
async function boot(){
  // fast: show cached items immediately (if any)
  allItems = await loadItemsCached();
  const cats = uniqueCats(allItems);
  currentCat = cats[0] || null;
  renderCats();
  renderItems();
  renderCartAll();

  // background refresh will run inside loadItemsCached() when cached; otherwise already fresh
}

function toggleMobileCart(){
  // show mobile cart wrapper only on narrow viewports
  const isNarrow = window.matchMedia && window.matchMedia('(max-width:980px)').matches;
  $('cartMobileWrapper').style.display = isNarrow ? 'block' : 'none';
}

/* ---------- event listeners ---------- */
window.addEventListener('resize', toggleMobileCart);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') fetchAndRefreshItems().then(items=>{ allItems=items; renderCats(); renderItems(); }); });

/* ---------- init ---------- */
boot();
toggleMobileCart();
</script>
</body></html>`;
}
