export const posHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POS · Villiersdorp Skou</title>
<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
<style> body{font-family:system-ui;margin:0;padding:16px} .card{border:1px solid #eee;border-radius:12px;padding:12px;margin:8px 0}
input,button,select{padding:10px;border:1px solid #ccc;border-radius:8px;margin:4px}</style></head>
<body><h1>POS</h1>
<div class="card">
  <label>Event ID <input id="event_id" style="width:100px"></label>
  <label>Gate ID <input id="gate_id" style="width:80px" value="1"></label>
  <label>Cashier ID <input id="cashier_id" style="width:80px" value="1"></label>
</div>
<div class="card">
  <h3>Line items</h3>
  <div id="items">
    <div>ticket_type_id <input class="tt" style="width:100px"> qty <input class="qt" type="number" value="1" style="width:80px"></div>
  </div>
  <button onclick="add()">+ Add row</button>
</div>
<div class="card">
  <h3>Payment</h3>
  <select id="pm"><option value="yoco">Yoco</option><option value="cash">Cash</option></select>
  <input id="pref" placeholder="Payment ref (Yoco) or note" style="width:240px">
</div>
<div class="card">
  <h3>Buyer</h3>
  <input id="bname" placeholder="Buyer name"><input id="bemail" placeholder="Email"><input id="bphone" placeholder="Phone">
</div>
<div class="card"><button onclick="submit()">Submit POS Order</button></div>
<pre id="out"></pre>
<script>
function add(){ const d=document.createElement('div'); d.innerHTML='ticket_type_id <input class="tt" style="width:100px"> qty <input class="qt" type="number" value="1" style="width:80px">'; document.getElementById('items').appendChild(d); }
async function submit(){
  const items=[...document.querySelectorAll('#items div')].map(el=>({ ticket_type_id:+el.querySelector('.tt').value, qty:+el.querySelector('.qt').value }));
  const body={
    event_id:+v('event_id'), gate_id:+v('gate_id'), cashier_id:+v('cashier_id'),
    payment_method:v('pm'), payment_ref:v('pref'),
    items, buyer:{ name:v('bname'), email:v('bemail'), phone:v('bphone')}, attendees:[]
  };
  const r = await fetch('/api/pos/order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  document.getElementById('out').textContent = JSON.stringify(r,null,2);
  if (r?.tickets) r.tickets.forEach(t=>{
    const c=document.createElement('canvas'); document.body.appendChild(c); QRCode.toCanvas(c, t.qr, {width:200});
  });
}
function v(id){return document.getElementById(id).value}
</script>
</body></html>`;
