export const scannerHTML = () => `<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Scanner · Villiersdorp Skou</title>
<style>
  body{font-family:system-ui;margin:0;padding:16px}
  .ok{color:#0a7d2b}.warn{color:#b36b00}.err{color:#b00020}
  input,button,select{padding:10px;border:1px solid #ccc;border-radius:8px;margin:4px}
</style></head><body>
<h1>Scanner</h1>
<label>Gate <input id="gate" value="1" style="width:80px"></label>
<textarea id="qr" placeholder="Paste/scan QR text here" rows="3" style="width:100%"></textarea>
<button onclick="doScan()">Scan</button>
<div id="res"></div>
<script>
async function doScan(confirm=null, gender=null){
  const b = { qr: document.getElementById('qr').value.trim(), gate_id: +document.getElementById('gate').value };
  if (confirm) b.confirm = confirm;
  if (gender) b.gender = gender;
  const r = await fetch('/api/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json());
  const R = document.getElementById('res');
  if (r.action==='prompt'){
    R.innerHTML = '<p class="warn">Already IN — mark OUT?</p><button onclick="doScan(\\'out\\')">Confirm OUT</button>';
  } else if (r.action==='collect' && r.field==='gender'){
    R.innerHTML = '<p>Gender required:</p><button onclick="doScan(null,\\'male\\')">Male</button><button onclick="doScan(null,\\'female\\')">Female</button><button onclick="doScan(null,\\'other\\')">Other</button>';
  } else if (r.action==='in'){
    R.innerHTML = '<p class="ok">Checked IN ✅</p>';
  } else if (r.action==='out'){
    R.innerHTML = '<p class="ok">Checked OUT ✅ — Dwell: '+(r.dwell_seconds||0)+'s</p>';
  } else {
    R.innerHTML = '<p class="err">'+(r.error||'Unknown')+'</p>';
  }
}
</script>
</body></html>`;
