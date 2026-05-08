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

const toNum = v => (v === "" || v == null) ? null : Number(v);
const parseClient    = r => ({ ...r, id: toNum(r.id) });
const parseEvent     = r => ({ ...r, id: toNum(r.id), clientId: toNum(r.clientId), guests: toNum(r.guests), amount: toNum(r.amount) });
const parsePayment   = r => ({ ...r, id: toNum(r.id), eventId: toNum(r.eventId), amount: toNum(r.amount) });
const parseCost      = r => ({ ...r, id: toNum(r.id), eventId: r.eventId ? toNum(r.eventId) : null, amount: toNum(r.amount) });
const parsePostventa = r => ({ ...r, eventId: toNum(r.eventId), rating: toNum(r.rating) });

// ─── Constants ────────────────────────────────────────────────────────────────
const GOLD = "#C9A84C";
const STAGES = ["Consulta", "Cotización", "Confirmación", "Evento", "Post-venta"];
const STAGE_COLORS = {
  "Consulta":     { fg: "#94A3B8", bg: "rgba(148,163,184,0.10)", bd: "rgba(148,163,184,0.22)" },
  "Cotización":   { fg: "#60A5FA", bg: "rgba(96,165,250,0.10)",  bd: "rgba(96,165,250,0.22)"  },
  "Confirmación": { fg: "#C9A84C", bg: "rgba(201,168,76,0.10)",  bd: "rgba(201,168,76,0.22)"  },
  "Evento":       { fg: "#34D399", bg: "rgba(52,211,153,0.10)",  bd: "rgba(52,211,153,0.22)"  },
  "Post-venta":   { fg: "#A78BFA", bg: "rgba(167,139,250,0.10)", bd: "rgba(167,139,250,0.22)" },
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
  card: { background: "#141414", border: "1px solid #1E1E1E", borderRadius: 10, padding: "1.25rem" },
  inp:  { width: "100%", background: "#1A1A1A", border: "1px solid #252525", borderRadius: 6, color: "#F0EAD8", padding: "0.55rem 0.75rem", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  btnP: { padding: "0.55rem 1.25rem", background: GOLD, border: "none", borderRadius: 6, color: "#0A0A0A", fontSize: "0.825rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnS: { padding: "0.5rem 1rem", background: "#1A1A1A", border: "1px solid #252525", borderRadius: 6, color: "#9A9080", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" },
  lbl:  { display: "block", fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#555045", marginBottom: "0.35rem" },
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
          <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.6rem", fontWeight: 600, color: "#F0EAD8", margin: 0 }}>{title}</h2>
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
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2rem", fontWeight: 700, color: GOLD, letterSpacing: "0.06em" }}>Standard 69</div>
          <div style={{ fontSize: "0.62rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "#3A3530", marginTop: 4 }}>Event CRM</div>
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
  { id: "dashboard", label: "Dashboard",  sym: "⊙" },
  { id: "pipeline",  label: "Pipeline",   sym: "⊞" },
  { id: "clients",   label: "Clientes",   sym: "◎" },
  { id: "pagos",     label: "Pagos",      sym: "◈" },
  { id: "postventa", label: "Post-venta", sym: "◇" },
  { id: "pyl",       label: "P & L",      sym: "◬" },
];

function Sidebar({ view, setView, events, payments, syncing, user, onLogout }) {
  const active  = events.filter(e => e.stage !== "Post-venta").length;
  const pending = payments.filter(p => p.status === "Pendiente").length;
  return (
    <aside style={{ width: 210, minWidth: 210, background: "#0D0D0D", borderRight: "1px solid #191919", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "1.5rem 1.25rem 1.25rem" }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.4rem", fontWeight: 700, color: GOLD, letterSpacing: "0.05em" }}>Standard 69</div>
        <div style={{ fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "#353030", marginTop: 3 }}>Event CRM</div>
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
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.5rem", color: GOLD, lineHeight: 1, fontWeight: 600 }}>{active}</div>
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
  const active     = events.filter(e => e.stage !== "Post-venta").length;
  const confirmed  = events.filter(e => ["Confirmación","Evento","Post-venta"].includes(e.stage)).reduce((s, e) => s + e.amount, 0);
  const collected  = payments.filter(p => p.status === "Pagado").reduce((s, p) => s + p.amount, 0);
  const totalCosts = costs.reduce((s, c) => s + c.amount, 0);
  const gross      = confirmed - totalCosts;
  const tod        = todayStr();
  const upcoming   = events.filter(e => e.date >= tod && e.stage !== "Post-venta").sort((a,b) => a.date > b.date ? 1 : -1).slice(0, 5);

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.25rem", fontWeight: 600, color: "#F0EAD8", margin: 0 }}>Dashboard</h1>
        <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>Vista general · Standard 69</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.875rem", marginBottom: "1.75rem" }}>
        {[
          { lbl: "Eventos activos",  val: active,            sub: "en pipeline" },
          { lbl: "Cobrado efectivo", val: fmtARS(collected), sub: "pagos recibidos", gold: true },
          { lbl: "Resultado neto",   val: fmtARS(gross),     sub: "revenue − costos", color: gross >= 0 ? "#34D399" : "#D05050" },
          { lbl: "Clientes",         val: clients.length,    sub: "en base" },
        ].map((s, i) => (
          <div key={i} style={S.card}>
            <div style={S.lbl}>{s.lbl}</div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.875rem", fontWeight: 600, color: s.color || (s.gold ? GOLD : "#F0EAD8"), lineHeight: 1.1 }}>{s.val}</div>
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
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.3rem", color: GOLD, fontWeight: 600 }}>
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
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.25rem", fontWeight: 600, color: "#F0EAD8", margin: 0 }}>Pipeline</h1>
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
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.5rem", color: "#F0EAD8", fontWeight: 600 }}>{stEvs.length}</span>
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
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.25rem", fontWeight: 600, color: "#F0EAD8", margin: 0 }}>Clientes</h1>
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
              {["Nombre", "Empresa", "Tipo", "Teléfono", "Email", "Eventos", "Revenue", ""].map(h => (
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
                  <td style={{ padding: "0.875rem 1rem", fontSize: "0.8rem", color: "#7A7068" }}>{c.phone}</td>
                  <td style={{ padding: "0.875rem 1rem", fontSize: "0.8rem", color: "#7A7068" }}>{c.email}</td>
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
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.25rem", fontWeight: 600, color: "#F0EAD8", margin: 0 }}>Pagos</h1>
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
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.875rem", fontWeight: 600, color: s.color, lineHeight: 1.1 }}>{s.val}</div>
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
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.25rem", fontWeight: 600, color: "#F0EAD8", margin: 0 }}>Post-venta</h1>
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
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.875rem", fontWeight: 600, color: s.gold ? GOLD : "#F0EAD8", lineHeight: 1.1 }}>{s.val}</div>
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
function PyL({ events, payments, costs, onAddCost, onDeleteCost }) {
  const [showForm, setShowForm] = useState(false);
  const [period, setPeriod] = useState("all");
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
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.25rem", fontWeight: 600, color: "#F0EAD8", margin: 0 }}>P & L</h1>
          <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>Resultados · Standard 69</div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <select value={period} onChange={e => setPeriod(e.target.value)} style={{ ...S.inp, width: 160 }}>
            <option value="all">Todo el período</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
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
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.7rem", fontWeight: 600, color: s.color, lineHeight: 1.1 }}>{s.val}</div>
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
            {chartData.map(d => <div key={d.m} style={{ flex: 1, textAlign: "center", fontSize: "0.58rem", color: "#454035" }}>{d.m.slice(5)}</div>)}
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

function ClientForm({ client, onSave, onClose }) {
  const [f, setF] = useState(client ? { ...client } : { name: "", company: "", phone: "", email: "", type: "Privado", notes: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const submit = () => {
    if (!f.name || !f.email) { alert("Completá nombre y email."); return; }
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
        <Field label="Email *" half>
          <input type="email" value={f.email} onChange={e => set("email", e.target.value)} style={S.inp} placeholder="email@ejemplo.com" />
        </Field>
      </div>
      <Field label="Notas">
        <textarea value={f.notes} onChange={e => set("notes", e.target.value)} style={{ ...S.inp, minHeight: 70, resize: "vertical" }} placeholder="Preferencias, cómo llegó el contacto..." />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem", marginTop: "0.5rem" }}>
        <button type="button" onClick={onClose} style={S.btnS}>Cancelar</button>
        <button type="button" onClick={submit} style={S.btnP}>Guardar cliente</button>
      </div>
    </Modal>
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

  const [clients,    setClients]    = useState([]);
  const [events,     setEvents]     = useState([]);
  const [payments,   setPayments]   = useState([]);
  const [costs,      setCosts]      = useState([]);
  const [postventas, setPostventas] = useState([]);

  const [eventModal,  setEventModal]  = useState(null);
  const [clientModal, setClientModal] = useState(null);
  const [detailEvent, setDetailEvent] = useState(null);

  const loadData = useCallback(() => {
    setLoading(true);
    sheetsGet()
      .then(data => {
        if (data.clientes?.length)   setClients(data.clientes.map(parseClient));
        if (data.eventos?.length)    setEvents(data.eventos.map(parseEvent));
        if (data.pagos?.length)      setPayments(data.pagos.map(parsePayment));
        if (data.costos?.length)     setCosts(data.costos.map(parseCost));
        if (data.postventas?.length) setPostventas(data.postventas.map(parsePostventa));
        setLoading(false);
      })
      .catch(err => { setLoadError(err.message); setLoading(false); });
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
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    const passwordHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
    const u = await sheetsPost({ action: "login", data: { email, passwordHash } });
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

  if (!authChecked) return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#0A0A0A" }}>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2rem", color: GOLD }}>Standard 69</div>
    </div>
  );

  if (!user) return <AuthScreen onLogin={handleLogin} />;

  if (loading) return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#0A0A0A", flexDirection: "column", gap: "1rem" }}>
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2rem", color: GOLD }}>Standard 69</div>
      <div style={{ fontSize: "0.75rem", color: "#555045", letterSpacing: "0.1em" }}>Cargando datos...</div>
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
    <div style={{ display: "flex", height: "100vh", background: "#0A0A0A", fontFamily: "'DM Sans',sans-serif", color: "#F0EAD8" }}>
      <Sidebar view={view} setView={setView} events={events} payments={payments} syncing={syncing} user={user} onLogout={handleLogout} />
      <main style={{ flex: 1, overflowY: "auto", padding: "2rem", minWidth: 0 }}>
        {view === "dashboard" && <Dashboard events={events} clients={clients} payments={payments} costs={costs} setView={setView} setDetailEvent={setDetailEvent} />}
        {view === "pipeline"  && <Pipeline  events={events} onMove={moveStage} onCard={setDetailEvent} onNew={() => setEventModal("new")} />}
        {view === "clients"   && <Clients   clients={clients} events={events} onNew={() => setClientModal("new")} onEdit={setClientModal} />}
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
