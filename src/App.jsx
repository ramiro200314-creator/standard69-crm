import { useState, useEffect } from "react";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtARS  = n  => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
const fmtD    = d  => d ? new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : "—";
const fmtDLong= d  => d ? new Date(d + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : "—";
const nextId  = arr => (arr.length ? Math.max(...arr.map(x => x.id)) : 0) + 1;
const si      = s  => STAGES.indexOf(s);
const sc      = s  => STAGE_COLORS[s] || STAGE_COLORS["Consulta"];

// ─── Persistence ──────────────────────────────────────────────────────────────
function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initial;
    } catch { return initial; }
  });
  const set = (v) => {
    setVal(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  };
  return [val, set];
}

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INIT_CLIENTS = [
  { id: 1, name: "Martina García",   company: "",              phone: "351-555-0101", email: "martina@gmail.com",      type: "Privado",     notes: "Clienta recurrente, muy detallista" },
  { id: 2, name: "Carlos Rodríguez", company: "Grupo Nexo SA", phone: "351-555-0202", email: "carlos@gruponexo.com",   type: "Corporativo", notes: "Eventos anuales de empresa" },
  { id: 3, name: "Lucía Fernández",  company: "",              phone: "351-555-0303", email: "lucia@hotmail.com",      type: "Privado",     notes: "" },
];
const INIT_EVENTS = [
  { id: 1, clientId: 1, clientName: "Martina García",   title: "Cumpleaños 30",        type: "Cumpleaños",  date: "2025-06-15", guests: 40, stage: "Confirmación", amount: 180000, notes: "DJ externo, torta incluida" },
  { id: 2, clientId: 2, clientName: "Grupo Nexo SA",    title: "Cena equipo Q2",       type: "Corporativo", date: "2025-06-28", guests: 25, stage: "Cotización",   amount: 120000, notes: "Proyector requerido, menú ejecutivo" },
  { id: 3, clientId: 3, clientName: "Lucía Fernández",  title: "Aniversario de bodas", type: "Aniversario", date: "2025-07-10", guests: 20, stage: "Consulta",     amount: 0,      notes: "Primer contacto vía Instagram" },
  { id: 4, clientId: 1, clientName: "Martina García",   title: "Despedida de soltera", type: "Otro",        date: "2025-04-20", guests: 15, stage: "Post-venta",   amount: 75000,  notes: "Todo salió excelente ✓" },
  { id: 5, clientId: 2, clientName: "Grupo Nexo SA",    title: "Lanzamiento Q1",       type: "Corporativo", date: "2025-05-30", guests: 60, stage: "Evento",       amount: 320000, notes: "Audio y video profesional" },
];

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  card: { background: "#141414", border: "1px solid #1E1E1E", borderRadius: 10, padding: "1.25rem" },
  inp:  { width: "100%", background: "#1A1A1A", border: "1px solid #252525", borderRadius: 6, color: "#F0EAD8", padding: "0.55rem 0.75rem", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  btnP: { padding: "0.55rem 1.25rem", background: GOLD, border: "none", borderRadius: 6, color: "#0A0A0A", fontSize: "0.825rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnS: { padding: "0.5rem 1rem", background: "#1A1A1A", border: "1px solid #252525", borderRadius: 6, color: "#9A9080", fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" },
  lbl:  { display: "block", fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#555045", marginBottom: "0.35rem" },
};

// ─── StageBadge ───────────────────────────────────────────────────────────────
function StageBadge({ stage }) {
  const c = sc(stage);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: c.bg, border: `1px solid ${c.bd}`, fontSize: "0.68rem", fontWeight: 500, color: c.fg }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.fg, display: "inline-block" }} />
      {stage}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const handler = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
    >
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

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", label: "Dashboard", sym: "⊙" },
  { id: "pipeline",  label: "Pipeline",  sym: "⊞" },
  { id: "clients",   label: "Clientes",  sym: "◎" },
];

