// /src/ui/pos.js
export function posHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>POS · Villiersdorp Skou</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2em; background: #fafafa; }
    .card { background: #fff; padding: 1.5em; border-radius: 0.75em; max-width: 600px; margin: 0 auto; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }
    label { display:block; margin-top: 1em; font-weight: 600; }
    input, select { width: 100%; padding: 0.5em; border: 1px solid #ccc; border-radius: 0.4em; margin-top: 0.25em; }
    button { margin-top: 1.5em; padding: 0.75em 1.5em; border: none; border-radius: 0.4em; background: green; color: white; font-size: 1em; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .error { color: red; margin-top: 1em; }
    .success { color: green; margin-top: 1em; }
  </style>
</head>
<body>
  <div class="card">
    <h1>POS</h1>
    <section id="shift">
      <h2>Start shift</h2>
      <label>Cashier name <input id="cashier" placeholder="e.g. John Doe"></label>
      <label>Gate name 
        <select id="gate">
          <option>Main Gate</option>
          <option>Exhibitor Gate</option>
          <option>VIP Gate</option>
        </select>
      </label>
      <label>Opening float (R) <input id="float" type="number" value="0"></label>
      <button id="startBtn">Start</button>
      <div id="msg"></div>
    </section>
  </div>

<script>
async function startShift() {
  const cashier_name = document.getElementById("cashier").value.trim();
  const gate_name = document.getElementById("gate").value.trim();
  const opening_float_cents = Math.round(Number(document.getElementById("float").value) * 100);

  if (!cashier_name || !gate_name) {
    document.getElementById("msg").innerHTML = '<div class="error">Cashier and gate required</div>';
    return;
  }

  try {
    const res = await fetch("/api/pos/session/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cashier_name, gate_name, opening_float_cents })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to start shift");

    document.getElementById("msg").innerHTML = '<div class="success">Shift started (session ' + data.session_id + ')</div>';
    // TODO: Transition to ticket-selling UI
  } catch (e) {
    document.getElementById("msg").innerHTML = '<div class="error">Error: ' + e.message + '</div>';
  }
}

document.getElementById("startBtn").addEventListener("click", startShift);
</script>
</body>
</html>`;
}
