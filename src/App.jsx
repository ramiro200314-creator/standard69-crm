import { useState, useEffect, useMemo, useCallback } from "react";

// ─── Google Sheets API ────────────────────────────────────────────────────────
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyCEuPro2M5gKImueRdnUr4kfCnyvy_qO_UYza2EzsipiFu0qvlSDx4X7HYes7FtJaHZQ/exec";

function xhr(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.open(options.method || "GET", url, true);
    req.timeout = 20000;
    req.onload  = () => { try { resolve(JSON.parse(req.responseText)); } catch(e) { reject(new Error("JSON inválido")); } };
    req.onerror = () => reject(new Error("Error de red"));
    req.ontimeout = () => reject(new Error("Timeout — verificá tu conexión"));
    options.body ? req.send(options.body) : req.send();
  });
}

async function sheetsGet() {
  const json = await xhr(`${SCRIPT_URL}?t=${Date.now()}`);
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

async function sheetsPost(body) {
  const json = await xhr(SCRIPT_URL, { method: "POST", body: JSON.stringify(body) });
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

const toNum  = v => (v === "" || v == null) ? null : Number(v);
const toDate = v => {
  if (!v) return "";
  const s = String(v);
  if (s.includes("T")) return s.slice(0, 10);   // "2025-06-15T03:00:00Z" → "2025-06-15"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;  // ya es YYYY-MM-DD
  // Intentar parsear fechas de otro formato
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return "";
};
const parseClient    = r => ({ ...r, id: toNum(r.id), canal: r.canal || "" });
const parseEvent     = r => ({ ...r, id: toNum(r.id), clientId: toNum(r.clientId), guests: toNum(r.guests), amount: toNum(r.amount), date: toDate(r.date) });
const parsePayment   = r => ({ ...r, id: toNum(r.id), eventId: toNum(r.eventId), amount: toNum(r.amount), date: toDate(r.date) });
const parseCost      = r => ({ ...r, id: toNum(r.id), eventId: r.eventId ? toNum(r.eventId) : null, amount: toNum(r.amount), date: toDate(r.date) });
const parsePostventa = r => ({ ...r, eventId: toNum(r.eventId), rating: toNum(r.rating) });
const parsePersonal  = r => ({ ...r, id: toNum(r.id), tarifaEvento: toNum(r.tarifaEvento) });

// ─── Brand ────────────────────────────────────────────────────────────────────
const GOLD   = "#D39A59";   // Standard 69 brand gold
const BEIGE  = "#B8A18F";   // Standard 69 beige
const TEAL   = "#124A61";   // Standard 69 teal

const STAGES = ["Consulta", "Cotización", "Confirmación", "Evento", "Post-venta"];
const STAGE_COLORS = {
  "Consulta":     { fg: "#8A9AB0", bg: "rgba(138,154,176,0.10)", bd: "rgba(138,154,176,0.22)" },
  "Cotización":   { fg: "#72899E", bg: "rgba(114,137,158,0.12)", bd: "rgba(114,137,158,0.25)" },
  "Confirmación": { fg: "#D39A59", bg: "rgba(211,154,89,0.10)",  bd: "rgba(211,154,89,0.25)"  },
  "Evento":       { fg: "#7EB89A", bg: "rgba(126,184,154,0.10)", bd: "rgba(126,184,154,0.25)" },
  "Post-venta":   { fg: "#B8A18F", bg: "rgba(184,161,143,0.10)", bd: "rgba(184,161,143,0.25)" },
};
const EVENT_TYPES = ["Cumpleaños", "Corporativo", "Aniversario", "Cena privada", "Boda", "Otro"];
const PAYMENT_METHODS = ["Transferencia", "Efectivo", "Débito", "Crédito", "Cheque"];
const PAYMENT_CONCEPTS = ["Seña", "Cuota 1", "Cuota 2", "Saldo", "Pago total", "Otro"];
const COST_CATS = ["Personal", "Insumos / Bebidas", "Alquiler salón", "Decoración", "Audio / Video", "Catering extra", "Transporte", "Marketing", "Otro"];

const fmtARS   = n => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
const fmtD     = d => d ? new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : "—";
const fmtDLong = d => d ? new Date(d + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : "—";
const nextId   = arr => (arr.length ? Math.max(...arr.map(x => Number(x.id) || 0)) : 0) + 1;
const si       = s => STAGES.indexOf(s);
const sc       = s => STAGE_COLORS[s] || STAGE_COLORS["Consulta"];
const todayStr = () => new Date().toISOString().split("T")[0];

const S = {
  card: { background: "#121210", border: "1px solid #1C1C18", borderRadius: 8, padding: "1.25rem" },
  inp:  { width: "100%", background: "#181816", border: "1px solid #232320", borderRadius: 5, color: "#EDE8DF", padding: "0.55rem 0.75rem", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", fontFamily: "inherit", letterSpacing: "0.01em" },
  btnP: { padding: "0.55rem 1.4rem", background: GOLD, border: "none", borderRadius: 4, color: "#080808", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.08em", textTransform: "uppercase" },
  btnS: { padding: "0.5rem 1rem", background: "#181816", border: "1px solid #232320", borderRadius: 4, color: "#7A7260", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" },
  lbl:  { display: "block", fontSize: "0.58rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "#454035", marginBottom: "0.4rem" },
  th:   { fontSize: "0.58rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "#454035", fontWeight: 400, textAlign: "left" },
};

function StageBadge({ stage }) {
  const c = sc(stage);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: c.bg, border: `1px solid ${c.bd}`, fontSize: "0.68rem", fontWeight: 500, color: c.fg }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.fg, display: "inline-block" }} />
      {stage}
    </span>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, width: "100%", maxWidth: wide ? 620 : 490, maxHeight: "90vh", overflowY: "auto", padding: "1.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.15em", textTransform: "uppercase", margin: 0 }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "1.75rem", lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, half }) {
  return (
    <div style={{ marginBottom: "0.875rem", width: half ? "calc(50% - 0.5rem)" : "100%" }}>
      <label style={S.lbl}>{label}</label>
      {children}
    </div>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError("");
    try {
      await onLogin(email, password);
    } catch(e) {
      setError(e.message || "Error al iniciar sesión");
    }
    setLoading(false);
  };

  const onKey = e => { if (e.key === "Enter") submit(); };

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0A0A0A", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 360, padding: "2.5rem", background: "#111", border: "1px solid #1E1E1E", borderRadius: 14 }}>
        <div style={{ textAlign: "center", marginBottom: "2.25rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 5, marginBottom: 6 }}>
            <span style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.25rem", fontWeight: 500, color: "#EDE8DF", letterSpacing: "0.3em", textTransform: "uppercase" }}>STANDARD</span>
            <span style={{ fontFamily: "'Satisfy',cursive", fontSize: "1.5rem", color: GOLD }}>69</span>
          </div>
          <div style={{ fontSize: "0.55rem", letterSpacing: "0.25em", textTransform: "uppercase", color: "#3A3530" }}>Event CRM</div>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={S.lbl}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKey}
            style={S.inp} placeholder="tu@email.com" autoFocus />
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={S.lbl}>Contraseña</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey}
            style={S.inp} placeholder="••••••••" />
        </div>

        {error && <div style={{ color: "#D05050", fontSize: "0.8rem", marginBottom: "1rem", textAlign: "center" }}>{error}</div>}

        <button type="button" onClick={submit} disabled={loading}
          style={{ ...S.btnP, width: "100%", padding: "0.75rem", fontSize: "0.9rem", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </div>
    </div>
  );
}

const NAV = [
  { id: "dashboard",   label: "Dashboard",   sym: "⊙" },
  { id: "pipeline",    label: "Pipeline",    sym: "⊞" },
  { id: "clients",     label: "Clientes",    sym: "◎" },
  { id: "operaciones", label: "Operaciones", sym: "◫" },
  { id: "personal",    label: "Personal",    sym: "◉" },
  { id: "pagos",       label: "Pagos",       sym: "◈" },
  { id: "postventa",   label: "Post-venta",  sym: "◇" },
  { id: "pyl",         label: "P & L",       sym: "◬" },
];

function Sidebar({ view, setView, events, payments, syncing, user, onLogout }) {
  const active  = events.filter(e => e.stage !== "Post-venta").length;
  const pending = payments.filter(p => p.status === "Pendiente").length;
  return (
    <aside style={{ width: 210, minWidth: 210, background: "#090908", borderRight: "1px solid #171714", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "1.5rem 1.25rem 1.25rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
          <span style={{ fontFamily: "'Jost',sans-serif", fontSize: "0.95rem", fontWeight: 500, color: "#EDE8DF", letterSpacing: "0.25em", textTransform: "uppercase" }}>STANDARD</span>
          <span style={{ fontFamily: "'Satisfy',cursive", fontSize: "1.1rem", color: GOLD, lineHeight: 1 }}>69</span>
        </div>
        <div style={{ fontSize: "0.55rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "#2E2A25", marginTop: 4 }}>Event CRM</div>
      </div>
      <nav style={{ flex: 1 }}>
        {NAV.map(n => (
          <button key={n.id} type="button" onClick={() => setView(n.id)} style={{
            display: "flex", alignItems: "center", gap: "0.7rem", width: "100%",
            padding: "0.7rem 1.25rem", background: "none", border: "none",
            borderLeft: view === n.id ? `2px solid ${GOLD}` : "2px solid transparent",
            color: view === n.id ? "#F0EAD8" : "#555045", cursor: "pointer",
            fontFamily: "inherit", fontSize: "0.875rem", textAlign: "left",
          }}>
            <span style={{ color: view === n.id ? GOLD : "#555045", fontSize: "1rem" }}>{n.sym}</span>
            {n.label}
            {n.id === "pagos" && pending > 0 && (
              <span style={{ marginLeft: "auto", background: "rgba(201,168,76,0.2)", color: GOLD, fontSize: "0.6rem", padding: "1px 7px", borderRadius: 10, fontWeight: 600 }}>{pending}</span>
            )}
          </button>
        ))}
      </nav>
      <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid #181818" }}>
        <div style={S.lbl}>Eventos activos</div>
        <div style={{ fontFamily: "'Jost',sans-serif", fontSize: "2.2rem", color: GOLD, lineHeight: 1, fontWeight: 300 }}>{active}</div>
        <div style={{ fontSize: "0.68rem", color: "#3A3530", marginTop: 2 }}>en pipeline</div>
        {syncing && <div style={{ fontSize: "0.6rem", color: "#555045", marginTop: 6 }}>● sincronizando...</div>}
      </div>
      {user && (
        <div style={{ padding: "0.875rem 1.25rem", borderTop: "1px solid #181818" }}>
          <div style={{ fontSize: "0.72rem", color: "#F0EAD8", fontWeight: 500, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.nombre}</div>
          <div style={{ fontSize: "0.62rem", color: "#3A3530", marginBottom: "0.625rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
          <button type="button" onClick={onLogout}
            style={{ width: "100%", padding: "0.35rem 0", background: "none", border: "1px solid #252525", borderRadius: 5, color: "#555045", fontSize: "0.7rem", cursor: "pointer", fontFamily: "inherit" }}>
            Cerrar sesión
          </button>
        </div>
      )}
    </aside>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ events, clients, payments, costs, setView, setDetailEvent }) {
  const tod        = todayStr();
  const mesActual  = tod.slice(0, 7); // "YYYY-MM"

  const active          = events.filter(e => e.stage !== "Post-venta").length;
  const clientesActivos = new Set(events.filter(e => e.stage !== "Post-venta").map(e => e.clientId)).size;

  const facturacionMes  = events
    .filter(e => (e.date || "").startsWith(mesActual) && ["Confirmación","Evento","Post-venta"].includes(e.stage))
    .reduce((s, e) => s + (e.amount || 0), 0);

  const pendienteMes    = payments
    .filter(p => (p.date || "").startsWith(mesActual) && p.status === "Pendiente")
    .reduce((s, p) => s + (p.amount || 0), 0);

  const upcoming   = events.filter(e => e.date >= tod && e.stage !== "Post-venta").sort((a,b) => a.date > b.date ? 1 : -1).slice(0, 5);

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.5rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>Dashboard</h1>
        <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>Vista general · Standard 69</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.875rem", marginBottom: "1.75rem" }}>
        {[
          { lbl: "Eventos activos",         val: active,                   sub: "en pipeline" },
          { lbl: "Facturación del mes",      val: fmtARS(facturacionMes),  sub: new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" }), gold: true },
          { lbl: "Pendiente de cobro",       val: fmtARS(pendienteMes),    sub: "vencimientos este mes", color: pendienteMes > 0 ? "#D39A59" : "#34D399" },
          { lbl: "Clientes activos",         val: clientesActivos,          sub: "con eventos vigentes" },
        ].map((s, i) => (
          <div key={i} style={S.card}>
            <div style={S.lbl}>{s.lbl}</div>
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.75rem", fontWeight: 300, color: s.color || (s.gold ? GOLD : "#F0EAD8"), lineHeight: 1.1 }}>{s.val}</div>
            <div style={{ fontSize: "0.68rem", color: "#4A4540", marginTop: 3 }}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "1.125rem" }}>
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.125rem" }}>
            <div style={{ fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6A6055" }}>Próximos Eventos</div>
            <button type="button" onClick={() => setView("pipeline")} style={{ background: "none", border: "none", color: GOLD, fontSize: "0.72rem", cursor: "pointer", fontFamily: "inherit" }}>Ver pipeline →</button>
          </div>
          {upcoming.length === 0 && <div style={{ color: "#4A4540", fontSize: "0.875rem" }}>Sin eventos próximos</div>}
          {upcoming.map(ev => (
            <div key={ev.id} onClick={() => setDetailEvent(ev)}
              style={{ display: "flex", alignItems: "center", gap: "0.875rem", padding: "0.625rem 0", borderBottom: "1px solid #181818", cursor: "pointer" }}>
              <div style={{ width: 36, height: 36, background: "#1A1A1A", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <div style={{ fontSize: "0.52rem", textTransform: "uppercase", color: "#555045", lineHeight: 1 }}>
                  {new Date(ev.date + "T00:00:00").toLocaleDateString("es-AR", { month: "short" })}
                </div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.1rem", color: GOLD, lineHeight: 1, fontWeight: 600 }}>
                  {new Date(ev.date + "T00:00:00").getDate()}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.875rem", color: "#F0EAD8", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                <div style={{ fontSize: "0.7rem", color: "#555045" }}>{ev.clientName} · {ev.guests} personas</div>
              </div>
              <StageBadge stage={ev.stage} />
            </div>
          ))}
        </div>
        <div style={S.card}>
          <div style={{ fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6A6055", marginBottom: "1.125rem" }}>Estado del Pipeline</div>
          {STAGES.map(s => {
            const evs = events.filter(e => e.stage === s);
            const tot = evs.reduce((sum, e) => sum + e.amount, 0);
            const c = sc(s);
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.625rem" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: c.fg, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: "0.8rem", color: evs.length > 0 ? "#B0A898" : "#383330" }}>{s}</div>
                <div style={{ fontSize: "0.75rem", fontWeight: 500, color: c.fg }}>{evs.length}</div>
                {tot > 0 && <div style={{ fontSize: "0.65rem", color: "#4A4540" }}>{fmtARS(tot)}</div>}
              </div>
            );
          })}
          <div style={{ marginTop: "0.875rem", paddingTop: "0.75rem", borderTop: "1px solid #181818" }}>
            <div style={{ ...S.lbl, marginBottom: "0.25rem" }}>Total pipeline</div>
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.2rem", color: GOLD, fontWeight: 300 }}>
              {fmtARS(events.filter(e => e.stage !== "Post-venta").reduce((s, e) => s + e.amount, 0))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────
function Pipeline({ events, onMove, onCard, onNew }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.5rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>Pipeline</h1>
          <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>{events.filter(e => e.stage !== "Post-venta").length} eventos activos</div>
        </div>
        <button type="button" onClick={onNew} style={S.btnP}>+ Nuevo evento</button>
      </div>
      <div style={{ overflowX: "auto", paddingBottom: "0.5rem" }}>
        <div style={{ display: "flex", gap: "0.875rem", minWidth: 1050 }}>
          {STAGES.map((stage, i) => {
            const stEvs = events.filter(e => e.stage === stage);
            const total = stEvs.reduce((s, e) => s + e.amount, 0);
            const c = sc(stage);
            return (
              <div key={stage} style={{ flex: "0 0 200px" }}>
                <div style={{ padding: "0.55rem 0.75rem", marginBottom: "0.625rem", borderRadius: 8, background: c.bg, border: `1px solid ${c.bd}` }}>
                  <div style={{ fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: c.fg, fontWeight: 600 }}>{stage}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 3 }}>
                    <span style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.4rem", color: "#EDE8DF", fontWeight: 300 }}>{stEvs.length}</span>
                    {total > 0 && <span style={{ fontSize: "0.62rem", color: "#555045" }}>{fmtARS(total)}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {stEvs.map(ev => <EventCard key={ev.id} ev={ev} stageIdx={i} onCard={onCard} onMove={onMove} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventCard({ ev, stageIdx, onCard, onMove }) {
  const c = sc(ev.stage);
  const nextC = STAGES[stageIdx + 1] ? sc(STAGES[stageIdx + 1]) : null;
  return (
    <div onClick={() => onCard(ev)}
      style={{ background: "#141414", border: "1px solid #1E1E1E", borderLeft: `3px solid ${c.fg}`, borderRadius: 8, padding: "0.8rem", cursor: "pointer" }}>
      <div style={{ fontSize: "0.825rem", fontWeight: 500, color: "#F0EAD8", marginBottom: 2, lineHeight: 1.3, wordBreak: "break-word" }}>{ev.title}</div>
      <div style={{ fontSize: "0.7rem", color: "#555045", marginBottom: "0.5rem" }}>{ev.clientName}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ev.amount > 0 ? "0.4rem" : 0 }}>
        <span style={{ fontSize: "0.65rem", color: "#6A6055" }}>{fmtD(ev.date)}</span>
        <span style={{ fontSize: "0.65rem", color: "#6A6055" }}>{ev.guests} pers.</span>
      </div>
      {ev.amount > 0 && <div style={{ fontSize: "0.72rem", color: GOLD, fontWeight: 500 }}>{fmtARS(ev.amount)}</div>}
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4, marginTop: "0.5rem" }}>
        {stageIdx > 0 && (
          <button type="button" onClick={() => onMove(ev, -1)}
            style={{ flex: 1, padding: "2px 0", background: "#1A1A1A", border: "1px solid #252525", borderRadius: 4, color: "#6A6055", cursor: "pointer", fontSize: "0.62rem", fontFamily: "inherit" }}>
            ← Atrás
          </button>
        )}
        {nextC && (
          <button type="button" onClick={() => onMove(ev, 1)}
            style={{ flex: 1, padding: "2px 0", background: nextC.bg, border: `1px solid ${nextC.bd}`, borderRadius: 4, color: nextC.fg, cursor: "pointer", fontSize: "0.62rem", fontFamily: "inherit" }}>
            Avanzar →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Clients ──────────────────────────────────────────────────────────────────
function Clients({ clients, events, onNew, onEdit }) {
  const [search, setSearch] = useState("");
  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.company || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.5rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>Clientes</h1>
          <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>{clients.length} contactos en base</div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." style={{ ...S.inp, width: 190 }} />
          <button type="button" onClick={onNew} style={S.btnP}>+ Nuevo cliente</button>
        </div>
      </div>
      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1A1A1A" }}>
              {["Nombre", "Empresa", "Tipo", "Canal", "Teléfono", "Email", "Eventos", "Revenue", ""].map(h => (
                <th key={h} style={{ padding: "0.7rem 1rem", textAlign: "left", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#454035", fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const cEvs = events.filter(e => e.clientId === c.id);
              const revenue = cEvs.filter(e => ["Confirmación","Evento","Post-venta"].includes(e.stage)).reduce((s, e) => s + e.amount, 0);
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid #161616" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#121212"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "0.875rem 1rem", fontSize: "0.875rem", color: "#F0EAD8", fontWeight: 500 }}>{c.name}</td>
                  <td style={{ padding: "0.875rem 1rem", fontSize: "0.8rem", color: "#7A7068" }}>{c.company || "—"}</td>
                  <td style={{ padding: "0.875rem 1rem" }}>
                    <span style={{ fontSize: "0.65rem", padding: "2px 9px", borderRadius: 12, background: c.type === "Corporativo" ? "rgba(96,165,250,0.1)" : "rgba(201,168,76,0.1)", color: c.type === "Corporativo" ? "#60A5FA" : GOLD }}>
                      {c.type}
                    </span>
                  </td>
                  <td style={{ padding: "0.875rem 1rem" }}>
                    {c.canal ? <span style={{ fontSize: "0.65rem", padding: "2px 9px", borderRadius: 12, background: "rgba(211,154,89,0.1)", color: GOLD }}>{c.canal}</span> : <span style={{ color: "#2E2A25" }}>—</span>}
                  </td>
                  <td style={{ padding: "0.875rem 1rem", fontSize: "0.8rem", color: "#7A7068" }}>{c.phone || "—"}</td>
                  <td style={{ padding: "0.875rem 1rem", fontSize: "0.8rem", color: "#7A7068" }}>{c.email || "—"}</td>
                  <td style={{ padding: "0.875rem 1rem", fontFamily: "'Cormorant Garamond',serif", fontSize: "1.3rem", color: cEvs.length > 0 ? GOLD : "#383330", fontWeight: 600 }}>{cEvs.length}</td>
                  <td style={{ padding: "0.875rem 1rem", fontSize: "0.8rem", color: revenue > 0 ? "#34D399" : "#383330" }}>{revenue > 0 ? fmtARS(revenue) : "—"}</td>
                  <td style={{ padding: "0.875rem 1rem" }}>
                    <button type="button" onClick={() => onEdit(c)} style={{ ...S.btnS, padding: "0.3rem 0.75rem", fontSize: "0.72rem" }}>Editar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: "2rem", textAlign: "center", color: "#4A4540", fontSize: "0.875rem" }}>Sin resultados</div>}
      </div>
    </div>
  );
}

// ─── Pagos ────────────────────────────────────────────────────────────────────
function Pagos({ events, payments, onAdd, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [filterEv, setFilterEv] = useState("all");
  const cobrado   = payments.filter(p => p.status === "Pagado").reduce((s, p) => s + p.amount, 0);
  const pendiente = payments.filter(p => p.status === "Pendiente").reduce((s, p) => s + p.amount, 0);
  const vencido   = payments.filter(p => p.status === "Vencido").reduce((s, p) => s + p.amount, 0);
  const filtered  = filterEv === "all" ? payments : payments.filter(p => p.eventId === parseInt(filterEv));
  const evProgress = events.filter(e => e.amount > 0).map(ev => {
    const paid = payments.filter(p => p.eventId === ev.id && p.status === "Pagado").reduce((s, p) => s + p.amount, 0);
    return { ...ev, paid };
  });
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.5rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>Pagos</h1>
          <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>{payments.length} registros</div>
        </div>
        <button type="button" onClick={() => setShowForm(true)} style={S.btnP}>+ Registrar pago</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.875rem", marginBottom: "1.75rem" }}>
        {[
          { lbl: "Total cobrado", val: fmtARS(cobrado),   color: "#34D399" },
          { lbl: "Pendiente",     val: fmtARS(pendiente), color: GOLD },
          { lbl: "Vencido",       val: fmtARS(vencido),   color: "#D05050" },
        ].map((s, i) => (
          <div key={i} style={S.card}>
            <div style={S.lbl}>{s.lbl}</div>
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.75rem", fontWeight: 300, color: s.color, lineHeight: 1.1 }}>{s.val}</div>
          </div>
        ))}
      </div>
      <div style={{ ...S.card, marginBottom: "1.5rem" }}>
        <div style={{ fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6A6055", marginBottom: "1rem" }}>Progreso de cobro por evento</div>
        {evProgress.length === 0 && <div style={{ color: "#4A4540", fontSize: "0.875rem" }}>Sin eventos con monto asignado</div>}
        {evProgress.map(ev => {
          const pct = Math.min(100, Math.round((ev.paid / ev.amount) * 100));
          return (
            <div key={ev.id} style={{ marginBottom: "0.875rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "0.8rem", color: "#F0EAD8" }}>{ev.title} <span style={{ color: "#555045" }}>· {ev.clientName}</span></span>
                <span style={{ fontSize: "0.75rem", color: GOLD }}>{fmtARS(ev.paid)} / {fmtARS(ev.amount)}</span>
              </div>
              <div style={{ background: "#1A1A1A", borderRadius: 4, height: 6 }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#34D399" : GOLD, borderRadius: 4 }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <select value={filterEv} onChange={e => setFilterEv(e.target.value)} style={{ ...S.inp, width: 240 }}>
          <option value="all">Todos los eventos</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
        </select>
      </div>
      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1A1A1A" }}>
              {["Evento / Cliente","Concepto","Monto","Método","Fecha","Estado",""].map(h => (
                <th key={h} style={{ padding: "0.7rem 1rem", textAlign: "left", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#454035", fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#4A4540", fontSize: "0.875rem" }}>Sin pagos registrados</td></tr>}
            {filtered.map(p => {
              const ev = events.find(e => e.id === p.eventId);
              const col = p.status === "Pagado" ? "#34D399" : p.status === "Vencido" ? "#D05050" : GOLD;
              return (
                <tr key={p.id} style={{ borderBottom: "1px solid #161616" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#121212"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "0.875rem 1rem" }}>
                    <div style={{ fontSize: "0.825rem", color: "#F0EAD8" }}>{ev?.title || "—"}</div>
                    <div style={{ fontSize: "0.7rem", color: "#555045" }}>{ev?.clientName || ""}</div>
                  </td>
                  <td style={{ padding: "0.875rem 1rem", fontSize: "0.8rem", color: "#B0A898" }}>{p.concept}</td>
                  <td style={{ padding: "0.875rem 1rem", fontSize: "0.875rem", color: GOLD, fontWeight: 500 }}>{fmtARS(p.amount)}</td>
                  <td style={{ padding: "0.875rem 1rem", fontSize: "0.8rem", color: "#7A7068" }}>{p.method}</td>
                  <td style={{ padding: "0.875rem 1rem", fontSize: "0.8rem", color: "#7A7068" }}>{fmtD(p.date)}</td>
                  <td style={{ padding: "0.875rem 1rem" }}>
                    <span style={{ fontSize: "0.65rem", padding: "2px 9px", borderRadius: 12, background: `${col}18`, color: col }}>{p.status}</span>
                  </td>
                  <td style={{ padding: "0.875rem 1rem" }}>
                    <button type="button" onClick={() => onDelete(p.id)} style={{ ...S.btnS, padding: "0.3rem 0.6rem", fontSize: "0.72rem", color: "#D05050", borderColor: "rgba(208,80,80,0.25)" }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showForm && <PaymentForm events={events} onSave={d => { onAdd(d); setShowForm(false); }} onClose={() => setShowForm(false)} />}
    </div>
  );
}

function PaymentForm({ events, onSave, onClose }) {
  const [f, setF] = useState({ eventId: "", concept: "Seña", amount: "", method: "Transferencia", date: todayStr(), status: "Pagado", notes: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const submit = () => {
    if (!f.eventId || !f.amount) { alert("Seleccioná un evento e ingresá el monto."); return; }
    onSave({ ...f, eventId: parseInt(f.eventId), amount: parseFloat(f.amount) });
  };
  return (
    <Modal title="Registrar pago" onClose={onClose}>
      <Field label="Evento *">
        <select value={f.eventId} onChange={e => set("eventId", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
          <option value="">Seleccionar evento...</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title} — {ev.clientName}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Concepto" half>
          <select value={f.concept} onChange={e => set("concept", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
            {PAYMENT_CONCEPTS.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Estado" half>
          <select value={f.status} onChange={e => set("status", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
            {["Pagado","Pendiente","Vencido"].map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Monto (ARS) *" half>
          <input type="number" value={f.amount} onChange={e => set("amount", e.target.value)} style={S.inp} placeholder="0" />
        </Field>
        <Field label="Fecha" half>
          <input type="date" value={f.date} onChange={e => set("date", e.target.value)} style={S.inp} />
        </Field>
      </div>
      <Field label="Método de pago">
        <select value={f.method} onChange={e => set("method", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
          {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
        </select>
      </Field>
      <Field label="Notas">
        <textarea value={f.notes} onChange={e => set("notes", e.target.value)} style={{ ...S.inp, minHeight: 55, resize: "vertical" }} placeholder="Observaciones..." />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem", marginTop: "0.5rem" }}>
        <button type="button" onClick={onClose} style={S.btnS}>Cancelar</button>
        <button type="button" onClick={submit} style={S.btnP}>Guardar pago</button>
      </div>
    </Modal>
  );
}

// ─── Post-venta ───────────────────────────────────────────────────────────────
function PostVenta({ events, postventas, onSave }) {
  const pvEvents = events.filter(e => e.stage === "Post-venta");
  const withRating = postventas.filter(p => p.rating > 0);
  const avg = withRating.length ? (withRating.reduce((s, p) => s + p.rating, 0) / withRating.length).toFixed(1) : "—";
  const refer = postventas.filter(p => p.wouldRefer === "Sí").length;
  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.5rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>Post-venta</h1>
        <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>{pvEvents.length} eventos completados</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.875rem", marginBottom: "1.75rem" }}>
        {[
          { lbl: "Eventos completados",   val: pvEvents.length, sub: "post-venta" },
          { lbl: "Satisfacción promedio", val: avg === "—" ? "—" : `${avg} / 5`, sub: "rating", gold: true },
          { lbl: "Recomendarían",         val: refer, sub: "clientes" },
        ].map((s, i) => (
          <div key={i} style={S.card}>
            <div style={S.lbl}>{s.lbl}</div>
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.75rem", fontWeight: 300, color: s.gold ? GOLD : "#F0EAD8", lineHeight: 1.1 }}>{s.val}</div>
            <div style={{ fontSize: "0.68rem", color: "#4A4540", marginTop: 3 }}>{s.sub}</div>
          </div>
        ))}
      </div>
      {pvEvents.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", color: "#4A4540", fontSize: "0.875rem", padding: "2.5rem" }}>
          Ningún evento en Post-venta aún. Avanzá eventos desde el Pipeline.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
        {pvEvents.map(ev => {
          const pv = postventas.find(p => p.eventId === ev.id) || {};
          const update = patch => onSave({ eventId: ev.id, rating: 0, wouldRefer: "Pendiente", testimonial: "", ...pv, ...patch });
          return (
            <div key={ev.id} style={S.card}>
              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "#F0EAD8" }}>{ev.title}</div>
                <div style={{ fontSize: "0.72rem", color: "#555045" }}>{ev.clientName} · {fmtD(ev.date)} · {ev.guests} pers.</div>
              </div>
              {ev.amount > 0 && <div style={{ fontSize: "0.8rem", color: GOLD, marginBottom: "0.875rem" }}>{fmtARS(ev.amount)}</div>}
              <div style={{ marginBottom: "0.75rem" }}>
                <div style={S.lbl}>Satisfacción del cliente</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1,2,3,4,5].map(star => (
                    <span key={star} onClick={() => update({ rating: star })}
                      style={{ fontSize: "1.4rem", cursor: "pointer", color: (pv.rating || 0) >= star ? GOLD : "#252520", userSelect: "none" }}>★</span>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ ...S.lbl, marginBottom: "0.5rem" }}>¿Recomendaría?</div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {["Sí","No","Pendiente"].map(opt => {
                    const active = (pv.wouldRefer || "Pendiente") === opt;
                    const col = opt === "Sí" ? "#34D399" : opt === "No" ? "#D05050" : "#8A8278";
                    return (
                      <button key={opt} type="button" onClick={() => update({ wouldRefer: opt })}
                        style={{ padding: "3px 12px", borderRadius: 12, fontSize: "0.68rem", cursor: "pointer", fontFamily: "inherit", border: `1px solid ${active ? col : "#252525"}`, background: active ? `${col}18` : "#1A1A1A", color: active ? col : "#555045" }}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div style={S.lbl}>Testimonio / notas</div>
                <textarea value={pv.testimonial || ""} onChange={e => update({ testimonial: e.target.value })}
                  style={{ ...S.inp, minHeight: 65, resize: "vertical", fontSize: "0.8rem" }} placeholder="Comentarios del cliente..." />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── P & L ────────────────────────────────────────────────────────────────────
const fmtMes = m => {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
};

function PyL({ events, payments, costs, onAddCost, onDeleteCost }) {
  const [showForm, setShowForm] = useState(false);
  const curMes = todayStr().slice(0, 7);
  const [period, setPeriod] = useState(curMes);
  const months = useMemo(() => [...new Set(events.map(e => e.date?.slice(0,7)).filter(Boolean))].sort().reverse(), [events]);
  const filteredEvIds = useMemo(() => {
    if (period === "all") return new Set(events.map(e => e.id));
    return new Set(events.filter(e => e.date?.slice(0,7) === period).map(e => e.id));
  }, [events, period]);
  const revenue    = events.filter(e => filteredEvIds.has(e.id) && ["Confirmación","Evento","Post-venta"].includes(e.stage)).reduce((s, e) => s + e.amount, 0);
  const collected  = payments.filter(p => filteredEvIds.has(p.eventId) && p.status === "Pagado").reduce((s, p) => s + p.amount, 0);
  const totalCosts = costs.filter(c => !c.eventId || filteredEvIds.has(c.eventId)).reduce((s, c) => s + c.amount, 0);
  const gross  = revenue - totalCosts;
  const margin = revenue > 0 ? ((gross / revenue) * 100).toFixed(1) : "—";
  const byCat = COST_CATS.map(cat => ({ cat, total: costs.filter(c => c.category === cat && (!c.eventId || filteredEvIds.has(c.eventId))).reduce((s, c) => s + c.amount, 0) })).filter(x => x.total > 0);
  const chartData = months.slice(0, 6).reverse().map(m => {
    const rev  = events.filter(e => e.date?.slice(0,7) === m && ["Confirmación","Evento","Post-venta"].includes(e.stage)).reduce((s, e) => s + e.amount, 0);
    const cost = costs.filter(c => c.date?.slice(0,7) === m).reduce((s, c) => s + c.amount, 0);
    return { m, rev, cost };
  });
  const maxVal = Math.max(...chartData.map(d => Math.max(d.rev, d.cost)), 1);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.5rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>P & L</h1>
          <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>Resultados · Standard 69</div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <select value={period} onChange={e => setPeriod(e.target.value)} style={{ ...S.inp, width: 190, textTransform: "capitalize" }}>
            <option value="all">Todo el período</option>
            {months.map(m => <option key={m} value={m}>{fmtMes(m)}</option>)}
          </select>
          <button type="button" onClick={() => setShowForm(true)} style={S.btnP}>+ Registrar costo</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.875rem", marginBottom: "1.75rem" }}>
        {[
          { lbl: "Revenue confirmado", val: fmtARS(revenue),    color: "#34D399" },
          { lbl: "Cobrado efectivo",   val: fmtARS(collected),  color: GOLD },
          { lbl: "Costos totales",     val: fmtARS(totalCosts), color: "#D05050" },
          { lbl: "Resultado neto",     val: fmtARS(gross), sub: margin !== "—" ? `Margen ${margin}%` : "", color: gross >= 0 ? "#34D399" : "#D05050" },
        ].map((s, i) => (
          <div key={i} style={S.card}>
            <div style={S.lbl}>{s.lbl}</div>
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.6rem", fontWeight: 300, color: s.color, lineHeight: 1.1 }}>{s.val}</div>
            {s.sub && <div style={{ fontSize: "0.68rem", color: "#4A4540", marginTop: 3 }}>{s.sub}</div>}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "1.125rem", marginBottom: "1.5rem" }}>
        <div style={S.card}>
          <div style={{ fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6A6055", marginBottom: "1.25rem" }}>Revenue vs Costos por mes</div>
          {chartData.length === 0 && <div style={{ color: "#4A4540", fontSize: "0.875rem" }}>Sin datos suficientes</div>}
          <div style={{ display: "flex", gap: "0.625rem", alignItems: "flex-end", height: 120 }}>
            {chartData.map(d => (
              <div key={d.m} style={{ flex: 1, display: "flex", gap: 3, alignItems: "flex-end", height: "100%" }}>
                <div title={`Revenue: ${fmtARS(d.rev)}`} style={{ flex: 1, height: `${Math.round((d.rev/maxVal)*100)}%`, minHeight: d.rev > 0 ? 4 : 0, background: "rgba(52,211,153,0.45)", borderRadius: "3px 3px 0 0" }} />
                <div title={`Costos: ${fmtARS(d.cost)}`} style={{ flex: 1, height: `${Math.round((d.cost/maxVal)*100)}%`, minHeight: d.cost > 0 ? 4 : 0, background: "rgba(208,80,80,0.45)", borderRadius: "3px 3px 0 0" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.625rem", marginTop: "0.5rem" }}>
            {chartData.map(d => <div key={d.m} style={{ flex: 1, textAlign: "center", fontSize: "0.58rem", color: "#454035", textTransform: "capitalize" }}>{new Date(d.m + "-01").toLocaleDateString("es-AR", { month: "short" })}</div>)}
          </div>
          <div style={{ display: "flex", gap: "1.25rem", marginTop: "0.75rem" }}>
            <span style={{ fontSize: "0.68rem", color: "#34D399" }}>■ Revenue</span>
            <span style={{ fontSize: "0.68rem", color: "#D05050" }}>■ Costos</span>
          </div>
        </div>
        <div style={S.card}>
          <div style={{ fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6A6055", marginBottom: "1.125rem" }}>Costos por categoría</div>
          {byCat.length === 0 && <div style={{ color: "#4A4540", fontSize: "0.875rem" }}>Sin costos registrados</div>}
          {byCat.map(({ cat, total }) => (
            <div key={cat} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.8rem", color: "#B0A898" }}>{cat}</span>
              <span style={{ fontSize: "0.8rem", color: "#D05050", fontWeight: 500 }}>{fmtARS(total)}</span>
            </div>
          ))}
          {byCat.length > 0 && (
            <div style={{ marginTop: "0.875rem", paddingTop: "0.75rem", borderTop: "1px solid #181818", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.75rem", color: "#555045" }}>Total</span>
              <span style={{ fontSize: "0.875rem", color: "#D05050", fontWeight: 600 }}>{fmtARS(totalCosts)}</span>
            </div>
          )}
        </div>
      </div>
      <div style={S.card}>
        <div style={{ fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6A6055", marginBottom: "1rem" }}>Detalle de costos</div>
        {costs.length === 0 && <div style={{ color: "#4A4540", fontSize: "0.875rem" }}>Sin costos registrados.</div>}
        {costs.map(c => {
          const ev = events.find(e => e.id === c.eventId);
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.6rem 0", borderBottom: "1px solid #181818" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.825rem", color: "#F0EAD8" }}>{c.notes || c.category}</div>
                <div style={{ fontSize: "0.7rem", color: "#555045" }}>{c.category}{ev ? ` · ${ev.title}` : " · General"} · {fmtD(c.date)}</div>
              </div>
              <div style={{ fontSize: "0.875rem", color: "#D05050", fontWeight: 500 }}>{fmtARS(c.amount)}</div>
              <button type="button" onClick={() => onDeleteCost(c.id)} style={{ ...S.btnS, padding: "0.25rem 0.6rem", fontSize: "0.72rem", color: "#D05050", borderColor: "rgba(208,80,80,0.25)" }}>×</button>
            </div>
          );
        })}
      </div>
      {showForm && <CostForm events={events} onSave={d => { onAddCost(d); setShowForm(false); }} onClose={() => setShowForm(false)} />}
    </div>
  );
}

function CostForm({ events, onSave, onClose }) {
  const [f, setF] = useState({ eventId: "", category: "Personal", amount: "", date: todayStr(), notes: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const submit = () => {
    if (!f.amount) { alert("Ingresá el monto."); return; }
    onSave({ ...f, eventId: f.eventId ? parseInt(f.eventId) : null, amount: parseFloat(f.amount) });
  };
  return (
    <Modal title="Registrar costo" onClose={onClose}>
      <Field label="Categoría">
        <select value={f.category} onChange={e => set("category", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
          {COST_CATS.map(c => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Evento asociado (opcional)">
        <select value={f.eventId} onChange={e => set("eventId", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
          <option value="">General / sin evento</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Monto (ARS) *" half>
          <input type="number" value={f.amount} onChange={e => set("amount", e.target.value)} style={S.inp} placeholder="0" />
        </Field>
        <Field label="Fecha" half>
          <input type="date" value={f.date} onChange={e => set("date", e.target.value)} style={S.inp} />
        </Field>
      </div>
      <Field label="Descripción">
        <input value={f.notes} onChange={e => set("notes", e.target.value)} style={S.inp} placeholder="Ej: 3 mozos evento, papelería..." />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem", marginTop: "0.5rem" }}>
        <button type="button" onClick={onClose} style={S.btnS}>Cancelar</button>
        <button type="button" onClick={submit} style={S.btnP}>Guardar costo</button>
      </div>
    </Modal>
  );
}

// ─── Event modals ─────────────────────────────────────────────────────────────
function EventDetail({ ev, onEdit, onMove, onDelete, onClose }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const idx = si(ev.stage);
  const nextStage = STAGES[idx + 1];
  return (
    <Modal title={ev.title} onClose={onClose} wide>
      <div style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap", marginBottom: "1.25rem", alignItems: "center" }}>
        <StageBadge stage={ev.stage} />
        <span style={{ color: "#2A2520" }}>·</span>
        <span style={{ fontSize: "0.78rem", color: "#6A6055" }}>{ev.type}</span>
        {ev.amount > 0 && <><span style={{ color: "#2A2520" }}>·</span><span style={{ fontSize: "0.78rem", color: GOLD, fontWeight: 500 }}>{fmtARS(ev.amount)}</span></>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
        {[
          { lbl: "Cliente",   val: ev.clientName },
          { lbl: "Fecha",     val: fmtDLong(ev.date) },
          { lbl: "Invitados", val: `${ev.guests} personas` },
          { lbl: "Monto",     val: ev.amount > 0 ? fmtARS(ev.amount) : "Por definir" },
        ].map(f => (
          <div key={f.lbl} style={{ background: "#1A1A1A", borderRadius: 8, padding: "0.7rem 0.875rem" }}>
            <div style={S.lbl}>{f.lbl}</div>
            <div style={{ fontSize: "0.875rem", color: "#F0EAD8" }}>{f.val}</div>
          </div>
        ))}
      </div>
      {ev.notes && (
        <div style={{ background: "#1A1A1A", borderRadius: 8, padding: "0.8rem 0.875rem", marginBottom: "1.25rem" }}>
          <div style={S.lbl}>Notas</div>
          <div style={{ fontSize: "0.875rem", color: "#B0A898", lineHeight: 1.55 }}>{ev.notes}</div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {STAGES.map((s, i) => {
          const c = sc(s); const active = s === ev.stage; const past = i < idx;
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {i > 0 && <div style={{ width: 14, height: 1, background: past || active ? c.fg : "#1E1E1E" }} />}
              <span style={{ fontSize: "0.62rem", padding: "3px 9px", borderRadius: 20, background: active ? c.bg : "#141414", border: `1px solid ${active ? c.bd : "#1E1E1E"}`, color: active ? c.fg : past ? "#4A4540" : "#252525", fontWeight: active ? 600 : 400 }}>
                {s}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        {idx > 0 && <button type="button" onClick={() => onMove(-1)} style={S.btnS}>← Mover atrás</button>}
        {nextStage && (
          <button type="button" onClick={() => onMove(1)} style={{ ...S.btnS, color: sc(nextStage).fg, borderColor: sc(nextStage).bd }}>
            Avanzar a {nextStage} →
          </button>
        )}
        <button type="button" onClick={onEdit} style={{ ...S.btnP, marginLeft: "auto" }}>✎ Editar</button>
        {!confirmDel
          ? <button type="button" onClick={() => setConfirmDel(true)} style={{ ...S.btnS, color: "#D05050", borderColor: "rgba(208,80,80,0.25)" }}>Eliminar</button>
          : <button type="button" onClick={onDelete} style={{ ...S.btnS, background: "rgba(208,80,80,0.1)", color: "#D05050", borderColor: "rgba(208,80,80,0.35)" }}>¿Confirmar?</button>
        }
      </div>
    </Modal>
  );
}

function EventForm({ ev, clients, onSave, onClose }) {
  const [f, setF] = useState(ev ? { ...ev } : { clientId: "", clientName: "", title: "", type: "Cumpleaños", date: "", guests: "", stage: "Consulta", amount: "", notes: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const pickClient = id => {
    const c = clients.find(c => c.id === parseInt(id));
    setF(p => ({ ...p, clientId: parseInt(id), clientName: c ? c.name : "" }));
  };
  const submit = () => {
    if (!f.title || !f.date || !f.clientId) { alert("Completá título, cliente y fecha."); return; }
    onSave({ ...f, guests: parseInt(f.guests) || 0, amount: parseFloat(f.amount) || 0, clientId: parseInt(f.clientId) });
  };
  return (
    <Modal title={ev ? "Editar evento" : "Nuevo evento"} onClose={onClose}>
      <Field label="Cliente *">
        <select value={f.clientId} onChange={e => pickClient(e.target.value)} style={{ ...S.inp, appearance: "none" }}>
          <option value="">Seleccionar cliente...</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</option>)}
        </select>
      </Field>
      <Field label="Nombre del evento *">
        <input value={f.title} onChange={e => set("title", e.target.value)} style={S.inp} placeholder="Ej: Cumpleaños 30, Cena anual..." />
      </Field>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Tipo" half>
          <select value={f.type} onChange={e => set("type", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
            {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Etapa" half>
          <select value={f.stage} onChange={e => set("stage", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
            {STAGES.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Fecha *" half>
          <input type="date" value={f.date} onChange={e => set("date", e.target.value)} style={S.inp} />
        </Field>
        <Field label="Invitados estimados" half>
          <input type="number" value={f.guests} onChange={e => set("guests", e.target.value)} style={S.inp} placeholder="0" min="1" />
        </Field>
      </div>
      <Field label="Monto estimado (ARS)">
        <input type="number" value={f.amount} onChange={e => set("amount", e.target.value)} style={S.inp} placeholder="0" />
      </Field>
      <Field label="Notas">
        <textarea value={f.notes} onChange={e => set("notes", e.target.value)} style={{ ...S.inp, minHeight: 75, resize: "vertical" }} placeholder="Requerimientos especiales..." />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem", marginTop: "0.5rem" }}>
        <button type="button" onClick={onClose} style={S.btnS}>Cancelar</button>
        <button type="button" onClick={submit} style={S.btnP}>Guardar evento</button>
      </div>
    </Modal>
  );
}

const CANALES = ["Campaña Meta Ads", "Instagram", "Ramiro", "Javier Rodriguez", "Otro referido", "Web", "Punto W", "LinkedIn"];

const MENU_TIPOS = [
  { nombre: "Finger food",         porPax: 10 },
  { nombre: "Finger food premium", porPax: 10 },
  { nombre: "Merienda / Desayuno", porPax: 3  },
  { nombre: "Menú por pasos",      porPax: 3  },
  { nombre: "Tapeo",               porPax: 3  },
];

const MENUS_ESTANDAR = {
  "Finger food": [
    "Pincho de Tortilla",
    "Taquitos de Cuadril",
    "Arepas de Pollo",
    "Provoletas Ahumadas",
    "Pincho de Pollo Marroquí",
    "Brochette de Vegetales",
    "Croquetas de Jamón Serrano",
    "Portobellos a la Parrilla",
  ],
  "Finger food premium": [
    "Pincho de Tortilla",
    "Pincho de Pulpo",
    "Taquitos de Cordero",
    "Arepas de Pollo",
    "Mollejas Laqueadas",
    "Mini Sandwich Ojo de Bife",
    "Brochette",
    "Croquetas",
    "Pancho de Masa Madre",
  ],
  "Merienda / Desayuno": [
    "Mini Sandwich del Día",
    "Mix de Cookies",
    "Budín de Limón",
    "Scon de Quesos",
    "Chipá con Queso Azul",
    "Frutas",
    "Pan de Chocolate",
    "Bakery Varios",
    "Torta Tres Leches",
  ],
  "Menú por pasos": [
    "Hummus de Pallares",
    "Calamares Rebozados",
    "Burrata con Peras Asadas",
    "Ojo de Bife",
    "Pacu Grillado",
    "Postre del Día",
  ],
  "Tapeo": [
    "Recepción Quesos y Fiambres",
    "Tortilla Española",
    "Taquitos de Cordero",
    "Arepas de Pollo",
    "Croquetas",
    "Provoleta Ahumada",
    "Pimientos Ahumados",
  ],
};
const ROLES_OP = ["Mozo/a", "Bartender", "Coordinador/a", "Cocinero/a", "Sommelier", "Seguridad", "Limpieza", "DJ / Animación", "Fotografía", "Otro"];
const parseOp = r => ({ ...r, id: toNum(r.id), eventId: toNum(r.eventId), orden: toNum(r.orden) || 0 });

function ClientForm({ client, onSave, onClose }) {
  const [f, setF] = useState(client ? { ...client } : { name: "", company: "", phone: "", email: "", type: "Privado", canal: "", notes: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const submit = () => {
    if (!f.name) { alert("Completá el nombre."); return; }
    onSave(f);
  };
  return (
    <Modal title={client ? "Editar cliente" : "Nuevo cliente"} onClose={onClose}>
      <Field label="Nombre completo *">
        <input value={f.name} onChange={e => set("name", e.target.value)} style={S.inp} placeholder="Nombre y apellido" />
      </Field>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Empresa" half>
          <input value={f.company} onChange={e => set("company", e.target.value)} style={S.inp} placeholder="Opcional" />
        </Field>
        <Field label="Tipo" half>
          <select value={f.type} onChange={e => set("type", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
            <option>Privado</option><option>Corporativo</option>
          </select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Teléfono" half>
          <input value={f.phone} onChange={e => set("phone", e.target.value)} style={S.inp} placeholder="351-555-0000" />
        </Field>
        <Field label="Email" half>
          <input type="email" value={f.email} onChange={e => set("email", e.target.value)} style={S.inp} placeholder="email@ejemplo.com" />
        </Field>
      </div>
      <Field label="Canal de captación">
        <select value={f.canal} onChange={e => set("canal", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
          <option value="">Sin especificar</option>
          {CANALES.map(c => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Notas">
        <textarea value={f.notes} onChange={e => set("notes", e.target.value)} style={{ ...S.inp, minHeight: 70, resize: "vertical" }} placeholder="Observaciones..." />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem", marginTop: "0.5rem" }}>
        <button type="button" onClick={onClose} style={S.btnS}>Cancelar</button>
        <button type="button" onClick={submit} style={S.btnP}>Guardar cliente</button>
      </div>
    </Modal>
  );
}

// ─── Operaciones PDF ──────────────────────────────────────────────────────────
function exportarPDF(ev, ops) {
  const personal    = ops.filter(o => o.tipo === "personal");
  const platos      = ops.filter(o => o.tipo === "plato");
  const ingredientes= ops.filter(o => o.tipo === "ingrediente");
  const timings     = ops.filter(o => o.tipo === "timing").sort((a,b) => a.orden - b.orden);
  const checkComida = ops.find(o => o.tipo === "check_comida") || {};
  const checkBebida = ops.find(o => o.tipo === "check_bebida") || {};
  const checkEquipo = ops.find(o => o.tipo === "check_equipo") || {};
  const pago        = ops.find(o => o.tipo === "op_pago") || {};
  const referidos   = ops.filter(o => o.tipo === "op_referido");
  const nota        = ops.find(o => o.tipo === "op_nota") || {};
  const venue       = (ev.notes || "").match(/Sede: ([^|]+)/)?.[1]?.trim() || "";
  const css = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#1a1a1a;padding:36px;font-size:13px}.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a1a1a;padding-bottom:18px;margin-bottom:28px}.logo{font-size:1.1rem;font-weight:500;letter-spacing:.28em;text-transform:uppercase}.logo-n{font-size:1.3rem;font-style:italic}.ev-t{font-size:1.1rem;font-weight:600;text-align:right}.ev-m{font-size:.8rem;color:#666;text-align:right;margin-top:4px}h2{font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:#999;border-bottom:1px solid #eee;padding-bottom:5px;margin:22px 0 10px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:5px 10px;background:#f5f5f5;font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;color:#777}td{padding:7px 10px;border-bottom:1px solid #f0f0f0}.cr{display:flex;align-items:center;gap:10px;padding:5px 0}.box{width:15px;height:15px;border:1.5px solid #ccc;border-radius:2px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px}.done{background:#1a1a1a;border-color:#1a1a1a;color:#fff}.tr{display:flex;gap:14px;padding:5px 0;border-bottom:1px solid #f5f5f5}.th{font-weight:600;min-width:60px;color:#d39a59}.nb{background:#f9f9f9;padding:12px;border-radius:4px;line-height:1.6;white-space:pre-wrap}@media print{body{padding:20px}}`;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ops · ${ev.title}</title><style>${css}</style></head><body>
<div class="hdr"><div><span class="logo">STANDARD </span><span class="logo-n">69</span></div><div><div class="ev-t">${ev.title}</div><div class="ev-m">${ev.date} · ${ev.guests} PAX${venue ? ' · '+venue : ''} · ${ev.clientName}</div></div></div>
${personal.length ? `<h2>Personal adicional</h2><table><tr><th>Nombre</th><th>Rol</th><th>Horario</th><th>Teléfono</th><th>Monto</th></tr>${personal.map(p=>`<tr><td>${p.campo1||''}</td><td>${p.campo2||''}</td><td>${p.campo3||''}</td><td>${p.campo4||''}</td><td>${p.campo5?'$'+Number(p.campo5).toLocaleString('es-AR'):''}</td></tr>`).join('')}</table>` : ''}
${platos.length ? `<h2>Menú y producción</h2><table><tr><th>Plato</th><th>Tipo</th><th>Porciones</th></tr>${platos.map(p=>`<tr><td>${p.campo1||''}</td><td>${p.campo2||''}</td><td>${p.campo3||''}</td></tr>`).join('')}</table>` : ''}
${ingredientes.length ? `<h2>Insumos</h2><table><tr><th>Ingrediente</th><th>Cantidad</th><th>Unidad</th><th>Estado</th></tr>${ingredientes.map(i=>`<tr><td>${i.campo1||''}</td><td>${i.campo2||''}</td><td>${i.campo3||''}</td><td>${i.campo4||'Pendiente'}</td></tr>`).join('')}</table>` : ''}
${timings.length ? `<h2>Timing</h2>${timings.map(t=>`<div class="tr"><span class="th">${t.campo1||''}</span><span>${t.campo2||''}</span></div>`).join('')}` : ''}
${[{l:'Check comida',d:checkComida},{l:'Check bebida',d:checkBebida},{l:'Check equipo',d:checkEquipo}].some(c=>c.d.campo1!==undefined) ? `<h2>Checklists</h2>${[{l:'Check comida',d:checkComida},{l:'Check bebida',d:checkBebida},{l:'Check equipo',d:checkEquipo}].map(c=>`<div class="cr"><div class="box ${c.d.campo2==='true'?'done':''}">${c.d.campo2==='true'?'✓':''}</div><div><strong>${c.l}</strong>${c.d.campo3?' · '+c.d.campo3:''}</div></div>`).join('')}` : ''}
${pago.campo1 ? `<h2>Pago post-evento</h2><p>Estado: <strong>${pago.campo1}</strong>${pago.campo2?' · $'+Number(pago.campo2).toLocaleString('es-AR'):''}${pago.campo3?' · '+pago.campo3:''}</p>` : ''}
${referidos.length ? `<h2>Referidos</h2><table><tr><th>Nombre</th><th>Contacto</th><th>Notas</th></tr>${referidos.map(r=>`<tr><td>${r.campo1||''}</td><td>${r.campo2||''}</td><td>${r.campo3||''}</td></tr>`).join('')}</table>` : ''}
${nota.campo1 ? `<h2>Notas operativas</h2><div class="nb">${nota.campo1}</div>` : ''}
</body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}

// ─── Operaciones List ─────────────────────────────────────────────────────────
function EventOpCard({ ev, ops, onClick }) {
  const personal  = ops.filter(o => o.tipo === "personal").length;
  const platos    = ops.filter(o => o.tipo === "plato").length;
  const checks    = ops.filter(o => ["check_comida","check_bebida","check_equipo"].includes(o.tipo));
  const done      = checks.filter(o => o.campo2 === "true").length;
  const venue     = (ev.notes||"").match(/Sede: ([^|]+)/)?.[1]?.trim() || "";
  return (
    <div onClick={onClick} style={{ ...S.card, cursor: "pointer" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = GOLD}
      onMouseLeave={e => e.currentTarget.style.borderColor = "#1C1C18"}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "#EDE8DF" }}>{ev.title}</div>
        <div style={{ fontSize: "0.65rem", color: GOLD }}>{fmtD(ev.date)}</div>
      </div>
      <div style={{ fontSize: "0.72rem", color: "#555045", marginBottom: "0.75rem" }}>{ev.clientName} · {ev.guests} PAX{venue ? ` · ${venue}` : ""}</div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {[
          { label: `${personal} personal`, on: personal > 0 },
          { label: `${platos} platos`, on: platos > 0 },
          { label: `${done}/3 checks`, on: done > 0 },
        ].map((t, i) => (
          <span key={i} style={{ fontSize: "0.6rem", padding: "2px 8px", borderRadius: 10, background: t.on ? "rgba(211,154,89,0.12)" : "rgba(255,255,255,0.04)", color: t.on ? GOLD : "#383330", letterSpacing: "0.05em" }}>{t.label}</span>
        ))}
      </div>
    </div>
  );
}

function OperacionesList({ events, operaciones, setOpEventId }) {
  const today = todayStr();
  const sorted = [...events].sort((a,b) => a.date > b.date ? 1 : -1);
  const upcoming = sorted.filter(e => e.date >= today);
  const past = sorted.filter(e => e.date < today).reverse().slice(0, 20);
  const sLabel = { fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "#454035", marginBottom: "0.875rem", display: "block" };
  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.5rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>Operaciones</h1>
        <div style={{ color: "#3A3530", fontSize: "0.72rem", marginTop: 4, letterSpacing: "0.05em" }}>Gestión operativa por evento</div>
      </div>
      {upcoming.length > 0 && <>
        <span style={sLabel}>Próximos</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "0.875rem", marginBottom: "1.75rem" }}>
          {upcoming.map(ev => <EventOpCard key={ev.id} ev={ev} ops={operaciones.filter(o => o.eventId === ev.id)} onClick={() => setOpEventId(ev.id)} />)}
        </div>
      </>}
      {past.length > 0 && <>
        <span style={sLabel}>Pasados</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "0.875rem" }}>
          {past.map(ev => <EventOpCard key={ev.id} ev={ev} ops={operaciones.filter(o => o.eventId === ev.id)} onClick={() => setOpEventId(ev.id)} />)}
        </div>
      </>}
    </div>
  );
}

// ─── Operaciones Detail ───────────────────────────────────────────────────────
function OperacionDetalle({ ev, ops, recetas, equipoBase, onAdd, onAddBulk, onUpdate, onDelete, onBack }) {
  const [tab, setTab] = useState("menu");
  const venue     = (ev.notes||"").match(/Sede: ([^|]+)/)?.[1]?.trim() || "";
  const personal  = ops.filter(o => o.tipo === "personal").sort((a,b) => a.orden - b.orden);
  const platos    = ops.filter(o => o.tipo === "plato").sort((a,b) => a.orden - b.orden);
  const ings      = ops.filter(o => o.tipo === "ingrediente");
  const timings   = ops.filter(o => o.tipo === "timing").sort((a,b) => a.orden - b.orden);
  const checkC    = ops.find(o => o.tipo === "check_comida");
  const checkB    = ops.find(o => o.tipo === "check_bebida");
  const checkE    = ops.find(o => o.tipo === "check_equipo");
  const pago      = ops.find(o => o.tipo === "op_pago");
  const referidos = ops.filter(o => o.tipo === "op_referido");
  const nota      = ops.find(o => o.tipo === "op_nota");
  const tabs = [{ id:"menu",label:"Menú"},{id:"personal",label:"Personal"},{id:"operacion",label:"Operación"},{id:"post",label:"Post-evento"}];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button type="button" onClick={onBack} style={{ ...S.btnS, padding: "0.35rem 0.75rem" }}>← Volver</button>
          <div>
            <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.25rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.14em", textTransform: "uppercase", margin: 0 }}>{ev.title}</h1>
            <div style={{ fontSize: "0.7rem", color: "#555045", marginTop: 3 }}>{fmtDLong(ev.date)} · {ev.guests} PAX{venue ? ` · ${venue}` : ""} · {ev.clientName}</div>
          </div>
        </div>
        <button type="button" onClick={() => exportarPDF(ev, ops)} style={S.btnP}>Exportar PDF</button>
      </div>
      <div style={{ display: "flex", borderBottom: "1px solid #1C1C18", marginBottom: "1.5rem" }}>
        {tabs.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            style={{ padding: "0.6rem 1.25rem", background: "none", border: "none", borderBottom: tab === t.id ? `2px solid ${GOLD}` : "2px solid transparent", color: tab === t.id ? GOLD : "#4A4540", cursor: "pointer", fontFamily: "inherit", fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "menu"      && <MenuTab      ev={ev} platos={platos} ings={ings} recetas={recetas} onAdd={onAdd} onAddBulk={onAddBulk} onUpdate={onUpdate} onDelete={onDelete} />}
      {tab === "personal"  && <PersonalTab  ev={ev} personal={personal} equipoBase={equipoBase} onAdd={onAdd} onDelete={onDelete} />}
      {tab === "operacion" && <OperacionTab ev={ev} timings={timings} checkC={checkC} checkB={checkB} checkE={checkE} nota={nota} onAdd={onAdd} onUpdate={onUpdate} onDelete={onDelete} />}
      {tab === "post"      && <PostTab      ev={ev} pago={pago} referidos={referidos} onAdd={onAdd} onUpdate={onUpdate} onDelete={onDelete} />}
    </div>
  );
}

function MenuTab({ ev, platos, ings, recetas, onAdd, onAddBulk, onUpdate, onDelete }) {
  const [show, setShow] = useState(false);
  const [menuTipo, setMenuTipo] = useState(MENU_TIPOS[0].nombre);
  const [busca, setBusca] = useState("");
  const [selec, setSelec] = useState("");
  const [porc, setPorc] = useState("");
  const cfg = MENU_TIPOS.find(m => m.nombre === menuTipo) || MENU_TIPOS[0];
  const totalPorc = Math.round(ev.guests * cfg.porPax);
  const defPorc = Math.round(totalPorc / (platos.length + 1));

  const recetasNombres = new Set(recetas.map(r => r.nombre.toLowerCase()));
  const platosEstandar = (MENUS_ESTANDAR[menuTipo] || [])
    .filter(n => !recetasNombres.has(n.toLowerCase()))
    .map(n => ({ nombre: n, ingredientes: [] }));
  const candidatos = [...recetas, ...platosEstandar];
  const filtered = busca
    ? candidatos.filter(r => r.nombre.toLowerCase().includes(busca.toLowerCase())).slice(0, 12)
    : candidatos.slice(0, 12);

  const agregarPlato = (nombre, tipo, porciones, ingsFn) => {
    onAdd({ eventId: ev.id, tipo: "plato", campo1: nombre, campo2: tipo, campo3: String(porciones), campo4: "", campo5: "", orden: platos.length + 1 });
    const receta = recetas.find(r => r.nombre.toLowerCase() === nombre.toLowerCase());
    if (receta?.ingredientes?.length) {
      receta.ingredientes.forEach(ing => {
        const total = (ing.cantidad * porciones).toFixed(3);
        const existe = ingsFn ? ingsFn.find(i => i.campo1 === ing.ingrediente) : ings.find(i => i.campo1 === ing.ingrediente);
        if (existe) onUpdate({ ...existe, campo2: String((parseFloat(existe.campo2) + parseFloat(total)).toFixed(3)) });
        else onAdd({ eventId: ev.id, tipo: "ingrediente", campo1: ing.ingrediente, campo2: total, campo3: ing.unidad, campo4: "Pendiente", campo5: "", orden: ings.length + 1 });
      });
    }
  };

  const agregar = () => {
    if (!selec) return;
    const p = parseInt(porc) || defPorc;
    agregarPlato(selec, menuTipo, p, ings);
    setShow(false); setBusca(""); setSelec(""); setPorc("");
  };

  const cargarEstandar = () => {
    const lista = MENUS_ESTANDAR[menuTipo] || [];
    const pPorPlato = parseInt(porc) || Math.round(totalPorc / lista.length);
    const nuevosPlatos = lista.map((nombre, idx) => ({
      eventId: ev.id, tipo: "plato", campo1: nombre, campo2: menuTipo,
      campo3: String(pPorPlato), campo4: "", campo5: "", orden: platos.length + 1 + idx,
    }));
    onAddBulk(nuevosPlatos);
    setShow(false); setPorc("");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <span style={{ ...S.lbl, margin: 0 }}>Menú y producción</span>
        <button type="button" onClick={() => setShow(!show)} style={S.btnP}>Propuesta</button>
      </div>
      {show && (
        <div style={{ ...S.card, marginBottom: "1rem", background: "#0D0D0B" }}>
          <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem" }}>
            <div style={{ flex: 1 }}>
              <label style={S.lbl}>Tipo de menú</label>
              <select value={menuTipo} onChange={e => { setMenuTipo(e.target.value); setPorc(""); setBusca(""); setSelec(""); }} style={{ ...S.inp, appearance: "none" }}>
                {MENU_TIPOS.map(m => <option key={m.nombre}>{m.nombre}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.lbl}>Porciones (default: {defPorc} = {totalPorc} total ÷ {platos.length + 1} platos)</label>
              <input type="number" value={porc} onChange={e => setPorc(e.target.value)} placeholder={String(defPorc)} style={S.inp} />
            </div>
          </div>
          {MENUS_ESTANDAR[menuTipo] && (
            <div style={{ marginBottom: "0.75rem", padding: "0.75rem", background: "rgba(211,154,89,0.05)", border: "1px solid rgba(211,154,89,0.15)", borderRadius: 5 }}>
              <div style={{ fontSize: "0.72rem", color: "#7A6A50", marginBottom: "0.5rem" }}>
                Menú estándar · {MENUS_ESTANDAR[menuTipo].length} platos: {MENUS_ESTANDAR[menuTipo].join(", ")}
              </div>
              <button type="button" onClick={cargarEstandar}
                style={{ ...S.btnS, fontSize: "0.72rem", color: GOLD, borderColor: "rgba(211,154,89,0.3)" }}>
                Cargar menú completo ({parseInt(porc) || Math.round(totalPorc / (MENUS_ESTANDAR[menuTipo]?.length || 1))} porciones c/u)
              </button>
            </div>
          )}
          <div style={{ marginBottom: "0.75rem" }}>
            <label style={S.lbl}>Plato{busca && !selec ? ` — filtrando por "${busca}"` : ""}</label>
            <input value={busca} onChange={e => { setBusca(e.target.value); setSelec(""); }} placeholder="Buscar o escribir nombre del plato..." style={S.inp} />
            {!selec && filtered.length > 0 && (
              <div style={{ background: "#181816", border: "1px solid #232320", borderRadius: 5, marginTop: 4, maxHeight: 200, overflowY: "auto" }}>
                {filtered.map((r, i) => (
                  <div key={i} onClick={() => { setSelec(r.nombre); setBusca(r.nombre); }}
                    style={{ padding: "0.5rem 0.75rem", cursor: "pointer", fontSize: "0.8rem", color: "#EDE8DF", background: "transparent",
                      borderBottom: i < filtered.length - 1 ? "1px solid #1A1A18" : "none" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(211,154,89,0.07)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {r.nombre}
                    {r.ingredientes?.length > 0 && <span style={{ fontSize: "0.65rem", color: "#3A3530", marginLeft: 6 }}>· {r.ingredientes.length} ing.</span>}
                  </div>
                ))}
              </div>
            )}
            {busca && !selec && filtered.length === 0 && (
              <div style={{ fontSize: "0.72rem", color: "#454035", marginTop: 6, padding: "0.5rem 0.75rem" }}>
                Sin resultados — se va a agregar como plato nuevo.
              </div>
            )}
          </div>
          {(selec || busca) && (
            <div style={{ fontSize: "0.75rem", color: GOLD, marginBottom: "0.75rem" }}>
              ✓ {selec || busca} · {parseInt(porc) || defPorc} porciones
            </div>
          )}
          <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => { setShow(false); setBusca(""); setSelec(""); }} style={S.btnS}>Cancelar</button>
            <button type="button" onClick={() => {
              const nombre = selec || busca.trim();
              if (!nombre) return;
              const p = parseInt(porc) || defPorc;
              agregarPlato(nombre, menuTipo, p, ings);
              setShow(false); setBusca(""); setSelec(""); setPorc("");
            }} disabled={!selec && !busca.trim()} style={{ ...S.btnP, opacity: (selec || busca.trim()) ? 1 : 0.4 }}>Agregar</button>
          </div>
        </div>
      )}
      {platos.length === 0 && !show && <div style={{ ...S.card, textAlign: "center", color: "#3A3530", fontSize: "0.8rem", padding: "2rem" }}>Sin platos. Seleccioná el menú y agregá los platos del evento.</div>}
      {platos.length > 0 && (
        <div style={{ ...S.card, padding: 0, overflow: "hidden", marginBottom: "1rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid #1C1C18" }}>{["Plato","Menú","Porciones",""].map(h => <th key={h} style={{ padding: "0.6rem 1rem", textAlign: "left", ...S.th, padding: "0.6rem 1rem" }}>{h}</th>)}</tr></thead>
            <tbody>{platos.map(p => (
              <tr key={p.id} style={{ borderBottom: "1px solid #141412" }}>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", color: "#EDE8DF" }}>{p.campo1}</td>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.72rem", color: "#6A6055" }}>{p.campo2}</td>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", color: GOLD }}>{p.campo3}</td>
                <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}><button type="button" onClick={() => onDelete(p.id)} style={{ ...S.btnS, padding: "0.2rem 0.5rem", fontSize: "0.7rem", color: "#D05050", borderColor: "rgba(208,80,80,0.2)" }}>×</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {ings.length > 0 && (
        <>
          <span style={{ ...S.lbl, display: "block", marginBottom: "0.75rem" }}>Lista de insumos</span>
          <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "1px solid #1C1C18" }}>{["Ingrediente","Cantidad","Unidad","Estado",""].map(h => <th key={h} style={{ padding: "0.6rem 1rem", textAlign: "left", ...S.th, padding: "0.6rem 1rem" }}>{h}</th>)}</tr></thead>
              <tbody>{ings.map(i => {
                const col = i.campo4 === "Entregado" ? "#7EB89A" : i.campo4 === "Comprado" ? GOLD : "#555045";
                return (
                  <tr key={i.id} style={{ borderBottom: "1px solid #141412" }}>
                    <td style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", color: "#EDE8DF" }}>{i.campo1}</td>
                    <td style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", color: "#EDE8DF" }}>{i.campo2}</td>
                    <td style={{ padding: "0.75rem 1rem", fontSize: "0.72rem", color: "#6A6055" }}>{i.campo3}</td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <select value={i.campo4 || "Pendiente"} onChange={e => onUpdate({ ...i, campo4: e.target.value })}
                        style={{ background: "transparent", border: "none", color: col, fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}>
                        {["Pendiente","Comprado","Entregado"].map(s => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}><button type="button" onClick={() => onDelete(i.id)} style={{ ...S.btnS, padding: "0.2rem 0.5rem", fontSize: "0.7rem", color: "#D05050", borderColor: "rgba(208,80,80,0.2)" }}>×</button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function PersonalTab({ ev, personal, equipoBase = [], onAdd, onDelete }) {
  const [show, setShow] = useState(false);
  const [selecId, setSelecId] = useState("");
  const [f, setF] = useState({ horario: "", monto: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const personaSelec = equipoBase.find(p => String(p.id) === selecId);

  const seleccionar = id => {
    setSelecId(id);
    const p = equipoBase.find(x => String(x.id) === id);
    if (p) setF({ horario: "", monto: p.tarifaEvento ? String(p.tarifaEvento) : "" });
    else setF({ horario: "", monto: "" });
  };

  const agregar = () => {
    if (!personaSelec) return;
    onAdd({ eventId: ev.id, tipo: "personal", campo1: personaSelec.nombre, campo2: personaSelec.rol, campo3: f.horario, campo4: personaSelec.telefono, campo5: f.monto, orden: personal.length + 1 });
    setSelecId(""); setF({ horario: "", monto: "" }); setShow(false);
  };

  const total = personal.reduce((s, p) => s + (parseFloat(p.campo5) || 0), 0);
  const yaAgregados = new Set(personal.map(p => p.campo1));
  const disponibles = equipoBase.filter(p => !yaAgregados.has(p.nombre));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <span style={{ ...S.lbl, margin: 0 }}>Personal · {personal.length} personas{total > 0 ? ` · ${fmtARS(total)}` : ""}</span>
        <button type="button" onClick={() => setShow(!show)} style={S.btnP}>+ Agregar</button>
      </div>
      {show && (
        <div style={{ ...S.card, marginBottom: "1rem", background: "#0D0D0B" }}>
          {equipoBase.length === 0 ? (
            <div style={{ fontSize: "0.8rem", color: "#555045", padding: "0.5rem 0" }}>
              No hay personal registrado. Primero cargá integrantes en el módulo Personal.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={S.lbl}>Seleccionar persona</label>
                <select value={selecId} onChange={e => seleccionar(e.target.value)} style={{ ...S.inp, appearance: "none" }}>
                  <option value="">— Elegí un integrante —</option>
                  {disponibles.map(p => (
                    <option key={p.id} value={String(p.id)}>{p.nombre} · {p.rol}</option>
                  ))}
                  {disponibles.length === 0 && <option disabled>Todos los disponibles ya fueron agregados</option>}
                </select>
              </div>
              {personaSelec && (
                <div style={{ background: "rgba(211,154,89,0.05)", border: "1px solid rgba(211,154,89,0.12)", borderRadius: 5, padding: "0.6rem 0.75rem", marginBottom: "0.75rem", fontSize: "0.78rem", color: "#8A7A6A" }}>
                  {personaSelec.rol}{personaSelec.telefono ? ` · ${personaSelec.telefono}` : ""}{personaSelec.disponible ? ` · ${personaSelec.disponible}` : ""}
                </div>
              )}
              <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={S.lbl}>Horario</label>
                  <input value={f.horario} onChange={e => set("horario", e.target.value)} style={S.inp} placeholder="18hs - 23hs" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={S.lbl}>Monto evento (ARS)</label>
                  <input type="number" value={f.monto} onChange={e => set("monto", e.target.value)} style={S.inp} placeholder="0" />
                </div>
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => { setShow(false); setSelecId(""); }} style={S.btnS}>Cancelar</button>
            <button type="button" onClick={agregar} disabled={!personaSelec} style={{ ...S.btnP, opacity: personaSelec ? 1 : 0.4 }}>Agregar</button>
          </div>
        </div>
      )}
      {personal.length === 0 && !show && <div style={{ ...S.card, textAlign: "center", color: "#3A3530", fontSize: "0.8rem", padding: "2rem" }}>Sin personal adicional cargado.</div>}
      {personal.length > 0 && (
        <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid #1C1C18" }}>{["Nombre","Rol","Horario","Teléfono","Monto",""].map(h => <th key={h} style={{ padding: "0.6rem 1rem", textAlign: "left", ...S.th, padding: "0.6rem 1rem" }}>{h}</th>)}</tr></thead>
            <tbody>{personal.map(p => (
              <tr key={p.id} style={{ borderBottom: "1px solid #141412" }}>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", color: "#EDE8DF", fontWeight: 500 }}>{p.campo1}</td>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.72rem", color: "#6A6055" }}>{p.campo2}</td>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.72rem", color: "#6A6055" }}>{p.campo3}</td>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.72rem", color: "#6A6055" }}>{p.campo4}</td>
                <td style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", color: GOLD }}>{p.campo5 ? fmtARS(parseFloat(p.campo5)) : "—"}</td>
                <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}><button type="button" onClick={() => onDelete(p.id)} style={{ ...S.btnS, padding: "0.2rem 0.5rem", fontSize: "0.7rem", color: "#D05050", borderColor: "rgba(208,80,80,0.2)" }}>×</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OperacionTab({ ev, timings, checkC, checkB, checkE, nota, onAdd, onUpdate, onDelete }) {
  const [newT, setNewT] = useState({ hora: "", desc: "" });
  const [notaText, setNotaText] = useState(nota?.campo1 || "");
  const toggleCheck = (data, tipo) => {
    const val = data?.campo2 === "true" ? "false" : "true";
    if (data) onUpdate({ ...data, campo2: val });
    else onAdd({ eventId: ev.id, tipo, campo1: tipo, campo2: val, campo3: "", campo4: "", campo5: "", orden: 0 });
  };
  const updateNota = (data, tipo, txt) => {
    if (data) onUpdate({ ...data, campo3: txt });
    else onAdd({ eventId: ev.id, tipo, campo1: tipo, campo2: "false", campo3: txt, campo4: "", campo5: "", orden: 0 });
  };
  const addTiming = () => {
    if (!newT.hora || !newT.desc) return;
    onAdd({ eventId: ev.id, tipo: "timing", campo1: newT.hora, campo2: newT.desc, campo3: "", campo4: "", campo5: "", orden: timings.length + 1 });
    setNewT({ hora: "", desc: "" });
  };
  const saveNota = () => {
    if (nota) onUpdate({ ...nota, campo1: notaText });
    else onAdd({ eventId: ev.id, tipo: "op_nota", campo1: notaText, campo2: "", campo3: "", campo4: "", campo5: "", orden: 0 });
  };
  const checks = [{ tipo: "check_comida", label: "Check comida", data: checkC }, { tipo: "check_bebida", label: "Check bebida", data: checkB }, { tipo: "check_equipo", label: "Check equipo", data: checkE }];
  return (
    <div>
      <div style={{ ...S.card, marginBottom: "1rem" }}>
        <span style={{ ...S.lbl, display: "block", marginBottom: "1rem" }}>Checklists operativos</span>
        {checks.map((c, i) => (
          <div key={c.tipo} style={{ marginBottom: i < checks.length - 1 ? "1rem" : 0, paddingBottom: i < checks.length - 1 ? "1rem" : 0, borderBottom: i < checks.length - 1 ? "1px solid #1C1C18" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <button type="button" onClick={() => toggleCheck(c.data, c.tipo)}
                style={{ width: 22, height: 22, border: `2px solid ${c.data?.campo2 === "true" ? GOLD : "#2E2A25"}`, borderRadius: 4, background: c.data?.campo2 === "true" ? GOLD : "transparent", cursor: "pointer", color: "#080808", fontWeight: 700, fontSize: "0.75rem", flexShrink: 0 }}>
                {c.data?.campo2 === "true" ? "✓" : ""}
              </button>
              <span style={{ fontSize: "0.875rem", fontWeight: 500, color: c.data?.campo2 === "true" ? "#EDE8DF" : "#5A5450" }}>{c.label}</span>
            </div>
            <input value={c.data?.campo3 || ""} onChange={e => updateNota(c.data, c.tipo, e.target.value)}
              placeholder="Notas..." style={{ ...S.inp, fontSize: "0.8rem" }} />
          </div>
        ))}
      </div>
      <div style={{ ...S.card, marginBottom: "1rem" }}>
        <span style={{ ...S.lbl, display: "block", marginBottom: "1rem" }}>Timing del evento</span>
        {timings.map(t => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem 0", borderBottom: "1px solid #141412" }}>
            <span style={{ fontSize: "0.875rem", color: GOLD, fontWeight: 500, minWidth: 65 }}>{t.campo1}</span>
            <span style={{ fontSize: "0.875rem", color: "#EDE8DF", flex: 1 }}>{t.campo2}</span>
            <button type="button" onClick={() => onDelete(t.id)} style={{ ...S.btnS, padding: "0.2rem 0.5rem", fontSize: "0.7rem", color: "#D05050", borderColor: "rgba(208,80,80,0.2)" }}>×</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
          <input value={newT.hora} onChange={e => setNewT(p => ({ ...p, hora: e.target.value }))} placeholder="19:00hs" style={{ ...S.inp, width: 90 }} />
          <input value={newT.desc} onChange={e => setNewT(p => ({ ...p, desc: e.target.value }))} placeholder="Descripción..." style={{ ...S.inp, flex: 1 }} />
          <button type="button" onClick={addTiming} style={S.btnP}>+</button>
        </div>
      </div>
      <div style={S.card}>
        <span style={{ ...S.lbl, display: "block", marginBottom: "0.75rem" }}>Notas operativas</span>
        <textarea value={notaText} onChange={e => setNotaText(e.target.value)}
          style={{ ...S.inp, minHeight: 100, resize: "vertical" }}
          placeholder="Briefing del evento, requerimientos especiales, observaciones del equipo..." />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem" }}>
          <button type="button" onClick={saveNota} style={S.btnP}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

function PostTab({ ev, pago, referidos, onAdd, onUpdate, onDelete }) {
  const [estado, setEstado] = useState(pago?.campo1 || "Pendiente");
  const [monto, setMonto]   = useState(pago?.campo2 || "");
  const [metodo, setMetodo] = useState(pago?.campo3 || "Transferencia");
  const [showRef, setShowRef] = useState(false);
  const [ref, setRef] = useState({ nombre: "", contacto: "", notas: "" });
  const savePago = () => {
    if (pago) onUpdate({ ...pago, campo1: estado, campo2: monto, campo3: metodo });
    else onAdd({ eventId: ev.id, tipo: "op_pago", campo1: estado, campo2: monto, campo3: metodo, campo4: "", campo5: "", orden: 0 });
  };
  const addRef = () => {
    if (!ref.nombre) return;
    onAdd({ eventId: ev.id, tipo: "op_referido", campo1: ref.nombre, campo2: ref.contacto, campo3: ref.notas, campo4: "", campo5: "", orden: referidos.length + 1 });
    setRef({ nombre: "", contacto: "", notas: "" });
    setShowRef(false);
  };
  return (
    <div>
      <div style={{ ...S.card, marginBottom: "1rem" }}>
        <span style={{ ...S.lbl, display: "block", marginBottom: "1rem" }}>Pago post-evento</span>
        <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem" }}>
          <div style={{ flex: 1 }}><label style={S.lbl}>Estado</label>
            <select value={estado} onChange={e => setEstado(e.target.value)} style={{ ...S.inp, appearance: "none" }}>
              {["Pendiente","Cobrado","Cobrado parcial"].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}><label style={S.lbl}>Monto (ARS)</label><input type="number" value={monto} onChange={e => setMonto(e.target.value)} style={S.inp} placeholder="0" /></div>
          <div style={{ flex: 1 }}><label style={S.lbl}>Método</label>
            <select value={metodo} onChange={e => setMetodo(e.target.value)} style={{ ...S.inp, appearance: "none" }}>
              {["Transferencia","Efectivo","Cheque","Echeq"].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={savePago} style={S.btnP}>Guardar</button>
        </div>
      </div>
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <span style={{ ...S.lbl, margin: 0 }}>Referidos del evento</span>
          <button type="button" onClick={() => setShowRef(!showRef)} style={S.btnP}>+ Agregar</button>
        </div>
        {showRef && (
          <div style={{ background: "#0D0D0B", borderRadius: 6, padding: "1rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem" }}>
              <div style={{ flex: 1 }}><label style={S.lbl}>Nombre *</label><input value={ref.nombre} onChange={e => setRef(p => ({ ...p, nombre: e.target.value }))} style={S.inp} placeholder="Nombre del referido" /></div>
              <div style={{ flex: 1 }}><label style={S.lbl}>Contacto</label><input value={ref.contacto} onChange={e => setRef(p => ({ ...p, contacto: e.target.value }))} style={S.inp} placeholder="Tel o email" /></div>
            </div>
            <div style={{ marginBottom: "0.75rem" }}><label style={S.lbl}>Notas</label><input value={ref.notas} onChange={e => setRef(p => ({ ...p, notas: e.target.value }))} style={S.inp} placeholder="Contexto..." /></div>
            <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowRef(false)} style={S.btnS}>Cancelar</button>
              <button type="button" onClick={addRef} style={S.btnP}>Agregar</button>
            </div>
          </div>
        )}
        {referidos.length === 0 && !showRef && <div style={{ textAlign: "center", color: "#3A3530", fontSize: "0.8rem", padding: "1rem" }}>Sin referidos registrados.</div>}
        {referidos.map(r => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.625rem 0", borderBottom: "1px solid #141412" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.85rem", color: "#EDE8DF", fontWeight: 500 }}>{r.campo1}</div>
              {r.campo2 && <div style={{ fontSize: "0.72rem", color: "#555045" }}>{r.campo2}</div>}
              {r.campo3 && <div style={{ fontSize: "0.7rem", color: "#3A3530", marginTop: 2 }}>{r.campo3}</div>}
            </div>
            <button type="button" onClick={() => onDelete(r.id)} style={{ ...S.btnS, padding: "0.2rem 0.5rem", fontSize: "0.7rem", color: "#D05050", borderColor: "rgba(208,80,80,0.2)" }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Personal Module ──────────────────────────────────────────────────────────
const DISPONIBILIDAD = ["Disponible", "No disponible", "A confirmar"];

function PersonalForm({ person, onSave, onClose }) {
  const blank = { nombre: "", rol: ROLES_OP[0], telefono: "", email: "", tarifaEvento: "", disponible: "Disponible", notas: "" };
  const [f, setF] = useState(person ? { ...person } : blank);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Modal title={person ? "Editar persona" : "Nuevo integrante"} onClose={onClose}>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Nombre completo *" half>
          <input value={f.nombre} onChange={e => set("nombre", e.target.value)} style={S.inp} placeholder="Nombre y apellido" autoFocus />
        </Field>
        <Field label="Rol" half>
          <select value={f.rol} onChange={e => set("rol", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
            {ROLES_OP.map(r => <option key={r}>{r}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Teléfono" half>
          <input value={f.telefono} onChange={e => set("telefono", e.target.value)} style={S.inp} placeholder="351-555-0000" />
        </Field>
        <Field label="Email" half>
          <input type="email" value={f.email} onChange={e => set("email", e.target.value)} style={S.inp} placeholder="email@ejemplo.com" />
        </Field>
      </div>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Tarifa por evento (ARS)" half>
          <input type="number" value={f.tarifaEvento} onChange={e => set("tarifaEvento", e.target.value)} style={S.inp} placeholder="0" />
        </Field>
        <Field label="Disponibilidad" half>
          <select value={f.disponible} onChange={e => set("disponible", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
            {DISPONIBILIDAD.map(d => <option key={d}>{d}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notas">
        <textarea value={f.notas} onChange={e => set("notas", e.target.value)} style={{ ...S.inp, minHeight: 70, resize: "vertical" }} placeholder="Especialidades, restricciones, referencias..." />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem", marginTop: "0.5rem" }}>
        <button type="button" onClick={onClose} style={S.btnS}>Cancelar</button>
        <button type="button" onClick={() => { if (!f.nombre) return; onSave(f); }} style={S.btnP}>Guardar</button>
      </div>
    </Modal>
  );
}

function PersonalModule({ personal, onAdd, onUpdate, onDelete }) {
  const [modal, setModal] = useState(null);
  const [busca, setBusca] = useState("");
  const [rolFiltro, setRolFiltro] = useState("");

  const DISP_COLOR = { "Disponible": "#7EB89A", "No disponible": "#D05050", "A confirmar": GOLD };

  const lista = personal.filter(p => {
    const q = busca.toLowerCase();
    const matchQ = !q || p.nombre.toLowerCase().includes(q) || p.rol.toLowerCase().includes(q);
    const matchR = !rolFiltro || p.rol === rolFiltro;
    return matchQ && matchR;
  });

  const roles = [...new Set(personal.map(p => p.rol))].sort();
  const totalTarifa = personal.reduce((s, p) => s + (Number(p.tarifaEvento) || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.5rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>Personal</h1>
          <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>{personal.length} integrantes registrados</div>
        </div>
        <button type="button" onClick={() => setModal("new")} style={S.btnP}>+ Nuevo integrante</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.875rem", marginBottom: "1.75rem" }}>
        {[
          { lbl: "Total en equipo",  val: personal.length,                      sub: "integrantes" },
          { lbl: "Disponibles",      val: personal.filter(p => p.disponible === "Disponible").length, sub: "ahora mismo" },
          { lbl: "Tarifa total",     val: fmtARS(totalTarifa),                  sub: "suma de tarifas", gold: true },
        ].map(({ lbl, val, sub, gold }) => (
          <div key={lbl} style={S.card}>
            <div style={{ ...S.lbl }}>{lbl}</div>
            <div style={{ fontSize: "1.75rem", fontWeight: 300, color: gold ? GOLD : "#EDE8DF", lineHeight: 1.1 }}>{val}</div>
            <div style={{ fontSize: "0.68rem", color: "#3A3530", marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nombre o rol..." style={{ ...S.inp, maxWidth: 300 }} />
        <select value={rolFiltro} onChange={e => setRolFiltro(e.target.value)} style={{ ...S.inp, width: "auto", appearance: "none", minWidth: 160 }}>
          <option value="">Todos los roles</option>
          {roles.map(r => <option key={r}>{r}</option>)}
        </select>
      </div>

      {lista.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", color: "#3A3530", fontSize: "0.85rem", padding: "3rem" }}>
          {personal.length === 0 ? "Aún no hay personal registrado. Agregá el primer integrante." : "Sin resultados para la búsqueda."}
        </div>
      ) : (
        <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1C1C18" }}>
                {["Nombre", "Rol", "Teléfono", "Tarifa evento", "Disponibilidad", ""].map(h => (
                  <th key={h} style={{ ...S.th, padding: "0.65rem 1rem" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map(p => {
                const dc = DISP_COLOR[p.disponible] || "#555045";
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid #141412" }}>
                    <td style={{ padding: "0.85rem 1rem" }}>
                      <div style={{ fontSize: "0.875rem", color: "#EDE8DF", fontWeight: 500 }}>{p.nombre}</div>
                      {p.email && <div style={{ fontSize: "0.68rem", color: "#454035", marginTop: 2 }}>{p.email}</div>}
                    </td>
                    <td style={{ padding: "0.85rem 1rem", fontSize: "0.78rem", color: "#8A7A6A" }}>{p.rol}</td>
                    <td style={{ padding: "0.85rem 1rem", fontSize: "0.8rem", color: "#6A6055" }}>{p.telefono || "—"}</td>
                    <td style={{ padding: "0.85rem 1rem", fontSize: "0.875rem", color: p.tarifaEvento ? GOLD : "#3A3530" }}>
                      {p.tarifaEvento ? fmtARS(p.tarifaEvento) : "—"}
                    </td>
                    <td style={{ padding: "0.85rem 1rem" }}>
                      <span style={{ fontSize: "0.72rem", color: dc, background: `${dc}18`, border: `1px solid ${dc}30`, padding: "2px 10px", borderRadius: 20 }}>
                        {p.disponible}
                      </span>
                    </td>
                    <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                        <button type="button" onClick={() => setModal(p)} style={{ ...S.btnS, padding: "0.2rem 0.6rem", fontSize: "0.7rem" }}>Editar</button>
                        <button type="button" onClick={() => { if (confirm(`¿Eliminar a ${p.nombre}?`)) onDelete(p.id); }}
                          style={{ ...S.btnS, padding: "0.2rem 0.5rem", fontSize: "0.7rem", color: "#D05050", borderColor: "rgba(208,80,80,0.2)" }}>×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <PersonalForm
          person={modal === "new" ? null : modal}
          onSave={data => { modal === "new" ? onAdd(data) : onUpdate({ ...modal, ...data }); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("dashboard");
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [opEventId, setOpEventId] = useState(null);

  const [clients,      setClients]      = useState([]);
  const [events,       setEvents]       = useState([]);
  const [payments,     setPayments]     = useState([]);
  const [costs,        setCosts]        = useState([]);
  const [postventas,   setPostventas]   = useState([]);
  const [operaciones,  setOperaciones]  = useState([]);
  const [personalDB,   setPersonalDB]   = useState([]);
  const [recetas,      setRecetas]      = useState([]);

  const [eventModal,  setEventModal]  = useState(null);
  const [clientModal, setClientModal] = useState(null);
  const [detailEvent, setDetailEvent] = useState(null);

  const loadData = useCallback(() => {
    setLoading(true);
    sheetsGet()
      .then(data => {
        if (data.clientes?.length)    setClients(data.clientes.map(parseClient));
        if (data.eventos?.length)     setEvents(data.eventos.map(parseEvent));
        if (data.pagos?.length)       setPayments(data.pagos.map(parsePayment));
        if (data.costos?.length)      setCosts(data.costos.map(parseCost));
        if (data.postventas?.length)  setPostventas(data.postventas.map(parsePostventa));
        if (data.operaciones?.length) setOperaciones(data.operaciones.map(parseOp));
        if (data.personal?.length)    setPersonalDB(data.personal.map(parsePersonal));
        setLoading(false);
      })
      .catch(err => { setLoadError(err.message); setLoading(false); });
    sheetsPost({ action: "getRecetas" }).then(d => { if (d) setRecetas(d); }).catch(() => {});
  }, []);

  // Check existing session on mount
  useEffect(() => {
    const token = localStorage.getItem("s69_token");
    if (!token) { setAuthChecked(true); return; }
    sheetsPost({ action: "validateSession", data: { token } })
      .then(u => { setUser({ ...u, token }); setAuthChecked(true); loadData(); })
      .catch(() => { localStorage.removeItem("s69_token"); setAuthChecked(true); });
  }, []);

  const handleLogin = async (email, password) => {
    const u = await sheetsPost({ action: "login", data: { email, password } });
    localStorage.setItem("s69_token", u.token);
    setUser(u);
    loadData();
  };

  const handleLogout = () => {
    const token = localStorage.getItem("s69_token");
    sheetsPost({ action: "logout", data: { token } }).catch(() => {});
    localStorage.removeItem("s69_token");
    setUser(null);
    setClients([]); setEvents([]); setPayments([]); setCosts([]); setPostventas([]);
  };

  const sync = (action, sheet, data, id) => {
    setSyncing(true);
    sheetsPost({ action, sheet, data, id }).finally(() => setSyncing(false));
  };

  const addEvent = ev => {
    const n = { ...ev, id: nextId(events) };
    setEvents(p => [...p, n]);
    sync("add", "Eventos", n);
  };
  const updateEvent = ev => {
    setEvents(p => p.map(e => e.id === ev.id ? ev : e));
    sync("update", "Eventos", ev);
  };
  const deleteEvent = id => {
    setEvents(p => p.filter(e => e.id !== id));
    setDetailEvent(null);
    sync("delete", "Eventos", null, id);
  };
  const moveStage = (ev, dir) => {
    const next = STAGES[si(ev.stage) + dir];
    if (next) updateEvent({ ...ev, stage: next });
  };
  const addClient = cl => {
    const n = { ...cl, id: nextId(clients) };
    setClients(p => [...p, n]);
    sync("add", "Clientes", n);
  };
  const updateClient = cl => {
    setClients(p => p.map(c => c.id === cl.id ? cl : c));
    sync("update", "Clientes", cl);
  };
  const addOp    = op => { const n = { ...op, id: nextId(operaciones) }; setOperaciones(p => [...p, n]); sync("add", "Operaciones", n); };
  const updateOp = op => { setOperaciones(p => p.map(o => o.id === op.id ? op : o)); sync("update", "Operaciones", op); };
  const deleteOp = id => { setOperaciones(p => p.filter(o => o.id !== id)); sync("delete", "Operaciones", null, id); };
  const addBulkOps = ops => {
    const base = operaciones.length ? Math.max(...operaciones.map(x => Number(x.id) || 0)) : 0;
    const news = ops.map((op, i) => ({ ...op, id: base + 1 + i }));
    setOperaciones(p => [...p, ...news]);
    news.forEach(op => sync("add", "Operaciones", op));
  };

  const addPayment = p => {
    const n = { ...p, id: nextId(payments) };
    setPayments(prev => [...prev, n]);
    sync("add", "Pagos", n);
  };
  const deletePayment = id => {
    setPayments(p => p.filter(x => x.id !== id));
    sync("delete", "Pagos", null, id);
  };
  const addCost = c => {
    const n = { ...c, id: nextId(costs) };
    setCosts(prev => [...prev, n]);
    sync("add", "Costos", n);
  };
  const deleteCost = id => {
    setCosts(p => p.filter(x => x.id !== id));
    sync("delete", "Costos", null, id);
  };
  const savePostventa = pv => {
    setPostventas(prev => {
      const exists = prev.find(p => p.eventId === pv.eventId);
      return exists ? prev.map(p => p.eventId === pv.eventId ? pv : p) : [...prev, pv];
    });
    sync("upsert", "Postventas", pv);
  };
  const addPersonal    = p => { const n = parsePersonal({ ...p, id: nextId(personalDB) }); setPersonalDB(prev => [...prev, n]); sync("add", "Personal", n); };
  const updatePersonal = p => { const n = parsePersonal(p); setPersonalDB(prev => prev.map(x => x.id === n.id ? n : x)); sync("update", "Personal", n); };
  const deletePersonal = id => { setPersonalDB(prev => prev.filter(x => x.id !== id)); sync("delete", "Personal", null, id); };

  if (!authChecked) return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#080808" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.1rem", fontWeight: 500, color: "#EDE8DF", letterSpacing: "0.28em", textTransform: "uppercase" }}>STANDARD</span>
        <span style={{ fontFamily: "'Satisfy',cursive", fontSize: "1.35rem", color: GOLD }}>69</span>
      </div>
    </div>
  );

  if (!user) return <AuthScreen onLogin={handleLogin} />;

  if (loading) return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#080808", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.1rem", fontWeight: 500, color: "#EDE8DF", letterSpacing: "0.28em", textTransform: "uppercase" }}>STANDARD</span>
        <span style={{ fontFamily: "'Satisfy',cursive", fontSize: "1.35rem", color: GOLD }}>69</span>
      </div>
      <div style={{ fontSize: "0.6rem", color: "#3A3530", letterSpacing: "0.15em", textTransform: "uppercase" }}>Cargando datos</div>
    </div>
  );

  if (loadError) return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#0A0A0A", flexDirection: "column", gap: "1rem", padding: "2rem" }}>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2rem", color: "#D05050" }}>Error de conexión</div>
      <div style={{ fontSize: "0.8rem", color: "#555045", maxWidth: 420, textAlign: "center" }}>No se pudo conectar a Google Sheets.</div>
      <div style={{ fontSize: "0.72rem", color: "#3A3530", fontFamily: "monospace" }}>{loadError}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", background: "#080808", fontFamily: "'Jost',sans-serif", color: "#EDE8DF" }}>
      <Sidebar view={view} setView={setView} events={events} payments={payments} syncing={syncing} user={user} onLogout={handleLogout} />
      <main style={{ flex: 1, overflowY: "auto", padding: "2rem", minWidth: 0 }}>
        {view === "dashboard" && <Dashboard events={events} clients={clients} payments={payments} costs={costs} setView={setView} setDetailEvent={setDetailEvent} />}
        {view === "pipeline"  && <Pipeline  events={events} onMove={moveStage} onCard={setDetailEvent} onNew={() => setEventModal("new")} />}
        {view === "clients"   && <Clients   clients={clients} events={events} onNew={() => setClientModal("new")} onEdit={setClientModal} />}
        {view === "operaciones" && (opEventId
          ? <OperacionDetalle ev={events.find(e => e.id === opEventId)} ops={operaciones.filter(o => o.eventId === opEventId)} recetas={recetas} equipoBase={personalDB} onAdd={addOp} onAddBulk={addBulkOps} onUpdate={updateOp} onDelete={deleteOp} onBack={() => setOpEventId(null)} />
          : <OperacionesList events={events} operaciones={operaciones} setOpEventId={setOpEventId} />
        )}
        {view === "personal"  && <PersonalModule personal={personalDB} onAdd={addPersonal} onUpdate={updatePersonal} onDelete={deletePersonal} />}
        {view === "pagos"     && <Pagos     events={events} payments={payments} onAdd={addPayment} onDelete={deletePayment} />}
        {view === "postventa" && <PostVenta events={events} postventas={postventas} onSave={savePostventa} />}
        {view === "pyl"       && <PyL       events={events} payments={payments} costs={costs} onAddCost={addCost} onDeleteCost={deleteCost} />}
      </main>

      {detailEvent && (
        <EventDetail
          ev={detailEvent}
          onEdit={() => { setEventModal(detailEvent); setDetailEvent(null); }}
          onMove={dir => { moveStage(detailEvent, dir); const next = STAGES[si(detailEvent.stage) + dir]; if (next) setDetailEvent(p => ({ ...p, stage: next })); }}
          onDelete={() => deleteEvent(detailEvent.id)}
          onClose={() => setDetailEvent(null)}
        />
      )}
      {eventModal && (
        <EventForm
          ev={eventModal === "new" ? null : eventModal}
          clients={clients}
          onSave={data => { eventModal === "new" ? addEvent(data) : updateEvent(data); setEventModal(null); }}
          onClose={() => setEventModal(null)}
        />
      )}
      {clientModal && (
        <ClientForm
          client={clientModal === "new" ? null : clientModal}
          onSave={data => { clientModal === "new" ? addClient(data) : updateClient(data); setClientModal(null); }}
          onClose={() => setClientModal(null)}
        />
      )}
    </div>
  );
}