function Sidebar({ view, setView, events }) {
  const active = events.filter(e => e.stage !== "Post-venta").length;
  return (
    <aside style={{ width: 210, minWidth: 210, background: "#0D0D0D", borderRight: "1px solid #191919", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "1.5rem 1.25rem 1.75rem" }}>
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
          </button>
        ))}
      </nav>
      <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid #181818" }}>
        <div style={S.lbl}>Eventos activos</div>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.5rem", color: GOLD, lineHeight: 1, fontWeight: 600 }}>{active}</div>
        <div style={{ fontSize: "0.68rem", color: "#3A3530", marginTop: 2 }}>en pipeline</div>
      </div>
    </aside>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ events, clients, setView, setDetailEvent }) {
  const active    = events.filter(e => e.stage !== "Post-venta").length;
  const quotes    = events.filter(e => e.stage === "Cotización").length;
  const confirmed = events.filter(e => ["Confirmación", "Evento", "Post-venta"].includes(e.stage)).reduce((s, e) => s + e.amount, 0);
  const today     = new Date().toISOString().split("T")[0];
  const upcoming  = events.filter(e => e.date >= today && e.stage !== "Post-venta").sort((a, b) => a.date > b.date ? 1 : -1).slice(0, 5);

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "2.25rem", fontWeight: 600, color: "#F0EAD8", margin: 0 }}>Dashboard</h1>
        <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>Vista general · Standard 69</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.875rem", marginBottom: "1.75rem" }}>
        {[
          { lbl: "Eventos activos",    val: active,            sub: "en pipeline"  },
          { lbl: "Cotizaciones",       val: quotes,            sub: "pendientes"   },
          { lbl: "Revenue confirmado", val: fmtARS(confirmed), sub: "acumulado", gold: true },
          { lbl: "Clientes",           val: clients.length,    sub: "en base"      },
        ].map((s, i) => (
          <div key={i} style={S.card}>
            <div style={S.lbl}>{s.lbl}</div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "1.875rem", fontWeight: 600, color: s.gold ? GOLD : "#F0EAD8", lineHeight: 1.1 }}>{s.val}</div>
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

// ─── Pipeline Kanban ──────────────────────────────────────────────────────────
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
    c.company.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
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
              {["Nombre", "Empresa", "Tipo", "Teléfono", "Email", "Eventos", ""].map(h => (
                <th key={h} style={{ padding: "0.7rem 1rem", textAlign: "left", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#454035", fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const evCount = events.filter(e => e.clientId === c.id).length;
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
                  <td style={{ padding: "0.875rem 1rem", fontFamily: "'Cormorant Garamond',serif", fontSize: "1.3rem", color: evCount > 0 ? GOLD : "#383330", fontWeight: 600 }}>{evCount}</td>
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

// ─── Event Detail Modal ───────────────────────────────────────────────────────
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

// ─── Event Form ───────────────────────────────────────────────────────────────
function EventForm({ ev, clients, onSave, onClose }) {
  const [f, setF] = useState(ev ? { ...ev } : {
    clientId: "", clientName: "", title: "", type: "Cumpleaños",
    date: "", guests: "", stage: "Consulta", amount: "", notes: "",
  });
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
        <textarea value={f.notes} onChange={e => set("notes", e.target.value)} style={{ ...S.inp, minHeight: 75, resize: "vertical" }} placeholder="Requerimientos especiales, observaciones..." />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem", marginTop: "0.5rem" }}>
        <button type="button" onClick={onClose} style={S.btnS}>Cancelar</button>
        <button type="button" onClick={submit} style={S.btnP}>Guardar evento</button>
      </div>
    </Modal>
  );
}

// ─── Client Form ──────────────────────────────────────────────────────────────
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
            <option>Privado</option>
            <option>Corporativo</option>
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

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("dashboard");
  const [clients, setClients] = useLocalStorage("s69_clients", INIT_CLIENTS);
  const [events,  setEvents]  = useLocalStorage("s69_events",  INIT_EVENTS);

  const [eventModal,  setEventModal]  = useState(null);
  const [clientModal, setClientModal] = useState(null);
  const [detailEvent, setDetailEvent] = useState(null);

  const addEvent    = ev => setEvents(p => [...p, { ...ev, id: nextId(p) }]);
  const updateEvent = ev => setEvents(p => p.map(e => e.id === ev.id ? ev : e));
  const deleteEvent = id => { setEvents(p => p.filter(e => e.id !== id)); setDetailEvent(null); };
  const moveStage   = (ev, dir) => { const next = STAGES[si(ev.stage) + dir]; if (next) updateEvent({ ...ev, stage: next }); };
  const addClient   = cl => setClients(p => [...p, { ...cl, id: nextId(p) }]);
  const updateClient= cl => setClients(p => p.map(c => c.id === cl.id ? cl : c));

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0A0A0A", fontFamily: "'DM Sans',sans-serif", color: "#F0EAD8" }}>
      <Sidebar view={view} setView={setView} events={events} />

      <main style={{ flex: 1, overflowY: "auto", padding: "2rem", minWidth: 0 }}>
        {view === "dashboard" && <Dashboard events={events} clients={clients} setView={setView} setDetailEvent={setDetailEvent} />}
        {view === "pipeline"  && <Pipeline  events={events} onMove={moveStage} onCard={setDetailEvent} onNew={() => setEventModal("new")} />}
        {view === "clients"   && <Clients   clients={clients} events={events} onNew={() => setClientModal("new")} onEdit={setClientModal} />}
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
