/* ---------- POS admin: live summary ---------- */
router.add("GET", "/api/admin/pos/summary", guard(async (_req, env) => {
  const now = Math.floor(Date.now()/1000);

  // Cashups (cash & card totals) — one row per session
  const cashups = (await env.DB.prepare(
    `SELECT id, cashier_name, gate_name, opening_float_cents,
            COALESCE(total_cash_cents,0)  AS total_cash_cents,
            COALESCE(total_card_cents,0)  AS total_card_cents,
            (COALESCE(total_cash_cents,0)+COALESCE(total_card_cents,0)) AS total_cents,
            opened_at, closed_at, manager_name
     FROM pos_cashups
     ORDER BY opened_at DESC`
  ).all()).results || [];

  // Payments total (sum across cashups; you could also sum orders)
  const payments = cashups.reduce((a,c)=>({
    cash_cents: a.cash_cents + Number(c.total_cash_cents||0),
    card_cents: a.card_cents + Number(c.total_card_cents||0),
  }), {cash_cents:0, card_cents:0});
  payments.total_cents = payments.cash_cents + payments.card_cents;

  // By ticket type (sold = tickets issued)
  const byTT = (await env.DB.prepare(
    `SELECT tt.event_id, e.name AS event_name, tt.id AS ticket_type_id, tt.name,
            COUNT(t.id) AS sold_qty,
            (COUNT(t.id) * COALESCE(tt.price_cents,0)) AS revenue_cents
     FROM ticket_types tt
     JOIN events e ON e.id=tt.event_id
     LEFT JOIN tickets t ON t.ticket_type_id=tt.id
     GROUP BY tt.id
     ORDER BY e.starts_at DESC, tt.id ASC`
  ).all()).results || [];

  // Scans per event (current presence = IN - OUT)
  const scans = (await env.DB.prepare(
    `SELECT e.id AS event_id, e.name,
            SUM(CASE WHEN t.state='in'  THEN 1 ELSE 0 END) AS in_count,
            SUM(CASE WHEN t.state='out' THEN 1 ELSE 0 END) AS out_count
     FROM events e
     LEFT JOIN tickets t ON t.event_id=e.id
     GROUP BY e.id
     ORDER BY e.starts_at DESC`
  ).all()).results?.map(r => ({
    event_id: r.event_id,
    name: r.name,
    in: Number(r.in_count||0),
    out: Number(r.out_count||0),
    inside: Number(r.in_count||0) - Number(r.out_count||0)
  })) || [];

  return json({
    ok: true,
    updated_at: now,
    payments,
    cashups,
    by_ticket_type: byTT,
    scans
  });
}));

/* ---------- POS admin: CSV export ---------- */
router.add("GET", "/api/admin/pos/export.csv", guard(async (_req, env) => {
  // Simple CSV with cashups + ticket type summary in one file (two sections)
  const toCSV = rows => {
    if (!rows?.length) return "";
    const keys = Object.keys(rows[0]);
    const esc = v => (v==null?"":String(v).includes(",")||String(v).includes("\"")||String(v).includes("\n")
      ? `"${String(v).replace(/"/g,'""')}"`
      : String(v));
    const head = keys.join(",");
    const body = rows.map(r => keys.map(k => esc(r[k])).join(",")).join("\n");
    return head+"\n"+body;
  };

  const cashups = (await env.DB.prepare(
    `SELECT id, cashier_name, gate_name, opening_float_cents,
            COALESCE(total_cash_cents,0)  AS total_cash_cents,
            COALESCE(total_card_cents,0)  AS total_card_cents,
            opened_at, closed_at, manager_name
     FROM pos_cashups ORDER BY opened_at DESC`
  ).all()).results || [];

  const byTT = (await env.DB.prepare(
    `SELECT e.name AS event_name, tt.id AS ticket_type_id, tt.name AS ticket_type_name,
            COUNT(t.id) AS sold_qty,
            (COUNT(t.id) * COALESCE(tt.price_cents,0)) AS revenue_cents
     FROM ticket_types tt
     JOIN events e ON e.id=tt.event_id
     LEFT JOIN tickets t ON t.ticket_type_id=tt.id
     GROUP BY tt.id
     ORDER BY e.starts_at DESC, tt.id ASC`
  ).all()).results || [];

  const blocks = [
    "# Cashups",
    toCSV(cashups),
    "",
    "# TicketTypes",
    toCSV(byTT)
  ].join("\n");

  return new Response(blocks, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pos-export-${Date.now()}.csv"`
    }
  });
}));
