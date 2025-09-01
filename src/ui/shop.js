export const shopHTML = (slug) => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Buy Tickets · ${slug}</title>
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
<style>
  body{font-family:system-ui;margin:0;padding:16px}
  .wrap{max-width:720px;margin:0 auto}
  input,button{padding:10px;border:1px solid #ccc;border-radius:8px;margin:4px}
  .card{border:1px solid #eee;border-radius:12px;padding:12px;margin:8px 0}
</style></head><body><div class="wrap">
<h1>Buy Tickets</h1>
<div id="catalog">Loading…</div>

<h2>Buyer</h2>
<input id="bname" placeholder="Full name"/><input id="bemail" placeholder="Email"/><input id="bphone" placeholder="Phone"/>

<h2>Attendees</h2>
<div id="att"></div>

<button onclick="checkout()">Pay (Yoco on device)</button>
<pre id="out"></pre>

<script>
const slug = ${JSON.stringify(slug)};
let eventId=0, types=[], items=[];
async function load() {
  const data = await fetch('/api/public/events/'+slug).then(r=>r.json());
  eventId = data.event.id; types = data.types;
  const c = document.getElementById('catalog');
  c.innerHTML = data.types.map(t=>\`
    <div class="card">
     <b>\${t.name}</b> — R\${(t.price_cents/100).toFixed(2)} · Capacity: \${t.capacity}
     <div>Qty: <input type="number" min="0" value="0" id="qty-\${t.id}" style="width:80px"></div>
    </div>\`).join('');
}
function buildAttendees(){
  const chosen = types.map(t=>({id:t.id, qty:+(document.getElementById('qty-'+t.id)?.value||0)})).filter(x=>x.qty>0);
  items = chosen.map(c=>({ticket_type_id:c.id, qty:c.qty}));
  const A = document.getElementById('att'); A.innerHTML='';
  chosen.forEach(c=>{
    for (let i=0;i<c.qty;i++){
      const row = document.createElement('div');
      row.className='card';
      row.innerHTML = \`<input placeholder="First name" class="fn">
                        <input placeholder="Last name" class="ln">
                        <input placeholder="Email" class="em">
                        <input placeholder="Phone" class="ph">
                        \${types.find(t=>t.id===c.id).requires_gender ? '<select class="gn"><option value="">Gender</option><option>male</option><option>female</option><option>other</option></select>' : ''}\`;
      A.appendChild(row);
    }
  });
}
async function checkout(){
  buildAttendees();
  const attendees = [...document.querySelectorAll('#att .card')].map(el=>({
    first: el.querySelector('.fn')?.value||'', last: el.querySelector('.ln')?.value||'',
    email: el.querySelector('.em')?.value||'', phone: el.querySelector('.ph')?.value||'',
    gender: el.querySelector('.gn')?.value||null
  }));
  const body = {
    event_id: eventId,
    items,
    buyer: { name: v('bname'), email: v('bemail'), phone: v('bphone') },
    attendees,
    payment_ref: "YOCO-REF-PLACEHOLDER"
  };
  const res = await fetch('/api/public/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  document.getElementById('out').textContent = JSON.stringify(res,null,2);
  // Show QR(s)
  if (res?.tickets) {
    res.tickets.forEach(t=>{
      const div = document.createElement('div'); div.className='card';
      div.innerHTML = \`<b>Ticket #\${t.id}</b> — \${t.attendee_first||''} \${t.attendee_last||''}<br><canvas id="qr-\${t.id}"></canvas>\`;
      document.body.appendChild(div);
      QRCode.toCanvas(document.getElementById('qr-'+t.id), t.qr, {width:200});
    });
  }
}
function v(id){return document.getElementById(id).value}
load();
document.getElementById('catalog').addEventListener('change', e=>{ if (e.target.id.startsWith('qty-')) buildAttendees(); });
</script>
</div></body></html>`;
