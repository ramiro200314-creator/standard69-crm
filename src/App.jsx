import { useState, useEffect, useMemo, useCallback } from "react";

// ─── Google Sheets API ────────────────────────────────────────────────────────
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyF94fI0SdX7_QX7qTjVg6nW40PAhpRLB8Xfk5V-sHZKfPmj4i_HA_whGB4HhOWcmMe9Q/exec";

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
const parsePayment   = r => ({ ...r, id: toNum(r.id), eventId: toNum(r.eventId), amount: toNum(r.amount), date: toDate(r.date), comprobante: r.comprobante || "" });
const parseCost      = r => ({ ...r, id: toNum(r.id), eventId: r.eventId ? toNum(r.eventId) : null, amount: toNum(r.amount), date: toDate(r.date) });
const parsePostventa = r => ({ ...r, eventId: toNum(r.eventId), rating: toNum(r.rating) });
const parsePersonal  = r => ({ ...r, id: toNum(r.id), tarifaEvento: toNum(r.tarifaEvento) });
const safeParseJSON  = (s, fallback) => { try { const v = JSON.parse(s); return v ?? fallback; } catch { return fallback; } };
const parseHojaFuncion = r => ({ ...r, id: toNum(r.id), eventId: toNum(r.eventId), pax: toNum(r.pax), timing: safeParseJSON(r.timing, []) });

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
const COST_CATS = ["Personal", "Mercaderías", "Bebidas", "Insumos / Bebidas", "Alquiler salón", "Decoración", "Audio / Video", "Catering extra", "Transporte", "Marketing", "Impuestos", "Previsiones", "Otro"];

// ─── Hoja de Función ──────────────────────────────────────────────────────────
const SUCURSALES_HF = ["Standard 69 Güemes", "Standard 69 Villa Warcalde"];
const TIPOS_PROPUESTA_HF = {
  "Cena / Almuerzo":         { entrada: true,  principal: true,  postre: true,  bebSinAlc: true,  bebConAlc: true,  menusEsp: true,  vajilla: true  },
  "Cocktail / Standing":     { entrada: false, principal: false, postre: false, bebSinAlc: true,  bebConAlc: true,  menusEsp: true,  vajilla: false },
  "Coffee Break / Desayuno": { entrada: false, principal: false, postre: false, bebSinAlc: true,  bebConAlc: false, menusEsp: false, vajilla: false },
  "Wine Pairing / Maridaje": { entrada: true,  principal: true,  postre: true,  bebSinAlc: false, bebConAlc: true,  menusEsp: false, vajilla: false },
  "Corporativo sin F&B":     { entrada: false, principal: false, postre: false, bebSinAlc: true,  bebConAlc: false, menusEsp: false, vajilla: false },
};
const RESPONSABLES_HF = [
  { key: "respOperativo", area: "Operativo General", tarea: "Coordinación y supervisión integral del evento" },
  { key: "respCocina",    area: "Cocina / Chef",      tarea: "Producción gastronómica y tiempos de servicio" },
  { key: "respSalon",     area: "Salón / Maître",     tarea: "Servicio de mesa, orden y protocolo de sala" },
  { key: "respBar",       area: "Bar / Sommelier",    tarea: "Bebidas, maridaje y servicio de barra" },
];
const blankHojaFuncion = ev => ({
  eventId: ev.id,
  nombreEvento: ev.title || "",
  cliente: ev.clientName || "",
  fecha: ev.date || "",
  sucursal: SUCURSALES_HF[0],
  espacioAsignado: (ev.notes || "").match(/Sede: ([^|]+)/)?.[1]?.trim() || "",
  horario: "",
  pax: ev.guests || "",
  notaEvento: "",
  timing: [{ hs: "", actividad: "", lugar: "" }, { hs: "", actividad: "", lugar: "" }, { hs: "", actividad: "", lugar: "" }],
  tipoPropuesta: "Cena / Almuerzo",
  propuestaGastro: "", entrada: "", principal: "", postre: "", bebSinAlc: "", bebConAlc: "", menusEspeciales: "", vajilla: "", notaGastro: "",
  respOperativo: "", respCocina: "", respSalon: "", respBar: "",
  pedidosEspeciales: "",
});

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
  { id: "pagos",       label: "Pagos",       sym: "◈", roles: ["admin"] },
  { id: "postventa",   label: "Post-venta",  sym: "◇" },
  { id: "pyl",         label: "P & L",       sym: "◬", roles: ["admin"] },
  { id: "marketing",   label: "Marketing",   sym: "◐" },
  { id: "usuarios",    label: "Usuarios",    sym: "◑", roles: ["admin"] },
];

const canView = (navId, role) => {
  const item = NAV.find(n => n.id === navId);
  return !item?.roles || item.roles.includes(role);
};

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
        {NAV.filter(n => canView(n.id, user?.role)).map(n => (
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
function PagoForm({ ev, pago, events, onSave, onClose }) {
  const blank = { eventId: ev ? ev.id : "", concept: "Seña", amount: "", method: "Transferencia", date: todayStr(), status: "Pagado", comprobante: "", notes: "" };
  const [f, setF] = useState(pago ? { ...pago } : blank);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const submit = () => {
    if (!f.amount) { alert("Ingresá el monto."); return; }
    onSave({ ...f, eventId: Number(f.eventId || ev?.id), amount: parseFloat(f.amount) });
  };
  return (
    <Modal title={pago ? "Editar pago" : "Registrar pago"} onClose={onClose}>
      {!ev && (
        <Field label="Evento *">
          <select value={f.eventId} onChange={e => set("eventId", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
            <option value="">Seleccionar evento...</option>
            {(events || []).map(ev => <option key={ev.id} value={ev.id}>{ev.title} — {ev.clientName}</option>)}
          </select>
        </Field>
      )}
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
      <Field label="Comprobante / Factura">
        <input value={f.comprobante || ""} onChange={e => set("comprobante", e.target.value)} style={S.inp} placeholder="Nro. factura, link de Drive o referencia..." />
        {f.comprobante && (f.comprobante.startsWith("http") ? (
          <a href={f.comprobante} target="_blank" rel="noreferrer" style={{ fontSize: "0.7rem", color: "#7EB89A", display: "block", marginTop: 4 }}>↗ Ver archivo adjunto</a>
        ) : null)}
      </Field>
      <Field label="Notas">
        <textarea value={f.notes || ""} onChange={e => set("notes", e.target.value)} style={{ ...S.inp, minHeight: 50, resize: "vertical" }} placeholder="Observaciones..." />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem", marginTop: "0.5rem" }}>
        <button type="button" onClick={onClose} style={S.btnS}>Cancelar</button>
        <button type="button" onClick={submit} style={S.btnP}>Guardar</button>
      </div>
    </Modal>
  );
}

function PagoEvento({ ev, evPayments, onAdd, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editPago, setEditPago] = useState(null);
  const cobrado  = evPayments.filter(p => p.status === "Pagado").reduce((s, p) => s + p.amount, 0);
  const pendiente= evPayments.filter(p => p.status === "Pendiente").reduce((s, p) => s + p.amount, 0);
  const pct      = ev.amount ? Math.min(100, Math.round(cobrado / ev.amount * 100)) : 0;
  const SC       = { "Pagado": "#7EB89A", "Pendiente": GOLD, "Vencido": "#D05050" };
  return (
    <div style={{ ...S.card, marginBottom: "0.75rem", padding: 0, overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "1rem 1.25rem", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#F0EAD8", fontWeight: 500 }}>
            {ev.title} <span style={{ fontSize: "0.72rem", color: "#555045", fontWeight: 400 }}>· {ev.clientName}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "0.68rem", color: "#3A3530" }}>{fmtD(ev.date)}</span>
            <span style={{ fontSize: "0.68rem", color: "#3A3530" }}>{open ? "▲" : "▼"}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
          <div style={{ flex: 1, background: "#1A1A1A", borderRadius: 4, height: 5 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#34D399" : GOLD, borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: "0.7rem", color: GOLD, flexShrink: 0 }}>{fmtARS(cobrado)}{ev.amount ? ` / ${fmtARS(ev.amount)}` : ""}</span>
          {pendiente > 0 && <span style={{ fontSize: "0.68rem", color: "#7A6050" }}>· {fmtARS(pendiente)} pend.</span>}
          <span style={{ fontSize: "0.65rem", color: "#3A3530" }}>{evPayments.length} pago{evPayments.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid #1C1C18", padding: "0.75rem 1.25rem 1rem" }}>
          {evPayments.length === 0 && <div style={{ fontSize: "0.8rem", color: "#3A3530", marginBottom: "0.75rem" }}>Sin pagos registrados.</div>}
          {evPayments.map(p => {
            const col = SC[p.status] || "#555045";
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.5rem 0", borderBottom: "1px solid #141412", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.8rem", color: "#EDE8DF", minWidth: 90 }}>{p.concept}</span>
                <span style={{ fontSize: "0.875rem", color: GOLD, fontWeight: 500, minWidth: 120 }}>{fmtARS(p.amount)}</span>
                <span style={{ fontSize: "0.72rem", color: "#6A6055" }}>{fmtD(p.date)}</span>
                <span style={{ fontSize: "0.72rem", color: "#6A6055" }}>{p.method}</span>
                <span style={{ fontSize: "0.67rem", color: col, background: `${col}18`, border: `1px solid ${col}28`, padding: "2px 8px", borderRadius: 12 }}>{p.status}</span>
                {p.comprobante && (
                  p.comprobante.startsWith("http")
                    ? <a href={p.comprobante} target="_blank" rel="noreferrer" style={{ fontSize: "0.68rem", color: "#7EB89A" }}>📎 Comprobante</a>
                    : <span style={{ fontSize: "0.68rem", color: "#6A6055" }}>📄 {p.comprobante}</span>
                )}
                <div style={{ marginLeft: "auto", display: "flex", gap: "0.35rem" }}>
                  <button type="button" onClick={() => setEditPago(p)} style={{ ...S.btnS, padding: "0.2rem 0.6rem", fontSize: "0.68rem" }}>Editar</button>
                  <button type="button" onClick={() => { if (confirm("¿Eliminar pago?")) onDelete(p.id); }} style={{ ...S.btnS, padding: "0.2rem 0.5rem", fontSize: "0.68rem", color: "#D05050", borderColor: "rgba(208,80,80,0.2)" }}>×</button>
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: "0.75rem" }}>
            <button type="button" onClick={() => setShowAdd(true)} style={{ ...S.btnS, fontSize: "0.75rem", color: GOLD, borderColor: "rgba(211,154,89,0.25)" }}>+ Agregar pago</button>
          </div>
        </div>
      )}
      {showAdd && <PagoForm ev={ev} onSave={d => { onAdd({ ...d, eventId: ev.id }); setShowAdd(false); }} onClose={() => setShowAdd(false)} />}
      {editPago && <PagoForm ev={ev} pago={editPago} onSave={d => { onUpdate(d); setEditPago(null); }} onClose={() => setEditPago(null)} />}
    </div>
  );
}

function Pagos({ events, payments, onAdd, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const curMesPagos = todayStr().slice(0, 7);
  const [period, setPeriod] = useState(curMesPagos);
  const months = useMemo(() => {
    const fromEvs = events.map(e => e.date?.slice(0,7));
    const fromPays = payments.map(p => p.date?.slice(0,7));
    return [...new Set([...fromEvs, ...fromPays].filter(Boolean))].sort().reverse();
  }, [events, payments]);

  const eventsInPeriod = period === "all" ? events : events.filter(e => (e.date || "").startsWith(period));
  const paymentsInPeriod = period === "all" ? payments : payments.filter(p => (p.date || "").startsWith(period));
  const cobrado   = paymentsInPeriod.filter(p => p.status === "Pagado").reduce((s, p) => s + p.amount, 0);
  const pendiente = paymentsInPeriod.filter(p => p.status === "Pendiente").reduce((s, p) => s + p.amount, 0);
  const vencido   = paymentsInPeriod.filter(p => p.status === "Vencido").reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.5rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>Pagos</h1>
          <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>{eventsInPeriod.length} eventos · {paymentsInPeriod.length} pagos</div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <select value={period} onChange={e => setPeriod(e.target.value)} style={{ ...S.inp, width: 190, textTransform: "capitalize" }}>
            <option value="all">Todo el período</option>
            {months.map(m => <option key={m} value={m}>{fmtMes(m)}</option>)}
          </select>
          <button type="button" onClick={() => setShowForm(true)} style={S.btnP}>+ Registrar pago</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.875rem", marginBottom: "1.75rem" }}>
        {[
          { lbl: "Cobrado", val: fmtARS(cobrado), color: "#34D399" },
          { lbl: "Pendiente", val: fmtARS(pendiente), color: GOLD },
          { lbl: "Vencido", val: fmtARS(vencido), color: "#D05050" },
        ].map((s, i) => (
          <div key={i} style={S.card}>
            <div style={S.lbl}>{s.lbl}</div>
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.75rem", fontWeight: 300, color: s.color, lineHeight: 1.1 }}>{s.val}</div>
          </div>
        ))}
      </div>
      {eventsInPeriod.length === 0
        ? <div style={{ ...S.card, textAlign: "center", color: "#3A3530", fontSize: "0.85rem", padding: "3rem" }}>Sin eventos para este período.</div>
        : eventsInPeriod.sort((a, b) => a.date > b.date ? 1 : -1).map(ev => (
            <PagoEvento key={ev.id} ev={ev}
              evPayments={payments.filter(p => p.eventId === ev.id)}
              onAdd={onAdd} onUpdate={onUpdate} onDelete={onDelete} />
          ))
      }
      {showForm && <PagoForm events={eventsInPeriod} onSave={d => { onAdd(d); setShowForm(false); }} onClose={() => setShowForm(false)} />}
    </div>
  );
}

function _PaymentFormOld({ events, onSave, onClose }) {
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
const fmtMes     = m => new Date(m + "-01T00:00:00").toLocaleDateString("es-AR", { month: "long", year: "numeric" });
const fmtMesCorto = m => new Date(m + "-01T00:00:00").toLocaleDateString("es-AR", { month: "short", year: "2-digit" });

const addMonths = (ym, n) => {
  const [y, mo] = ym.split("-").map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthsInRange = (from, to) => {
  if (!from || !to || from > to) return [];
  const result = [];
  let cur = from;
  while (cur <= to && result.length < 12) { result.push(cur); cur = addMonths(cur, 1); }
  return result;
};

const PYL_ROWS = [
  { type: "revenue",  key: "ventas",    label: "Ventas" },
  { type: "sep" },
  { type: "header",   label: "Costo de ventas" },
  { type: "cost",     key: "merch",     label: "Mercaderías",         indent: true },
  { type: "cost",     key: "bebidas",   label: "Bebidas",             indent: true },
  { type: "subtotal", key: "cdv",       label: "Total costo de ventas" },
  { type: "sep" },
  { type: "result",   key: "utilBruta", label: "Utilidad bruta",      bold: true },
  { type: "pct",      key: "utilBruta", label: "% Margen bruto" },
  { type: "sep" },
  { type: "cost",     key: "publi",     label: "Gastos de publicidad" },
  { type: "cost",     key: "sueldos",   label: "Sueldos" },
  { type: "cost",     key: "otros",     label: "Otros costos" },
  { type: "sep" },
  { type: "cost",     key: "impuestos", label: "Impuestos" },
  { type: "cost",     key: "prev",      label: "Previsiones" },
  { type: "sep" },
  { type: "result",   key: "neto",      label: "Resultado neto",      bold: true, highlight: true },
  { type: "pct",      key: "neto",      label: "% Margen neto" },
];

function PyL({ events, payments, costs, onAddCost, onDeleteCost }) {
  const curMes = todayStr().slice(0, 7);
  const [fromMes,    setFromMes]    = useState(addMonths(curMes, -2));
  const [toMes,      setToMes]      = useState(curMes);
  const [showForm,   setShowForm]   = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const months = useMemo(() => monthsInRange(fromMes, toMes), [fromMes, toMes]);

  const revM = m =>
    events.filter(e => e.date?.slice(0,7) === m && ["Confirmación","Evento","Post-venta"].includes(e.stage))
          .reduce((s, e) => s + (e.amount || 0), 0);

  const costM = (m, cats) =>
    costs.filter(c => c.date?.slice(0,7) === m && cats.includes(c.category))
         .reduce((s, c) => s + (c.amount || 0), 0);

  const calcM = m => {
    const ventas    = revM(m);
    const merch     = costM(m, ["Mercaderías", "Insumos / Bebidas", "Catering extra"]);
    const bebidas   = costM(m, ["Bebidas"]);
    const cdv       = merch + bebidas;
    const utilBruta = ventas - cdv;
    const publi     = costM(m, ["Marketing"]);
    const sueldos   = costM(m, ["Personal"]);
    const otros     = costM(m, ["Alquiler salón", "Decoración", "Audio / Video", "Transporte", "Otro"]);
    const impuestos = costM(m, ["Impuestos"]);
    const prev      = costM(m, ["Previsiones"]);
    const neto      = utilBruta - publi - sueldos - otros - impuestos - prev;
    return { ventas, merch, bebidas, cdv, utilBruta, publi, sueldos, otros, impuestos, prev, neto };
  };

  const data = useMemo(() => months.map(m => ({ m, ...calcM(m) })), [months, events, costs]);
  const tot  = useMemo(() => data.reduce((acc, d) => {
    Object.keys(d).forEach(k => { if (k !== "m") acc[k] = (acc[k] || 0) + d[k]; });
    return acc;
  }, {}), [data]);

  const showTotal = months.length > 1;
  const colCount  = 1 + months.length + (showTotal ? 1 : 0);

  const fmtResult = v => {
    if (v === 0) return null;
    return v < 0 ? `(${fmtARS(Math.abs(v))})` : fmtARS(v);
  };
  const fmtCost = v => v === 0 ? null : `(${fmtARS(v)})`;
  const fmtPct  = (v, ventas) => ventas > 0 ? `${((v / ventas) * 100).toFixed(1)}%` : null;

  const resultColor  = v => v > 0 ? "#34D399" : v < 0 ? "#D05050" : "#454035";
  const pctColor     = v => v > 0 ? "#7EB89A" : v < 0 ? "#D05050" : "#454035";

  const detailCosts = useMemo(() =>
    costs.filter(c => { const cm = c.date?.slice(0,7); return cm >= fromMes && cm <= toMes; })
         .sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [costs, fromMes, toMes]
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.5rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>P & L</h1>
          <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>Resultados · Standard 69</div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#454035" }}>Desde</span>
            <input type="month" value={fromMes} max={toMes} onChange={e => setFromMes(e.target.value)} style={{ ...S.inp, width: 148 }} />
          </div>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#454035" }}>Hasta</span>
            <input type="month" value={toMes} min={fromMes} onChange={e => setToMes(e.target.value)} style={{ ...S.inp, width: 148 }} />
          </div>
          <button type="button" onClick={() => setShowForm(true)} style={S.btnP}>+ Registrar costo</button>
        </div>
      </div>

      {/* P&L table */}
      <div style={{ ...S.card, overflowX: "auto", padding: "1.5rem 1.75rem" }}>
        {months.length === 0 && (
          <div style={{ color: "#4A4540", fontSize: "0.875rem" }}>Seleccioná un rango de meses válido.</div>
        )}
        {months.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
            <thead>
              <tr>
                <th style={{ ...S.th, padding: "0 2rem 0.875rem 0", width: "32%" }} />
                {months.map(m => (
                  <th key={m} style={{ ...S.th, padding: "0 0 0.875rem 0", textAlign: "right", fontSize: "0.68rem", letterSpacing: "0.08em", color: "#6A6055", textTransform: "capitalize" }}>
                    {fmtMesCorto(m)}
                  </th>
                ))}
                {showTotal && (
                  <th style={{ ...S.th, padding: "0 0 0.875rem 1.5rem", textAlign: "right", fontSize: "0.62rem", letterSpacing: "0.14em", color: "#454035" }}>TOTAL</th>
                )}
              </tr>
            </thead>
            <tbody>
              {PYL_ROWS.map((row, i) => {
                if (row.type === "sep") {
                  return <tr key={i}><td colSpan={colCount} style={{ height: 1, padding: "6px 0 0", borderBottom: "1px solid #1C1C18" }} /></tr>;
                }
                if (row.type === "header") {
                  return (
                    <tr key={i}>
                      <td colSpan={colCount} style={{ padding: "0.625rem 0 0.2rem", fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "#3A3530" }}>
                        {row.label}
                      </td>
                    </tr>
                  );
                }

                const isRevenue  = row.type === "revenue";
                const isCost     = row.type === "cost" || row.type === "subtotal";
                const isResult   = row.type === "result";
                const isPct      = row.type === "pct";
                const isHighlight = row.highlight;
                const vPad = isResult ? "0.7rem" : isPct ? "0.1rem" : "0.42rem";

                const cellStyle = (extra = {}) => ({
                  padding: `${vPad} 0`,
                  textAlign: "right",
                  fontSize: isResult ? "0.88rem" : isPct ? "0.68rem" : "0.825rem",
                  fontWeight: row.bold ? 600 : 400,
                  borderTop: isResult ? "1px solid #2A2A28" : "none",
                  ...extra,
                });

                const labelStyle = {
                  padding: `${vPad} 2rem ${vPad} ${row.indent ? "1.25rem" : "0"}`,
                  fontSize: isResult ? "0.82rem" : isPct ? "0.68rem" : "0.8rem",
                  fontWeight: row.bold ? 600 : 400,
                  color: isHighlight ? "#EDE8DF" : isResult ? "#C8BFB0" : isPct ? "#454035" : isCost ? "#7A7260" : "#B0A898",
                  letterSpacing: row.bold ? "0.1em" : "0.01em",
                  textTransform: row.bold ? "uppercase" : "none",
                  borderTop: isResult ? "1px solid #2A2A28" : "none",
                  background: isHighlight ? "rgba(52,211,153,0.03)" : "transparent",
                };

                return (
                  <tr key={i}>
                    <td style={labelStyle}>{row.label}</td>
                    {data.map(d => {
                      let display = null;
                      let color   = "#555045";
                      if (isPct) {
                        const pct = fmtPct(d[row.key], d.ventas);
                        display = pct;
                        color   = pctColor(d[row.key]);
                      } else if (isResult) {
                        display = fmtResult(d[row.key]);
                        color   = resultColor(d[row.key]);
                      } else if (isCost) {
                        display = fmtCost(d[row.key]);
                        color   = d[row.key] > 0 ? "#C08060" : "#333";
                      } else {
                        display = d[row.key] > 0 ? fmtARS(d[row.key]) : null;
                        color   = d[row.key] > 0 ? "#B0A898" : "#333";
                      }
                      return (
                        <td key={d.m} style={{ ...cellStyle(), color, background: isHighlight ? "rgba(52,211,153,0.03)" : "transparent" }}>
                          {display ?? <span style={{ color: "#2A2A28" }}>—</span>}
                        </td>
                      );
                    })}
                    {showTotal && (() => {
                      let display = null;
                      let color   = "#555045";
                      if (isPct) {
                        const pct = fmtPct(tot[row.key], tot.ventas);
                        display = pct;
                        color   = pctColor(tot[row.key]);
                      } else if (isResult) {
                        display = fmtResult(tot[row.key]);
                        color   = resultColor(tot[row.key]);
                      } else if (isCost) {
                        display = fmtCost(tot[row.key]);
                        color   = (tot[row.key] || 0) > 0 ? "#C08060" : "#333";
                      } else {
                        display = (tot[row.key] || 0) > 0 ? fmtARS(tot[row.key]) : null;
                        color   = (tot[row.key] || 0) > 0 ? "#8A8270" : "#333";
                      }
                      return (
                        <td style={{ ...cellStyle({ paddingLeft: "1.5rem", opacity: 0.8 }), color, background: isHighlight ? "rgba(52,211,153,0.03)" : "transparent" }}>
                          {display ?? <span style={{ color: "#2A2A28" }}>—</span>}
                        </td>
                      );
                    })()}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Detalle de costos colapsable */}
      <div style={{ marginTop: "1.125rem" }}>
        <button type="button" onClick={() => setShowDetail(p => !p)}
          style={{ ...S.btnS, fontSize: "0.72rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.65rem" }}>{showDetail ? "▾" : "▸"}</span>
          Detalle de costos del período ({detailCosts.length})
        </button>
        {showDetail && (
          <div style={{ ...S.card, marginTop: "0.75rem" }}>
            {detailCosts.length === 0 && <div style={{ color: "#4A4540", fontSize: "0.875rem" }}>Sin costos en el período seleccionado.</div>}
            {detailCosts.map(c => {
              const ev = events.find(e => e.id === c.eventId);
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.55rem 0", borderBottom: "1px solid #181818" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.8rem", color: "#F0EAD8" }}>{c.notes || c.category}</div>
                    <div style={{ fontSize: "0.68rem", color: "#555045" }}>{c.category}{ev ? ` · ${ev.title}` : " · General"} · {fmtD(c.date)}</div>
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "#C08060", fontWeight: 500 }}>{fmtARS(c.amount)}</div>
                  <button type="button" onClick={() => onDeleteCost(c.id)} style={{ ...S.btnS, padding: "0.25rem 0.6rem", fontSize: "0.72rem", color: "#D05050", borderColor: "rgba(208,80,80,0.25)" }}>×</button>
                </div>
              );
            })}
          </div>
        )}
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

// ─── Plantillas de propuesta por tipo de menú ────────────────────────────────
const PROPUESTA_TEMPLATES = {
  "Finger food": {
    recepcion: ["Barra de bebidas", "Mesa de Recepción con variedades de fiambres y quesos cordobeces, hummus y panes de nuestra panadería"],
    mainLabel: "F I N G E R  F O O D",
    main: ["Pincho de Tortilla, jamón crudo y vegetales", "Taquitos de Cuadril", "Arepas de pollo con Alioli de Palta", "Provoletas Ahumadas con Miel gratinada", "Pincho de Pollo Marroquí con Cous Cous y Yogur Especiado", "Brochette de vegetales salteados", "Croquetas de Jamón serrano", "Portobellos a la parrilla con crema de castañas y provenzal"],
    postre: ["Flan de Dulce de Leche", "Infusión Mediana", "Torta de cumpleaños (opcional)"],
    postreNota: "Una opción por persona",
    bebSinAlc: ["Línea Coca Cola", "Agua con y sin gas", "Jugo natural de temporada"],
    bebConAlc: ["Fernet Branca con Coca Cola", "Aperol Spritz", "Gin Tonic (Beefeater)"],
    servicios: ["DJ o música en vivo", "Decoración personalizada", "Carpas y livings exterior"],
    precios: [
      { servicio: "Menú sin alcohol", porPersona: true, valor: "" },
      { servicio: "Alquiler espacio", porPersona: false, valor: "" },
      { servicio: "Música en vivo / DJ", porPersona: false, valor: "450000" },
      { servicio: "Decoración y ambientación", porPersona: false, valor: "Requerimientos extras se cotizan por separado", noEdit: true },
    ],
  },
  "Finger food premium": {
    recepcion: ["Barra de bebidas", "Mesa de Recepción con variedades de fiambres y quesos cordobeces, hummus y panes de nuestra panadería"],
    mainLabel: "F I N G E R  F O O D  P R E M I U M",
    main: ["Pincho de Tortilla, jamón crudo y vegetales", "Pincho de Pulpo con Salsa Anticuchero", "Taquitos de Cordero", "Arepas de pollo con Alioli de Palta", "Mollejas Laqueadas a la parrilla", "Mini Sandwich de ojo de bife con Pan de Masa madre", "Brochette de vegetales salteados", "Croquetas de Jamón serrano", "Pancho de masa madre con salchicha alemana"],
    postre: ["Flan de Dulce de Leche", "Infusión Mediana", "Torta de cumpleaños (opcional)"],
    postreNota: "Una opción por persona",
    bebSinAlc: ["Línea Coca Cola", "Agua con y sin gas", "Jugo natural de temporada"],
    bebConAlc: ["Fernet Branca con Coca Cola", "Aperol Spritz", "Gin Tonic (Beefeater)", "Achala Clos de Molle Ingrato Malbec", "Espumante Baron B brut nature"],
    servicios: ["DJ o música en vivo", "Decoración personalizada", "Carpas y livings exterior"],
    precios: [
      { servicio: "Menú sin alcohol", porPersona: true, valor: "" },
      { servicio: "Alquiler espacio", porPersona: false, valor: "" },
      { servicio: "Música en vivo / DJ", porPersona: false, valor: "450000" },
      { servicio: "Decoración y ambientación", porPersona: false, valor: "Requerimientos extras se cotizan por separado", noEdit: true },
    ],
  },
  "Merienda / Desayuno": {
    recepcion: null,
    mainLabel: "D U L C E S  Y  S A L A D O S",
    main: ["Mini Sandwich del Día", "Mix de Cookies", "Budín de Limón", "Scon de Quesos", "Chipá con Queso Azul", "Frutas", "Pan de chocolate", "Bakery Varios", "Torta Tres Leches"],
    postre: null,
    bebSinAlc: ["Línea Coca Cola", "Agua con y sin gas", "Infusiones medianas", "Jugo natural de temporada"],
    bebConAlc: null,
    servicios: null,
    precios: [
      { servicio: "Menú sin alcohol", porPersona: true, valor: "" },
      { servicio: "Alquiler espacio", porPersona: false, valor: "" },
      { servicio: "Música en vivo / DJ", porPersona: false, valor: "450000" },
      { servicio: "Decoración y ambientación", porPersona: false, valor: "Requerimientos extras se cotizan por separado", noEdit: true },
    ],
  },
  "Menú por pasos": {
    recepcion: ["Agua filtrada", "Pan de masa madre con Appetizer"],
    mainLabel: "E N T R A D A :  T A P E O",
    main: ["Hummus de Pallares", "Calamares rebozados", "Burrata con Peras Asadas"],
    principal: { label: "P R I N C I P A L :  A  E L E C C I Ó N", items: ["Ojo de bife con acompañamiento", "Pacu grillado a la Parrilla"], acomp: ["Tortilla Española", "Rúcula y Parmesano"] },
    postre: ["Flan de Dulce de Leche", "Infusión Mediana", "Torta de cumpleaños (opcional)"],
    postreNota: "Una opción por persona",
    bebSinAlc: ["Línea Coca Cola", "Agua con y sin gas", "Jugo natural de temporada"],
    bebConAlc: ["Fernet Branca con Coca Cola", "Aperol Spritz", "Gin Tonic (Beefeater)", "Achala Clos de Molle Ingrato Malbec"],
    bebConAlcNota: "Tres consumiciones por persona",
    servicios: ["DJ o música en vivo", "Decoración personalizada", "Carpas y livings exterior"],
    precios: [
      { servicio: "Menú sin alcohol", porPersona: true, valor: "" },
      { servicio: "Menú con alcohol (3 consumiciones)", porPersona: true, valor: "" },
      { servicio: "Alquiler espacio", porPersona: false, valor: "" },
      { servicio: "Música en vivo / DJ", porPersona: false, valor: "450000" },
      { servicio: "Decoración y ambientación", porPersona: false, valor: "Requerimientos extras se cotizan por separado", noEdit: true },
    ],
  },
  "Tapeo": {
    recepcion: ["Agua filtrada", "Pan de masa madre con Appetizer"],
    mainLabel: "T A P E O",
    main: ["Recepción con Variedades de quesos y fiambres", "Tortilla española, jamón crudo y vegetales", "Taquitos de Cordero", "Arepas de pollo con Alioli de Palta", "Croquetas de Jamón serrano", "Provoleta Ahumada con Miel Gratinada", "Pimientos Ahumados con anchoas"],
    postre: ["Flan de Dulce de Leche", "Infusión Mediana", "Torta de cumpleaños (opcional)"],
    postreNota: "Una opción por persona",
    bebSinAlc: ["Línea Coca Cola", "Agua con y sin gas", "Jugo natural de temporada"],
    bebConAlc: ["Fernet Branca con Coca Cola", "Aperol Spritz", "Gin Tonic (Beefeater)", "Achala Clos de Molle Ingrato Malbec"],
    bebConAlcNota: "Tres consumiciones por persona",
    servicios: ["DJ o música en vivo", "Decoración personalizada", "Carpas y livings exterior"],
    precios: [
      { servicio: "Menú sin alcohol", porPersona: true, valor: "" },
      { servicio: "Menú con alcohol (3 consumiciones)", porPersona: true, valor: "" },
      { servicio: "Alquiler espacio", porPersona: false, valor: "" },
      { servicio: "Música en vivo / DJ", porPersona: false, valor: "450000" },
      { servicio: "Decoración y ambientación", porPersona: false, valor: "Requerimientos extras se cotizan por separado", noEdit: true },
    ],
  },
};

async function imgToB64(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise(res => { const fr = new FileReader(); fr.onloadend = () => res(fr.result); fr.readAsDataURL(b); });
  } catch { return null; }
}

async function generarPropuestaPDF(ev, { menuTipo, horario, lugar, espacio, lineas, menuEdits, mainLabel }) {
  const t = PROPUESTA_TEMPLATES[menuTipo] || PROPUESTA_TEMPLATES["Finger food"];
  const me = menuEdits || {};
  const rcp  = me.recepcion !== undefined ? me.recepcion : t.recepcion;
  const main = me.main      !== undefined ? me.main      : t.main;
  const post = me.postre    !== undefined ? me.postre    : t.postre;
  const bsa  = me.bebSinAlc !== undefined ? me.bebSinAlc : t.bebSinAlc;
  const bca  = me.bebConAlc !== undefined ? me.bebConAlc : t.bebConAlc;
  const srv  = me.servicios !== undefined ? me.servicios : t.servicios;
  const principalItems = me.principalItems?.length ? me.principalItems : (t.principal ? t.principal.items : null);
  const principalAcomp = me.principalAcomp?.length ? me.principalAcomp : (t.principal ? t.principal.acomp : null);
  const principalLabel = t.principal ? t.principal.label : null;
  const efectiveMainLabel = mainLabel || t.mainLabel;

  const guests = ev.guests || 0;
  const li = item => `<li>${item}</li>`;
  const sec = (label, items, nota) => `<div class="sec"><div class="sec-lbl">${label}</div><hr class="sec-hr"><ul class="sec-ul">${items.map(li).join("")}</ul>${nota ? `<p class="sec-nota">${nota}</p>` : ""}</div>`;

  let leftCol = "";
  if (rcp && rcp.length) leftCol += sec("R E C E P C I Ó N", rcp, null);
  leftCol += sec(efectiveMainLabel, main, null);
  if (principalItems && principalItems.length) leftCol += `<div class="sec"><div class="sec-lbl">${principalLabel}</div><hr class="sec-hr"><ul class="sec-ul">${principalItems.map(li).join("")}</ul>${principalAcomp && principalAcomp.length ? `<p class="sec-nota">Acompañamiento</p><ul class="sec-ul">${principalAcomp.map(li).join("")}</ul>` : ""}</div>`;

  let rightCol = "";
  if (post && post.length) rightCol += sec("P O S T R E  O  C A F É  A  E L E C C I Ó N", post, t.postreNota);
  if (bsa  && bsa.length)  rightCol += sec("B E B I D A S  S I N  A L C O H O L  —  L I B R E", bsa, null);
  if (bca  && bca.length)  rightCol += sec("B E B I D A S  C O N  A L C O H O L", bca, t.bebConAlcNota || null);
  if (srv  && srv.length)  rightCol += sec("S E R V I C I O S  A D I C I O N A L E S", srv, null);

  const total = lineas.reduce((s, l) => {
    const n = Number(String(l.valor || "").replace(/[^0-9]/g, ""));
    if (!n) return s;
    return s + (l.porPersona ? n * guests : n);
  }, 0);

  const budgetRows = lineas.map(l => {
    const n = Number(String(l.valor || "").replace(/[^0-9]/g, ""));
    let display;
    if (l.noEdit) display = l.valor;
    else if (!n) display = "A cotizar";
    else display = `$ ${n.toLocaleString("es-AR")}${l.porPersona ? " + IVA" : ""}`;
    return `<tr><td class="b-svc">${l.servicio}</td><td class="b-val">${display}</td></tr>`;
  }).join("") + `<tr><td class="b-svc"></td><td class="b-val"></td></tr>`;

  const fechaLarga = ev.date ? new Date(ev.date + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : "";
  const FOOTER = `S T A N D A R D  6 9 &nbsp;·&nbsp; V I L L A  W A R C A L D E &nbsp;·&nbsp; C Ó R D O B A`;
  const FOOTER_FULL = `${FOOTER} &nbsp;·&nbsp; A D M S T A N D A R D 6 9 W @ G M A I L . C O M &nbsp;·&nbsp; + 5 4 9 3 5 1 8 1 4 - 7 3 7 3`;

  const BASE = window.location.origin;
  const [b64Logo, b64Portada, b64Jardin, b64Mozo, b64Brindis, b64Salon, b64Plato, b64Extra1, b64Extra2] = await Promise.all([
    imgToB64(`${BASE}/STANDARD%20NEGRO.png`),
    imgToB64(`${BASE}/FJ308007%20(2)%20(4).jpg`),
    imgToB64(`${BASE}/FJ308033%20(2).jpg`),
    imgToB64(`${BASE}/FJ301980%20(2).jpg`),
    imgToB64(`${BASE}/IMG_0381.jpeg`),
    imgToB64(`${BASE}/foto_salon.jpg`),
    imgToB64(`${BASE}/foto_plato.jpg`),
    imgToB64(`${BASE}/foto_extra1.jpg`),
    imgToB64(`${BASE}/foto_extra2.jpg`),
  ]);
  const secondRow = (b64Salon && b64Plato)
    ? `<div class="p1-sub"><div class="p1-sub-img"><img src="${b64Salon}" alt=""></div><div class="p1-sub-img"><img src="${b64Plato}" alt=""></div></div>`
    : "";
  const thirdRow = (b64Extra1 && b64Extra2)
    ? `<div class="p1-sub"><div class="p1-sub-img"><img src="${b64Extra1}" alt=""></div><div class="p1-sub-img"><img src="${b64Extra2}" alt=""></div></div>`
    : "";

  const css = `@page{size:A4;margin:0}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#2a2520;font-size:13px}.page{width:210mm;min-height:297mm;position:relative;background:#F5F0E8;page-break-after:always;overflow:hidden}.ft{position:absolute;bottom:0;left:0;right:0;background:#1a1a18;color:#888;font-size:7.5px;letter-spacing:.18em;text-transform:uppercase;text-align:center;padding:11px 20px}
/* P1 cover */.p1{display:flex;flex-direction:column;align-items:center;height:297mm;box-sizing:border-box;padding:20px 40px 42px}.p1-logo{flex-shrink:0;text-align:center;margin-bottom:0}.p1-logo img{height:38px;display:block;margin:0 auto}.p1-img{flex:2.5;min-height:0;width:100%;border-radius:3px;overflow:hidden;margin:14px 0 8px}.p1-img img{width:100%;height:100%;object-fit:cover;display:block}.p1-sub{display:flex;flex:1;min-height:0;gap:8px;width:100%;margin-bottom:8px}.p1-sub:last-of-type{margin-bottom:0}.p1-sub-img{flex:1;min-height:0;border-radius:3px;overflow:hidden}.p1-sub-img img{width:100%;height:100%;object-fit:cover;display:block}
/* P2 event info */.p2-img{width:100%;height:270px;overflow:hidden}.p2-img img{width:100%;height:100%;object-fit:cover;display:block}.p2-logo{text-align:center;padding:32px 0 24px}.p2-logo img{height:36px;display:block;margin:0 auto}.info-t{width:76%;margin:0 auto;border:1px solid #ccc;border-collapse:collapse}.info-t tr{border-bottom:1px solid #ddd}.info-t td{padding:14px 18px;font-size:12.5px}.info-t td:first-child{color:#8a8580;width:40%}.info-t td:last-child{background:#2a2520;color:#EDE8DF}
/* P3 menu */.p3{padding:48px 46px 56px}.p3-ttl{text-align:center;font-size:1.25rem;font-weight:400;margin-bottom:7px}.gline{width:30px;height:1.5px;background:#c8a870;margin:0 auto 32px}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:28px}.sec{margin-bottom:18px}.sec-lbl{font-size:7.5px;letter-spacing:.18em;text-transform:uppercase;color:#2a2520;font-weight:700;margin-bottom:5px}.sec-hr{border:none;border-top:1px solid #d0c8bc;margin-bottom:9px}.sec-ul{list-style:disc;padding-left:15px}.sec-ul li{margin-bottom:6px;font-size:11.5px;line-height:1.45}.sec-nota{font-size:10px;font-style:italic;color:#8a7a6a;margin-top:5px}
/* P4 budget */.p4{padding:48px 58px 56px}.p4-ttl{text-align:center;font-size:1.5rem;font-weight:400;letter-spacing:.08em;margin-bottom:7px}.bgt{width:100%;border-collapse:collapse;margin-top:26px}.bgt thead tr{background:#2a2520}.bgt thead th{color:#bbb;font-size:8px;letter-spacing:.16em;text-transform:uppercase;padding:13px 20px;font-weight:400;text-align:center}.b-svc{padding:17px 20px;text-align:center;font-size:13px;border-bottom:1px solid #ddd5c8}.b-val{padding:17px 20px;text-align:center;font-size:13px;border-bottom:1px solid #ddd5c8;border-left:1px solid #ddd5c8}.tot td{background:#2a2520;color:#EDE8DF;font-size:13px;padding:15px 20px;text-align:center;font-weight:500;letter-spacing:.08em}.pago{text-align:center;margin-top:52px}.pago-ttl{font-size:1.05rem;font-weight:400;margin-bottom:7px}.pago-line{font-size:11px;color:#6a6560;margin-bottom:4px}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Propuesta · ${ev.title}</title><style>${css}</style></head><body>
<div class="page p1">
  <div class="p1-logo"><img src="${b64Logo}" alt="Standard 69"></div>
  <div class="p1-img"><img src="${b64Portada}" alt=""></div>
  <div class="p1-sub">
    <div class="p1-sub-img"><img src="${b64Jardin}" alt=""></div>
    <div class="p1-sub-img"><img src="${b64Mozo}" alt=""></div>
  </div>
  ${secondRow}
  ${thirdRow}
  <div class="ft">${FOOTER}</div>
</div>
<div class="page">
  <div class="p2-img"><img src="${b64Brindis}" alt=""></div>
  <div class="p2-logo"><img src="${b64Logo}" alt="Standard 69"></div>
  <table class="info-t">
    <tr><td>Tipo de evento</td><td>${ev.type || ev.title || ""}</td></tr>
    <tr><td>Fecha del evento</td><td style="text-transform:capitalize">${fechaLarga}</td></tr>
    <tr><td>Lugar del evento</td><td>${lugar || "Villa Warcalde, Córdoba"}</td></tr>
    <tr><td>Número de invitados</td><td>${guests}</td></tr>
    <tr><td>Horario</td><td>${horario || ""}</td></tr>
    <tr><td>Espacio asignado</td><td>${espacio || ""}</td></tr>
  </table>
  <div class="ft">${FOOTER}</div>
</div>
<div class="page p3">
  <div class="p3-ttl">Descripción de la propuesta</div>
  <div class="gline"></div>
  <div class="two-col"><div>${leftCol}</div><div>${rightCol}</div></div>
  <div class="ft">${FOOTER}</div>
</div>
<div class="page p4">
  <div class="p4-ttl">PRESUPUESTO</div>
  <div class="gline"></div>
  <table class="bgt">
    <thead><tr><th>S E R V I C I O</th><th>V A L O R &nbsp; P O R &nbsp; P E R S O N A</th></tr></thead>
    <tbody>${budgetRows}<tr class="tot"><td>T O T A L</td><td>${total > 0 ? "$ " + total.toLocaleString("es-AR") + " + IVA" : "—"}</td></tr></tbody>
  </table>
  <div class="pago">
    <div class="pago-ttl">Formas de pago</div>
    <div class="gline" style="margin-bottom:14px"></div>
    <div class="pago-line">50% al momento de la reserva.</div>
    <div class="pago-line">50% el día de la realización del evento.</div>
    <div class="pago-line">El servicio de propina no está incluido en el precio.</div>
  </div>
  <div class="ft" style="font-size:7px">${FOOTER_FULL}</div>
</div>
</body></html>`;

  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}

function templateToMenuEdits(tipo) {
  const t = PROPUESTA_TEMPLATES[tipo];
  return {
    recepcion: t.recepcion ? [...t.recepcion] : [],
    main: [...t.main],
    principalItems: t.principal ? [...t.principal.items] : [],
    principalAcomp: t.principal ? [...t.principal.acomp] : [],
    postre: t.postre ? [...t.postre] : [],
    bebSinAlc: t.bebSinAlc ? [...t.bebSinAlc] : [],
    bebConAlc: t.bebConAlc ? [...t.bebConAlc] : [],
    servicios: t.servicios ? [...t.servicios] : [],
  };
}

function PropuestaModal({ ev, onClose }) {
  const defaultTipo = () => {
    const t = (ev.type || "").toLowerCase();
    if (t.includes("cumpleaños")) return "Tapeo";
    if (t.includes("merienda") || t.includes("desayuno")) return "Merienda / Desayuno";
    if (t.includes("tapeo")) return "Tapeo";
    if (t.includes("boda")) return "Finger food premium";
    if (t.includes("cena") || t.includes("aniversario")) return "Menú por pasos";
    return "Finger food";
  };
  const [menuTipo, setMenuTipo] = useState(defaultTipo());
  const [horario, setHorario] = useState("");
  const [lugar, setLugar] = useState("Villa Warcalde, Córdoba");
  const [espacio, setEspacio] = useState((ev.notes || "").match(/Sede: ([^|]+)/)?.[1]?.trim() || "");
  const [lineas, setLineas] = useState(() => PROPUESTA_TEMPLATES[defaultTipo()].precios.map(p => ({ ...p })));
  const [showMenuEdit, setShowMenuEdit] = useState(false);
  const [menuEdits, setMenuEdits] = useState(() => templateToMenuEdits(defaultTipo()));
  const [mainLabel, setMainLabel] = useState(() => PROPUESTA_TEMPLATES[defaultTipo()].mainLabel.replace(/\s{2,}/g, " "));

  const cambiarTipo = tipo => {
    setMenuTipo(tipo);
    setLineas(PROPUESTA_TEMPLATES[tipo].precios.map(p => ({ ...p })));
    setMenuEdits(templateToMenuEdits(tipo));
    setMainLabel(PROPUESTA_TEMPLATES[tipo].mainLabel.replace(/\s{2,}/g, " "));
  };
  const setL = (i, k, v) => setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const editItem = (key, idx, val) => setMenuEdits(prev => ({ ...prev, [key]: prev[key].map((v, i) => i === idx ? val : v) }));
  const addItem  = key => setMenuEdits(prev => ({ ...prev, [key]: [...prev[key], ""] }));
  const delItem  = (key, idx) => setMenuEdits(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }));

  const tpl = PROPUESTA_TEMPLATES[menuTipo];
  const hasPrincipal = !!(tpl.principal);
  const menuSections = [
    { key: "recepcion",      label: "Recepción" },
    { key: "main",           label: mainLabel, editable: true },
    { key: "postre",         label: "Postre / Café" },
    { key: "bebSinAlc",      label: "Bebidas sin alcohol" },
    { key: "bebConAlc",      label: "Bebidas con alcohol" },
    { key: "servicios",      label: "Servicios adicionales" },
  ].filter(s => menuEdits[s.key]?.length > 0);

  return (
    <Modal title="Generar Propuesta" onClose={onClose} wide>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Tipo de menú" half>
          <select value={menuTipo} onChange={e => cambiarTipo(e.target.value)} style={{ ...S.inp, appearance: "none" }}>
            {Object.keys(PROPUESTA_TEMPLATES).map(k => <option key={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Horario" half>
          <input value={horario} onChange={e => setHorario(e.target.value)} style={S.inp} placeholder="20:00 — 02:00hs" />
        </Field>
      </div>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Lugar del evento" half>
          <input value={lugar} onChange={e => setLugar(e.target.value)} style={S.inp} placeholder="Villa Warcalde, Córdoba" />
        </Field>
        <Field label="Espacio asignado" half>
          <input value={espacio} onChange={e => setEspacio(e.target.value)} style={S.inp} placeholder="Terraza, Salón..." />
        </Field>
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
          <label style={S.lbl}>Ítems del menú</label>
          <button type="button" onClick={() => setShowMenuEdit(v => !v)}
            style={{ ...S.btnS, fontSize: "0.65rem", padding: "0.25rem 0.7rem" }}>
            {showMenuEdit ? "Ocultar" : "Editar ítems"}
          </button>
        </div>
        {showMenuEdit && (
          <div style={{ ...S.card, padding: "0.75rem", background: "#0D0D0B", marginBottom: "0.75rem" }}>
            {menuSections.map(({ key, label, editable }) => (
              <div key={key} style={{ marginBottom: "1rem" }}>
                {editable ? (
                  <input
                    value={mainLabel}
                    onChange={e => setMainLabel(e.target.value)}
                    style={{ ...S.inp, fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase", color: GOLD, background: "transparent", border: "none", borderBottom: `1px solid rgba(211,154,89,0.3)`, borderRadius: 0, padding: "0 0 0.25rem 0", marginBottom: "0.5rem", fontWeight: 600 }}
                    placeholder="Nombre de la sección"
                  />
                ) : (
                  <div style={{ ...S.lbl, color: "#554030", marginBottom: "0.35rem" }}>{label}</div>
                )}
                {menuEdits[key].map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.3rem", alignItems: "center" }}>
                    <input value={item} onChange={e => editItem(key, idx, e.target.value)}
                      style={{ ...S.inp, flex: 1, fontSize: "0.78rem" }} />
                    <button type="button" onClick={() => delItem(key, idx)}
                      style={{ background: "none", border: "none", color: "#553030", cursor: "pointer", fontSize: "0.9rem", padding: "0 0.3rem" }}>×</button>
                  </div>
                ))}
                <button type="button" onClick={() => addItem(key)}
                  style={{ ...S.btnS, fontSize: "0.62rem", padding: "0.2rem 0.6rem", marginTop: "0.15rem" }}>+ ítem</button>
              </div>
            ))}
            {hasPrincipal && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ ...S.lbl, color: "#554030", marginBottom: "0.35rem" }}>Principal — platos</div>
                {menuEdits.principalItems.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.3rem", alignItems: "center" }}>
                    <input value={item} onChange={e => editItem("principalItems", idx, e.target.value)}
                      style={{ ...S.inp, flex: 1, fontSize: "0.78rem" }} />
                    <button type="button" onClick={() => delItem("principalItems", idx)}
                      style={{ background: "none", border: "none", color: "#553030", cursor: "pointer", fontSize: "0.9rem", padding: "0 0.3rem" }}>×</button>
                  </div>
                ))}
                <button type="button" onClick={() => addItem("principalItems")}
                  style={{ ...S.btnS, fontSize: "0.62rem", padding: "0.2rem 0.6rem", marginTop: "0.15rem" }}>+ ítem</button>
                <div style={{ ...S.lbl, color: "#554030", marginTop: "0.75rem", marginBottom: "0.35rem" }}>Principal — acompañamiento</div>
                {menuEdits.principalAcomp.map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.3rem", alignItems: "center" }}>
                    <input value={item} onChange={e => editItem("principalAcomp", idx, e.target.value)}
                      style={{ ...S.inp, flex: 1, fontSize: "0.78rem" }} />
                    <button type="button" onClick={() => delItem("principalAcomp", idx)}
                      style={{ background: "none", border: "none", color: "#553030", cursor: "pointer", fontSize: "0.9rem", padding: "0 0.3rem" }}>×</button>
                  </div>
                ))}
                <button type="button" onClick={() => addItem("principalAcomp")}
                  style={{ ...S.btnS, fontSize: "0.62rem", padding: "0.2rem 0.6rem", marginTop: "0.15rem" }}>+ acompañamiento</button>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <label style={S.lbl}>Líneas de presupuesto · {ev.guests} personas</label>
        <div style={{ ...S.card, padding: "0.75rem", background: "#0D0D0B" }}>
          {lineas.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: "0.6rem", marginBottom: "0.5rem", alignItems: "center" }}>
              <input value={l.servicio} onChange={e => setL(i, "servicio", e.target.value)}
                style={{ ...S.inp, flex: 2, fontSize: "0.8rem" }} />
              <input value={l.valor} onChange={e => setL(i, "valor", e.target.value)}
                disabled={l.noEdit}
                style={{ ...S.inp, flex: 1, fontSize: "0.8rem", opacity: l.noEdit ? 0.45 : 1 }}
                placeholder={l.porPersona ? "$ por persona" : "$ fijo"} />
              <span style={{ fontSize: "0.62rem", color: "#555045", whiteSpace: "nowrap", minWidth: 60 }}>
                {l.porPersona ? `× ${ev.guests} pax` : "precio fijo"}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
        <button type="button" onClick={onClose} style={S.btnS}>Cancelar</button>
        <button type="button" onClick={async e => {
          const btn = e.currentTarget;
          btn.disabled = true; btn.textContent = "Cargando imágenes...";
          try { await generarPropuestaPDF(ev, { menuTipo, horario, lugar, espacio, lineas, menuEdits, mainLabel }); onClose(); }
          catch(err) { alert("Error al generar: " + err.message); btn.disabled = false; btn.textContent = "Generar PDF"; }
        }} style={S.btnP}>Generar PDF</button>
      </div>
    </Modal>
  );
}
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

// ─── Hoja de Función PDF ──────────────────────────────────────────────────────
async function generarHojaFuncionPDF(ev, f) {
  const cfg = TIPOS_PROPUESTA_HF[f.tipoPropuesta] || TIPOS_PROPUESTA_HF["Cena / Almuerzo"];
  const fechaLarga = f.fecha ? new Date(f.fecha + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : "";
  const val = v => (v !== undefined && v !== null && String(v).trim() !== "") ? String(v).replace(/\n/g, "<br>") : '<span class="vacio"></span>';

  const datosRows = [
    ["Nombre del evento", f.nombreEvento],
    ["Cliente", f.cliente],
    ["Fecha", fechaLarga],
    ["Sucursal", f.sucursal],
    ["Espacio asignado", f.espacioAsignado],
    ["Horario", f.horario],
    ["PAX", f.pax],
    ["Nota", f.notaEvento],
  ].map(([l, v2]) => `<tr><td class="dl">${l}</td><td class="dv">${val(v2)}</td></tr>`).join("");

  const timing = (f.timing && f.timing.length) ? f.timing : [{}, {}, {}];
  const timingRows = timing.map(t =>
    `<tr><td class="t-hs">${val(t.hs)}</td><td class="t-act">${val(t.actividad)}</td><td class="t-lug">${val(t.lugar)}</td></tr>`
  ).join("");

  const gastroFields = [["Propuesta", f.propuestaGastro]];
  if (cfg.entrada)   gastroFields.push(["Entrada", f.entrada]);
  if (cfg.principal) gastroFields.push(["Principal", f.principal]);
  if (cfg.postre)    gastroFields.push(["Postre", f.postre]);
  if (cfg.bebSinAlc) gastroFields.push(["Bebidas sin alcohol", f.bebSinAlc]);
  if (cfg.bebConAlc) gastroFields.push(["Bebidas con alcohol", f.bebConAlc]);
  if (cfg.menusEsp)  gastroFields.push(["Menús especiales", f.menusEspeciales]);
  if (cfg.vajilla)   gastroFields.push(["Vajilla", f.vajilla]);
  gastroFields.push(["Nota", f.notaGastro]);
  const gastroRows = gastroFields.map(([l, v2]) => `<tr><td class="dl">${l}</td><td class="dv">${val(v2)}</td></tr>`).join("");

  const respRows = RESPONSABLES_HF.map(r =>
    `<tr><td class="r-area">${r.area}</td><td class="r-pers">${val(f[r.key])}</td><td class="r-tarea">${r.tarea}</td></tr>`
  ).join("");

  const FOOTER = `S T A N D A R D  6 9 &nbsp;·&nbsp; V I L L A  W A R C A L D E &nbsp;·&nbsp; C Ó R D O B A`;
  const BASE = window.location.origin;
  const b64Logo = await imgToB64(`${BASE}/STANDARD%20NEGRO.png`);

  const css = `@page{size:A4;margin:0}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#2a2520;font-size:12px}
.page{width:210mm;min-height:297mm;background:#fff;padding:30px 42px 56px;page-break-after:always;position:relative;box-sizing:border-box}
.hf-logo{text-align:center;margin-bottom:14px}.hf-logo img{height:30px;display:block;margin:0 auto}
.hf-ttl{text-align:center;font-size:1.15rem;letter-spacing:.2em;text-transform:uppercase;margin-bottom:4px;font-weight:600}
.hf-sub{text-align:center;font-size:11px;color:#8a8580;margin-bottom:18px;text-transform:capitalize}
.sec-bar{background:#1a1a18;color:#fff;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;padding:8px 14px;margin:16px 0 0;font-weight:600}
.dl-table{width:100%;border-collapse:collapse;margin-bottom:4px}
.dl-table tr{border-bottom:1px solid #e5ddd0}
.dl-table .dl{width:30%;padding:8px 14px;color:#8a8580;font-size:10.5px;letter-spacing:.04em}
.dl-table .dv{padding:8px 14px;font-size:12px}
.vacio{display:inline-block;width:60%;border-bottom:1px solid #ccc;height:11px}
.t-table{width:100%;border-collapse:collapse;margin-bottom:4px}
.t-table th{background:#D39A59;color:#1a1a18;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;padding:8px 10px;font-weight:700;text-align:left}
.t-table td{padding:9px 10px;border-bottom:1px solid #e5ddd0;font-size:11.5px}
.t-hs{width:13%}.t-lug{width:22%}
.r-table{width:100%;border-collapse:collapse}
.r-table th{background:#D39A59;color:#1a1a18;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;padding:8px 10px;font-weight:700;text-align:left}
.r-table td{padding:11px 10px;border-bottom:1px solid #e5ddd0;font-size:11.5px;vertical-align:top}
.r-area{width:22%;font-weight:600}.r-pers{width:26%}.r-tarea{color:#6a6560}
.tipo-badge{display:inline-block;background:#D39A59;color:#1a1a18;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;padding:4px 12px;border-radius:12px;margin:10px 0 6px;font-weight:700}
.pedido-box{border:1px solid #e5ddd0;border-radius:4px;padding:16px;min-height:160px;font-size:12px;line-height:1.7;margin-top:10px}
.ft{position:absolute;bottom:0;left:0;right:0;background:#1a1a18;color:#888;font-size:7.5px;letter-spacing:.18em;text-transform:uppercase;text-align:center;padding:11px 20px}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>HojaFuncion_${f.nombreEvento || ev.title}_${f.fecha || ev.date}</title><style>${css}</style></head><body>
<div class="page">
  ${b64Logo ? `<div class="hf-logo"><img src="${b64Logo}" alt="Standard 69"></div>` : ""}
  <div class="hf-ttl">Hoja de Función</div>
  <div class="hf-sub">${fechaLarga || ""}</div>

  <div class="sec-bar">01 — Datos del evento</div>
  <table class="dl-table">${datosRows}</table>

  <div class="sec-bar">02 — Timing</div>
  <table class="t-table">
    <thead><tr><th>HS</th><th>Actividad</th><th>Lugar</th></tr></thead>
    <tbody>${timingRows}</tbody>
  </table>

  <div class="sec-bar">03 — Gastronomía</div>
  <div class="tipo-badge">${f.tipoPropuesta}</div>
  <table class="dl-table">${gastroRows}</table>

  <div class="ft">${FOOTER}</div>
</div>
<div class="page">
  ${b64Logo ? `<div class="hf-logo"><img src="${b64Logo}" alt="Standard 69"></div>` : ""}
  <div class="hf-ttl">Hoja de Función</div>
  <div class="hf-sub">${f.nombreEvento || ev.title || ""}</div>

  <div class="sec-bar">04 — Responsables por área</div>
  <table class="r-table">
    <thead><tr><th>Área</th><th>Persona asignada</th><th>Tarea principal</th></tr></thead>
    <tbody>${respRows}</tbody>
  </table>

  <div class="sec-bar">05 — Pedidos especiales</div>
  <div class="pedido-box">${f.pedidosEspeciales ? String(f.pedidosEspeciales).replace(/\n/g, "<br>") : '<span style="color:#bbb">—</span>'}</div>

  <div class="ft">${FOOTER}</div>
</div>
</body></html>`;

  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 600);
}

function HojaFuncionModal({ ev, hoja, onSave, onClose }) {
  const [f, setF] = useState(() => hoja ? { ...blankHojaFuncion(ev), ...hoja } : blankHojaFuncion(ev));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setTiming = (idx, k, v) => setF(p => ({ ...p, timing: p.timing.map((t, i) => i === idx ? { ...t, [k]: v } : t) }));
  const addTiming = () => setF(p => ({ ...p, timing: [...p.timing, { hs: "", actividad: "", lugar: "" }] }));
  const delTiming = idx => setF(p => ({ ...p, timing: p.timing.filter((_, i) => i !== idx) }));

  const cfg = TIPOS_PROPUESTA_HF[f.tipoPropuesta] || TIPOS_PROPUESTA_HF["Cena / Almuerzo"];

  const submit = async () => {
    setSaving(true);
    try { await onSave(f); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="Hoja de Función" onClose={onClose} wide>
      <div style={{ ...S.lbl, color: GOLD, marginBottom: "0.5rem" }}>01 · Datos del evento</div>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Nombre del evento" half>
          <input value={f.nombreEvento} onChange={e => set("nombreEvento", e.target.value)} style={S.inp} />
        </Field>
        <Field label="Cliente" half>
          <input value={f.cliente} onChange={e => set("cliente", e.target.value)} style={S.inp} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Fecha" half>
          <input type="date" value={f.fecha} onChange={e => set("fecha", e.target.value)} style={S.inp} />
        </Field>
        <Field label="Sucursal" half>
          <select value={f.sucursal} onChange={e => set("sucursal", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
            {SUCURSALES_HF.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Espacio asignado" half>
          <input value={f.espacioAsignado} onChange={e => set("espacioAsignado", e.target.value)} style={S.inp} placeholder="Rooftop, Salón Principal..." />
        </Field>
        <Field label="Horario" half>
          <input value={f.horario} onChange={e => set("horario", e.target.value)} style={S.inp} placeholder="19:00 a 23:00 hs" />
        </Field>
      </div>
      <Field label="PAX">
        <input type="number" value={f.pax} onChange={e => set("pax", e.target.value)} style={S.inp} />
      </Field>
      <Field label="Nota">
        <textarea value={f.notaEvento} onChange={e => set("notaEvento", e.target.value)} style={{ ...S.inp, minHeight: 60, resize: "vertical" }} />
      </Field>

      <div style={{ ...S.lbl, color: GOLD, margin: "1.25rem 0 0.5rem" }}>02 · Timing</div>
      <div style={{ ...S.card, padding: "0.75rem", background: "#0D0D0B" }}>
        {f.timing.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem", alignItems: "center" }}>
            <input value={t.hs} onChange={e => setTiming(i, "hs", e.target.value)} style={{ ...S.inp, width: 80, fontSize: "0.78rem" }} placeholder="HS" />
            <input value={t.actividad} onChange={e => setTiming(i, "actividad", e.target.value)} style={{ ...S.inp, flex: 2, fontSize: "0.78rem" }} placeholder="Actividad" />
            <input value={t.lugar} onChange={e => setTiming(i, "lugar", e.target.value)} style={{ ...S.inp, flex: 1, fontSize: "0.78rem" }} placeholder="Lugar" />
            <button type="button" onClick={() => delTiming(i)}
              style={{ background: "none", border: "none", color: "#553030", cursor: "pointer", fontSize: "0.9rem", padding: "0 0.3rem" }}>×</button>
          </div>
        ))}
        <button type="button" onClick={addTiming} style={{ ...S.btnS, fontSize: "0.62rem", padding: "0.2rem 0.6rem", marginTop: "0.15rem" }}>+ fila</button>
      </div>

      <div style={{ ...S.lbl, color: GOLD, margin: "1.25rem 0 0.5rem" }}>03 · Gastronomía</div>
      <Field label="Tipo de propuesta">
        <select value={f.tipoPropuesta} onChange={e => set("tipoPropuesta", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
          {Object.keys(TIPOS_PROPUESTA_HF).map(t => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Propuesta">
        <select value={f.propuestaGastro} onChange={e => set("propuestaGastro", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
          <option value="">Seleccionar...</option>
          {MENU_TIPOS.map(m => <option key={m.nombre}>{m.nombre}</option>)}
        </select>
      </Field>
      {cfg.entrada && (
        <Field label="Entrada">
          <textarea value={f.entrada} onChange={e => set("entrada", e.target.value)} style={{ ...S.inp, minHeight: 50, resize: "vertical" }} />
        </Field>
      )}
      {cfg.principal && (
        <Field label="Principal">
          <textarea value={f.principal} onChange={e => set("principal", e.target.value)} style={{ ...S.inp, minHeight: 50, resize: "vertical" }} />
        </Field>
      )}
      {cfg.postre && (
        <Field label="Postre">
          <textarea value={f.postre} onChange={e => set("postre", e.target.value)} style={{ ...S.inp, minHeight: 50, resize: "vertical" }} />
        </Field>
      )}
      {cfg.bebSinAlc && (
        <Field label="Bebidas sin alcohol">
          <textarea value={f.bebSinAlc} onChange={e => set("bebSinAlc", e.target.value)} style={{ ...S.inp, minHeight: 50, resize: "vertical" }} />
        </Field>
      )}
      {cfg.bebConAlc && (
        <Field label="Bebidas con alcohol">
          <textarea value={f.bebConAlc} onChange={e => set("bebConAlc", e.target.value)} style={{ ...S.inp, minHeight: 50, resize: "vertical" }} />
        </Field>
      )}
      {cfg.menusEsp && (
        <Field label="Menús especiales">
          <textarea value={f.menusEspeciales} onChange={e => set("menusEspeciales", e.target.value)} style={{ ...S.inp, minHeight: 50, resize: "vertical" }} />
        </Field>
      )}
      {cfg.vajilla && (
        <Field label="Vajilla">
          <input value={f.vajilla} onChange={e => set("vajilla", e.target.value)} style={S.inp} />
        </Field>
      )}
      <Field label="Nota">
        <textarea value={f.notaGastro} onChange={e => set("notaGastro", e.target.value)} style={{ ...S.inp, minHeight: 50, resize: "vertical" }} />
      </Field>

      <div style={{ ...S.lbl, color: GOLD, margin: "1.25rem 0 0.5rem" }}>04 · Responsables por área</div>
      <div style={{ ...S.card, padding: "0.75rem", background: "#0D0D0B" }}>
        {RESPONSABLES_HF.map(r => (
          <div key={r.key} style={{ display: "flex", gap: "0.6rem", marginBottom: "0.5rem", alignItems: "center" }}>
            <div style={{ flex: 1, fontSize: "0.78rem", color: "#B0A898" }}>
              <div style={{ color: "#F0EAD8" }}>{r.area}</div>
              <div style={{ fontSize: "0.65rem", color: "#555045", marginTop: 2 }}>{r.tarea}</div>
            </div>
            <input value={f[r.key]} onChange={e => set(r.key, e.target.value)} style={{ ...S.inp, flex: 1, fontSize: "0.78rem" }} placeholder="Persona asignada" />
          </div>
        ))}
      </div>

      <div style={{ ...S.lbl, color: GOLD, margin: "1.25rem 0 0.5rem" }}>05 · Pedidos especiales</div>
      <Field label="Nota">
        <textarea value={f.pedidosEspeciales} onChange={e => set("pedidosEspeciales", e.target.value)} style={{ ...S.inp, minHeight: 90, resize: "vertical" }} placeholder="Cualquier requerimiento fuera de lo estándar..." />
      </Field>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem", marginTop: "1rem" }}>
        <button type="button" onClick={() => generarHojaFuncionPDF(ev, f)} style={S.btnS}>Descargar PDF</button>
        <button type="button" onClick={submit} disabled={saving} style={{ ...S.btnP, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Guardando..." : "Guardar"}
        </button>
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
  const curMes = todayStr().slice(0, 7);
  const [period, setPeriod] = useState(curMes);
  const months = useMemo(() =>
    [...new Set(events.map(e => e.date?.slice(0,7)).filter(Boolean))].sort().reverse(),
    [events]);

  const filtered = (period === "all" ? events : events.filter(e => (e.date || "").startsWith(period)))
    .sort((a, b) => a.date > b.date ? 1 : -1);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.5rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>Operaciones</h1>
          <div style={{ color: "#3A3530", fontSize: "0.72rem", marginTop: 4 }}>{filtered.length} evento{filtered.length !== 1 ? "s" : ""}</div>
        </div>
        <select value={period} onChange={e => setPeriod(e.target.value)}
          style={{ ...S.inp, width: 190, textTransform: "capitalize" }}>
          <option value="all">Todo el período</option>
          {months.map(m => <option key={m} value={m}>{fmtMes(m)}</option>)}
        </select>
      </div>
      {filtered.length === 0
        ? <div style={{ ...S.card, textAlign: "center", color: "#3A3530", fontSize: "0.85rem", padding: "3rem" }}>Sin eventos para este período.</div>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "0.875rem" }}>
            {filtered.map(ev => <EventOpCard key={ev.id} ev={ev} ops={operaciones.filter(o => o.eventId === ev.id)} onClick={() => setOpEventId(ev.id)} />)}
          </div>
      }
    </div>
  );
}

// ─── Operaciones Detail ───────────────────────────────────────────────────────
function OperacionDetalle({ ev, ops, recetas, equipoBase, hojasFuncion, onAdd, onAddBulk, onUpdate, onDelete, onBack, onSaveHojaFuncion }) {
  const [tab, setTab] = useState("menu");
  const [showPropuesta, setShowPropuesta] = useState(false);
  const [showHoja, setShowHoja] = useState(false);
  const hoja = hojasFuncion?.find(h => h.eventId === ev.id) || null;
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
        <div style={{ display: "flex", gap: "0.625rem" }}>
          <button type="button" onClick={() => setShowHoja(true)} style={S.btnS}>Hoja de función</button>
          <button type="button" onClick={() => exportarPDF(ev, ops)} style={S.btnS}>Hoja de operaciones</button>
          <button type="button" onClick={() => setShowPropuesta(true)} style={S.btnP}>Generar presupuesto</button>
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: "1px solid #1C1C18", marginBottom: "1.5rem" }}>
        {tabs.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            style={{ padding: "0.6rem 1.25rem", background: "none", border: "none", borderBottom: tab === t.id ? `2px solid ${GOLD}` : "2px solid transparent", color: tab === t.id ? GOLD : "#4A4540", cursor: "pointer", fontFamily: "inherit", fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>
      {showPropuesta && <PropuestaModal ev={ev} onClose={() => setShowPropuesta(false)} />}
      {showHoja && <HojaFuncionModal ev={ev} hoja={hoja} onSave={onSaveHojaFuncion} onClose={() => setShowHoja(false)} />}
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
        <button type="button" onClick={() => setShow(!show)} style={S.btnP}>+ Agregar plato</button>
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

// ─── Marketing ────────────────────────────────────────────────────────────────
const PLATFORMS = ["Meta Ads", "LinkedIn"];
const MKT_OBJECTIVES = ["Reconocimiento", "Tráfico", "Leads", "Conversiones", "Interacción"];
const PLATFORM_COLORS = {
  "Meta Ads":  { primary: "#1877F2", bg: "rgba(24,119,242,0.10)", bd: "rgba(24,119,242,0.25)" },
  "LinkedIn":  { primary: "#0A66C2", bg: "rgba(10,102,194,0.10)", bd: "rgba(10,102,194,0.25)" },
};

const parseMarketing = r => ({
  ...r,
  id: toNum(r.id),
  budget: toNum(r.budget),
  spent: toNum(r.spent),
  impressions: toNum(r.impressions),
  clicks: toNum(r.clicks),
  leads: toNum(r.leads),
  date: toDate(r.date),
});

function PlatformBadge({ platform }) {
  const c = PLATFORM_COLORS[platform] || PLATFORM_COLORS["Meta Ads"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: c.bg, border: `1px solid ${c.bd}`, fontSize: "0.68rem", fontWeight: 500, color: c.primary }}>
      {platform}
    </span>
  );
}

function MarketingForm({ initial, onSave, onClose }) {
  const blank = { platform: "Meta Ads", campaign: "", objective: "Leads", date: todayStr().slice(0, 7) + "-01", budget: "", spent: "", impressions: "", clicks: "", leads: "", notes: "" };
  const [f, setF] = useState(initial ? { ...blank, ...initial, budget: initial.budget ?? "", spent: initial.spent ?? "", impressions: initial.impressions ?? "", clicks: initial.clicks ?? "", leads: initial.leads ?? "" } : blank);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const submit = () => {
    if (!f.campaign.trim()) { alert("Ingresá el nombre de campaña."); return; }
    if (!f.spent && f.spent !== 0) { alert("Ingresá el monto invertido."); return; }
    onSave({
      ...f,
      budget: f.budget !== "" ? parseFloat(f.budget) : null,
      spent: parseFloat(f.spent) || 0,
      impressions: f.impressions !== "" ? parseInt(f.impressions) : null,
      clicks: f.clicks !== "" ? parseInt(f.clicks) : null,
      leads: f.leads !== "" ? parseInt(f.leads) : null,
    });
  };
  return (
    <Modal title={initial ? "Editar campaña" : "Nueva campaña"} onClose={onClose} wide>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Plataforma" half>
          <select value={f.platform} onChange={e => set("platform", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
            {PLATFORMS.map(p => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Objetivo" half>
          <select value={f.objective} onChange={e => set("objective", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
            {MKT_OBJECTIVES.map(o => <option key={o}>{o}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Nombre de campaña *">
        <input value={f.campaign} onChange={e => set("campaign", e.target.value)} style={S.inp} placeholder="Ej: Standard 69 — Eventos Corporativos Mayo" />
      </Field>
      <Field label="Período (mes)">
        <input type="month" value={f.date?.slice(0, 7)} onChange={e => set("date", e.target.value + "-01")} style={S.inp} />
      </Field>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Presupuesto (ARS)" half>
          <input type="number" value={f.budget} onChange={e => set("budget", e.target.value)} style={S.inp} placeholder="0" />
        </Field>
        <Field label="Invertido (ARS) *" half>
          <input type="number" value={f.spent} onChange={e => set("spent", e.target.value)} style={S.inp} placeholder="0" />
        </Field>
      </div>
      <div style={{ display: "flex", gap: "1rem" }}>
        <Field label="Impresiones" half>
          <input type="number" value={f.impressions} onChange={e => set("impressions", e.target.value)} style={S.inp} placeholder="0" />
        </Field>
        <Field label="Clics" half>
          <input type="number" value={f.clicks} onChange={e => set("clicks", e.target.value)} style={S.inp} placeholder="0" />
        </Field>
      </div>
      <Field label="Leads / Conversiones">
        <input type="number" value={f.leads} onChange={e => set("leads", e.target.value)} style={S.inp} placeholder="0" />
      </Field>
      <Field label="Notas">
        <input value={f.notes} onChange={e => set("notes", e.target.value)} style={S.inp} placeholder="Segmentación, creatividades, observaciones..." />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem", marginTop: "0.5rem" }}>
        <button type="button" onClick={onClose} style={S.btnS}>Cancelar</button>
        <button type="button" onClick={submit} style={S.btnP}>Guardar</button>
      </div>
    </Modal>
  );
}

function Marketing({ marketing, onAdd, onUpdate, onDelete }) {
  const [platform, setPlatform] = useState("Meta Ads");
  const [form, setForm] = useState(null); // null | "new" | record object

  const filtered = marketing.filter(r => r.platform === platform);
  const all = marketing;

  const totalSpent      = filtered.reduce((s, r) => s + (r.spent || 0), 0);
  const totalLeads      = filtered.reduce((s, r) => s + (r.leads || 0), 0);
  const totalClicks     = filtered.reduce((s, r) => s + (r.clicks || 0), 0);
  const totalImpr       = filtered.reduce((s, r) => s + (r.impressions || 0), 0);
  const cpl             = totalLeads > 0 ? totalSpent / totalLeads : null;
  const ctr             = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : null;
  const totalSpentAll   = all.reduce((s, r) => s + (r.spent || 0), 0);

  // Monthly chart data (all platforms combined, last 6 months)
  const months = useMemo(() => {
    const ms = [...new Set(all.map(r => r.date?.slice(0, 7)).filter(Boolean))].sort().slice(-6);
    return ms;
  }, [all]);

  const chartData = months.map(m => ({
    m,
    meta: all.filter(r => r.date?.slice(0, 7) === m && r.platform === "Meta Ads").reduce((s, r) => s + (r.spent || 0), 0),
    li:   all.filter(r => r.date?.slice(0, 7) === m && r.platform === "LinkedIn").reduce((s, r) => s + (r.spent || 0), 0),
  }));
  const maxChart = Math.max(...chartData.map(d => Math.max(d.meta, d.li)), 1);

  const sorted = [...filtered].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const pc = PLATFORM_COLORS[platform];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.5rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>Marketing</h1>
          <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>Inversión publicitaria · Standard 69</div>
        </div>
        <button type="button" onClick={() => setForm("new")} style={S.btnP}>+ Nueva campaña</button>
      </div>

      {/* Platform tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: "1.75rem", borderBottom: "1px solid #1C1C18" }}>
        {PLATFORMS.map(p => {
          const c = PLATFORM_COLORS[p];
          const active = platform === p;
          const cnt = marketing.filter(r => r.platform === p).length;
          return (
            <button key={p} type="button" onClick={() => setPlatform(p)} style={{
              padding: "0.65rem 1.5rem", background: "none", border: "none",
              borderBottom: active ? `2px solid ${c.primary}` : "2px solid transparent",
              color: active ? c.primary : "#4A4540", cursor: "pointer",
              fontFamily: "inherit", fontSize: "0.78rem", letterSpacing: "0.1em",
              textTransform: "uppercase", marginBottom: -1, display: "flex", alignItems: "center", gap: "0.5rem"
            }}>
              {p}
              {cnt > 0 && <span style={{ background: active ? c.bg : "rgba(255,255,255,0.05)", color: active ? c.primary : "#555045", border: `1px solid ${active ? c.bd : "#1C1C18"}`, borderRadius: 10, fontSize: "0.6rem", padding: "1px 7px", fontWeight: 600 }}>{cnt}</span>}
            </button>
          );
        })}
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.875rem", marginBottom: "1.75rem" }}>
        {[
          { lbl: "Total invertido",  val: fmtARS(totalSpent),   color: pc.primary },
          { lbl: "Leads generados",  val: totalLeads > 0 ? totalLeads.toLocaleString("es-AR") : "—", color: "#34D399" },
          { lbl: "Costo por lead",   val: cpl != null ? fmtARS(Math.round(cpl)) : "—", color: GOLD },
          { lbl: "CTR",              val: ctr != null ? `${ctr.toFixed(2)}%` : "—", sub: `${totalClicks.toLocaleString("es-AR")} clics`, color: "#A78BFA" },
        ].map((s, i) => (
          <div key={i} style={S.card}>
            <div style={S.lbl}>{s.lbl}</div>
            <div style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.6rem", fontWeight: 300, color: s.color, lineHeight: 1.1 }}>{s.val}</div>
            {s.sub && <div style={{ fontSize: "0.68rem", color: "#4A4540", marginTop: 3 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "1.125rem", marginBottom: "1.5rem" }}>
        {/* Bar chart — inversión mensual por plataforma */}
        <div style={S.card}>
          <div style={{ fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6A6055", marginBottom: "1.25rem" }}>Inversión mensual por plataforma</div>
          {chartData.length === 0 && <div style={{ color: "#4A4540", fontSize: "0.875rem" }}>Sin datos aún</div>}
          <div style={{ display: "flex", gap: "0.625rem", alignItems: "flex-end", height: 110 }}>
            {chartData.map(d => (
              <div key={d.m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "stretch", height: "100%", gap: 0, justifyContent: "flex-end" }}>
                <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: "100%" }}>
                  <div title={`Meta Ads: ${fmtARS(d.meta)}`} style={{ flex: 1, height: `${Math.round((d.meta / maxChart) * 100)}%`, minHeight: d.meta > 0 ? 4 : 0, background: "rgba(24,119,242,0.5)", borderRadius: "3px 3px 0 0" }} />
                  <div title={`LinkedIn: ${fmtARS(d.li)}`} style={{ flex: 1, height: `${Math.round((d.li / maxChart) * 100)}%`, minHeight: d.li > 0 ? 4 : 0, background: "rgba(10,102,194,0.5)", borderRadius: "3px 3px 0 0" }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.625rem", marginTop: "0.5rem" }}>
            {chartData.map(d => <div key={d.m} style={{ flex: 1, textAlign: "center", fontSize: "0.58rem", color: "#454035", textTransform: "capitalize" }}>{new Date(d.m + "-01").toLocaleDateString("es-AR", { month: "short" })}</div>)}
          </div>
          <div style={{ display: "flex", gap: "1.25rem", marginTop: "0.75rem" }}>
            <span style={{ fontSize: "0.68rem", color: "rgba(24,119,242,0.9)" }}>■ Meta Ads</span>
            <span style={{ fontSize: "0.68rem", color: "rgba(10,102,194,0.9)" }}>■ LinkedIn</span>
          </div>
        </div>

        {/* Resumen comparativo plataformas */}
        <div style={S.card}>
          <div style={{ fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6A6055", marginBottom: "1.125rem" }}>Comparativa de plataformas</div>
          {PLATFORMS.map(p => {
            const pc2 = PLATFORM_COLORS[p];
            const sp  = all.filter(r => r.platform === p).reduce((s, r) => s + (r.spent || 0), 0);
            const ld  = all.filter(r => r.platform === p).reduce((s, r) => s + (r.leads || 0), 0);
            const pct = totalSpentAll > 0 ? Math.round((sp / totalSpentAll) * 100) : 0;
            return (
              <div key={p} style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                  <span style={{ fontSize: "0.78rem", color: pc2.primary }}>{p}</span>
                  <span style={{ fontSize: "0.78rem", color: "#B0A898", fontWeight: 500 }}>{fmtARS(sp)}</span>
                </div>
                <div style={{ height: 5, background: "#1A1A18", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: pc2.primary, borderRadius: 3, opacity: 0.7 }} />
                </div>
                <div style={{ fontSize: "0.65rem", color: "#454035", marginTop: "0.25rem" }}>{ld} leads · {pct}% del gasto</div>
              </div>
            );
          })}
          {totalSpentAll === 0 && <div style={{ color: "#4A4540", fontSize: "0.875rem" }}>Sin inversión registrada</div>}
          {totalSpentAll > 0 && (
            <div style={{ marginTop: "0.875rem", paddingTop: "0.75rem", borderTop: "1px solid #181818", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.75rem", color: "#555045" }}>Total invertido</span>
              <span style={{ fontSize: "0.875rem", color: "#EDE8DF", fontWeight: 600 }}>{fmtARS(totalSpentAll)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabla de campañas */}
      <div style={S.card}>
        <div style={{ fontSize: "0.68rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6A6055", marginBottom: "1rem" }}>
          Campañas · {platform}
        </div>
        {sorted.length === 0 && (
          <div style={{ color: "#4A4540", fontSize: "0.875rem", padding: "1.5rem 0" }}>
            Sin campañas registradas para {platform}. Agregá la primera con "+ Nueva campaña".
          </div>
        )}
        {sorted.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Período", "Campaña", "Objetivo", "Invertido", "Impresiones", "Clics", "Leads", "CPL", ""].map((h, i) => (
                  <th key={i} style={{ ...S.th, padding: "0 0.75rem 0.6rem 0", textAlign: i >= 3 && i < 8 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => {
                const rCpl = r.leads > 0 ? r.spent / r.leads : null;
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid #181818" }}>
                    <td style={{ padding: "0.6rem 0.75rem 0.6rem 0", fontSize: "0.78rem", color: "#7A7260", whiteSpace: "nowrap" }}>
                      {r.date ? new Date(r.date + "T00:00:00").toLocaleDateString("es-AR", { month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem 0.6rem 0", fontSize: "0.825rem", color: "#F0EAD8", maxWidth: 220 }}>
                      <div>{r.campaign}</div>
                      {r.notes && <div style={{ fontSize: "0.68rem", color: "#555045", marginTop: 2 }}>{r.notes}</div>}
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem 0.6rem 0", fontSize: "0.72rem", color: "#7A7260" }}>{r.objective || "—"}</td>
                    <td style={{ padding: "0.6rem 0.75rem 0.6rem 0", fontSize: "0.825rem", color: pc.primary, fontWeight: 500, textAlign: "right", whiteSpace: "nowrap" }}>{fmtARS(r.spent)}</td>
                    <td style={{ padding: "0.6rem 0.75rem 0.6rem 0", fontSize: "0.78rem", color: "#7A7260", textAlign: "right" }}>{r.impressions != null ? r.impressions.toLocaleString("es-AR") : "—"}</td>
                    <td style={{ padding: "0.6rem 0.75rem 0.6rem 0", fontSize: "0.78rem", color: "#7A7260", textAlign: "right" }}>{r.clicks != null ? r.clicks.toLocaleString("es-AR") : "—"}</td>
                    <td style={{ padding: "0.6rem 0.75rem 0.6rem 0", fontSize: "0.78rem", color: "#34D399", textAlign: "right", fontWeight: r.leads > 0 ? 600 : 400 }}>{r.leads != null ? r.leads : "—"}</td>
                    <td style={{ padding: "0.6rem 0.75rem 0.6rem 0", fontSize: "0.78rem", color: GOLD, textAlign: "right", whiteSpace: "nowrap" }}>{rCpl != null ? fmtARS(Math.round(rCpl)) : "—"}</td>
                    <td style={{ padding: "0.6rem 0 0.6rem 0.75rem", whiteSpace: "nowrap" }}>
                      <button type="button" onClick={() => setForm(r)} style={{ ...S.btnS, padding: "0.25rem 0.6rem", fontSize: "0.72rem", marginRight: 4 }}>Editar</button>
                      <button type="button" onClick={() => { if (window.confirm("¿Eliminar campaña?")) onDelete(r.id); }} style={{ ...S.btnS, padding: "0.25rem 0.6rem", fontSize: "0.72rem", color: "#D05050", borderColor: "rgba(208,80,80,0.25)" }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "1px solid #2A2A28" }}>
                <td colSpan={3} style={{ padding: "0.6rem 0.75rem 0.6rem 0", fontSize: "0.68rem", color: "#454035", letterSpacing: "0.1em", textTransform: "uppercase" }}>Total {platform}</td>
                <td style={{ padding: "0.6rem 0.75rem 0.6rem 0", fontSize: "0.875rem", color: pc.primary, fontWeight: 600, textAlign: "right" }}>{fmtARS(totalSpent)}</td>
                <td style={{ padding: "0.6rem 0.75rem 0.6rem 0", textAlign: "right", fontSize: "0.78rem", color: "#555045" }}>{totalImpr > 0 ? totalImpr.toLocaleString("es-AR") : "—"}</td>
                <td style={{ padding: "0.6rem 0.75rem 0.6rem 0", textAlign: "right", fontSize: "0.78rem", color: "#555045" }}>{totalClicks > 0 ? totalClicks.toLocaleString("es-AR") : "—"}</td>
                <td style={{ padding: "0.6rem 0.75rem 0.6rem 0", textAlign: "right", fontSize: "0.78rem", color: "#34D399", fontWeight: 600 }}>{totalLeads > 0 ? totalLeads : "—"}</td>
                <td style={{ padding: "0.6rem 0.75rem 0.6rem 0", textAlign: "right", fontSize: "0.78rem", color: GOLD }}>{cpl != null ? fmtARS(Math.round(cpl)) : "—"}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {form && (
        <MarketingForm
          initial={form === "new" ? { platform } : form}
          onSave={d => {
            if (form === "new" || !form.id) onAdd(d);
            else onUpdate({ ...form, ...d });
            setForm(null);
          }}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}

// ─── Usuarios ─────────────────────────────────────────────────────────────────
const ROLE_LABELS  = { admin: "Administrador", operacion: "Operación" };
const ROLE_COLORS  = { admin: GOLD, operacion: "#7EB89A" };
const ROLE_MODULES = {
  admin:     "Acceso completo",
  operacion: "Sin acceso a P & L ni Pagos",
};

function UserManagement({ usuarios, currentUser, onCreate, onToggle, onResetPassword, onChangeRole }) {
  const [showNew,   setShowNew]   = useState(false);
  const [pwdUser,   setPwdUser]   = useState(null);  // usuario al que resetear pwd
  const [newForm,   setNewForm]   = useState({ nombre: "", email: "", password: "", role: "operacion" });
  const [pwdForm,   setPwdForm]   = useState({ password: "", confirm: "" });
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState("");

  const setN = (k, v) => setNewForm(p => ({ ...p, [k]: v }));
  const setP = (k, v) => setPwdForm(p => ({ ...p, [k]: v }));

  const submitNew = async () => {
    if (!newForm.nombre.trim() || !newForm.email.trim() || !newForm.password.trim()) {
      setErr("Completá todos los campos."); return;
    }
    if (newForm.password.length < 6) { setErr("Mínimo 6 caracteres."); return; }
    setSaving(true); setErr("");
    try {
      await onCreate(newForm);
      setNewForm({ nombre: "", email: "", password: "", role: "operacion" });
      setShowNew(false);
    } catch(e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const submitPwd = async () => {
    if (!pwdForm.password.trim()) { setErr("Ingresá la nueva contraseña."); return; }
    if (pwdForm.password.length < 6) { setErr("Mínimo 6 caracteres."); return; }
    if (pwdForm.password !== pwdForm.confirm) { setErr("Las contraseñas no coinciden."); return; }
    setSaving(true); setErr("");
    try {
      await onResetPassword(pwdUser, pwdForm.password);
      setPwdUser(null); setPwdForm({ password: "", confirm: "" });
    } catch(e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const isActive = u => u.active === true || String(u.active).toLowerCase() === "true";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: "'Jost',sans-serif", fontSize: "1.5rem", fontWeight: 400, color: "#EDE8DF", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>Usuarios</h1>
          <div style={{ color: "#555045", fontSize: "0.78rem", marginTop: 2 }}>Accesos al sistema · Standard 69</div>
        </div>
        <button type="button" onClick={() => { setShowNew(true); setErr(""); }} style={S.btnP}>+ Nuevo usuario</button>
      </div>

      {/* Roles info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem", marginBottom: "1.5rem" }}>
        {Object.entries(ROLE_MODULES).map(([role, desc]) => (
          <div key={role} style={S.card}>
            <span style={{ display: "inline-block", fontSize: "0.68rem", padding: "2px 10px", borderRadius: 20, background: "rgba(0,0,0,0.35)", border: `1px solid rgba(${role === "admin" ? "211,154,89" : "126,184,154"},0.3)`, color: ROLE_COLORS[role], marginBottom: "0.5rem" }}>
              {ROLE_LABELS[role]}
            </span>
            <div style={{ fontSize: "0.78rem", color: "#7A7260" }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* User list */}
      <div style={S.card}>
        {usuarios.length === 0 && <div style={{ color: "#4A4540", fontSize: "0.875rem" }}>Sin usuarios registrados.</div>}
        {usuarios.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Nombre / Email", "Rol", "Estado", "Acciones"].map((h, i) => (
                  <th key={i} style={{ ...S.th, padding: "0 1rem 0.75rem 0", textAlign: i === 3 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => {
                const isMe = String(u.email).toLowerCase() === String(currentUser.email).toLowerCase();
                const active = isActive(u);
                return (
                  <tr key={u.id} style={{ borderTop: "1px solid #181818", opacity: active ? 1 : 0.4 }}>
                    <td style={{ padding: "0.75rem 1rem 0.75rem 0" }}>
                      <div style={{ fontSize: "0.825rem", color: "#F0EAD8", display: "flex", alignItems: "center", gap: 8 }}>
                        {u.nombre}
                        {isMe && <span style={{ fontSize: "0.58rem", color: "#454035", letterSpacing: "0.12em", textTransform: "uppercase" }}>vos</span>}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#555045", marginTop: 2 }}>{u.email}</div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem 0.75rem 0" }}>
                      <select
                        value={u.role || "operacion"}
                        onChange={e => onChangeRole(u, e.target.value)}
                        style={{ ...S.inp, width: "auto", fontSize: "0.72rem", padding: "0.3rem 0.6rem", appearance: "none",
                          color: ROLE_COLORS[u.role] || "#7A7260",
                          borderColor: `rgba(${u.role === "admin" ? "211,154,89" : "126,184,154"},0.3)` }}>
                        <option value="admin">Administrador</option>
                        <option value="operacion">Operación</option>
                      </select>
                    </td>
                    <td style={{ padding: "0.75rem 1rem 0.75rem 0" }}>
                      <span style={{ fontSize: "0.72rem", color: active ? "#34D399" : "#555045" }}>
                        {active ? "● Activo" : "○ Inactivo"}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 0", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" onClick={() => { setPwdUser(u); setPwdForm({ password: "", confirm: "" }); setErr(""); }}
                        style={{ ...S.btnS, fontSize: "0.72rem", padding: "0.25rem 0.75rem", marginRight: 6 }}>
                        Cambiar clave
                      </button>
                      {!isMe && (
                        <button type="button" onClick={() => onToggle(u)}
                          style={{ ...S.btnS, fontSize: "0.72rem", padding: "0.25rem 0.75rem", color: active ? "#D08050" : "#34D399", borderColor: active ? "rgba(208,128,80,0.25)" : "rgba(52,211,153,0.25)" }}>
                          {active ? "Desactivar" : "Activar"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal nuevo usuario */}
      {showNew && (
        <Modal title="Nuevo usuario" onClose={() => { setShowNew(false); setErr(""); }}>
          <Field label="Nombre completo *">
            <input value={newForm.nombre} onChange={e => setN("nombre", e.target.value)} style={S.inp} placeholder="Ej: Juan García" autoFocus />
          </Field>
          <Field label="Email *">
            <input type="email" value={newForm.email} onChange={e => setN("email", e.target.value)} style={S.inp} placeholder="juan@ejemplo.com" />
          </Field>
          <Field label="Contraseña *">
            <input type="password" value={newForm.password} onChange={e => setN("password", e.target.value)} style={S.inp} placeholder="Mínimo 6 caracteres" />
          </Field>
          <Field label="Tipo de acceso">
            <select value={newForm.role} onChange={e => setN("role", e.target.value)} style={{ ...S.inp, appearance: "none" }}>
              <option value="operacion">Operación — Pipeline, Clientes, Operaciones, Personal, Post-venta, Marketing</option>
              <option value="admin">Administrador — acceso completo (incluye P&L y Pagos)</option>
            </select>
          </Field>
          {err && <div style={{ fontSize: "0.78rem", color: "#D05050", margin: "0.25rem 0 0.5rem" }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem", marginTop: "0.5rem" }}>
            <button type="button" onClick={() => { setShowNew(false); setErr(""); }} style={S.btnS}>Cancelar</button>
            <button type="button" onClick={submitNew} disabled={saving} style={{ ...S.btnP, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Creando..." : "Crear usuario"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal cambiar contraseña */}
      {pwdUser && (
        <Modal title={`Cambiar contraseña — ${pwdUser.nombre}`} onClose={() => { setPwdUser(null); setErr(""); }}>
          <Field label="Nueva contraseña *">
            <input type="password" value={pwdForm.password} onChange={e => setP("password", e.target.value)} style={S.inp} placeholder="Mínimo 6 caracteres" autoFocus />
          </Field>
          <Field label="Confirmar contraseña *">
            <input type="password" value={pwdForm.confirm} onChange={e => setP("confirm", e.target.value)} style={S.inp} placeholder="Repetí la contraseña" />
          </Field>
          {err && <div style={{ fontSize: "0.78rem", color: "#D05050", margin: "0.25rem 0 0.5rem" }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.625rem", marginTop: "0.5rem" }}>
            <button type="button" onClick={() => { setPwdUser(null); setErr(""); }} style={S.btnS}>Cancelar</button>
            <button type="button" onClick={submitPwd} disabled={saving} style={{ ...S.btnP, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Guardando..." : "Cambiar contraseña"}
            </button>
          </div>
        </Modal>
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
  const [marketingDB,  setMarketingDB]  = useState([]);
  const [usuariosDB,   setUsuariosDB]   = useState([]);
  const [hojasFuncion, setHojasFuncion] = useState([]);

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
        if (data.marketing?.length)   setMarketingDB(data.marketing.map(parseMarketing));
        if (data.usuarios?.length)    setUsuariosDB(data.usuarios);
        if (data.hojafuncion?.length) setHojasFuncion(data.hojafuncion.map(parseHojaFuncion));
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
  const updatePayment = p => {
    setPayments(prev => prev.map(x => x.id === p.id ? p : x));
    sync("update", "Pagos", p);
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

  const addMarketing    = m => { const n = parseMarketing({ ...m, id: nextId(marketingDB) }); setMarketingDB(prev => [...prev, n]); sync("add", "Marketing", n); };
  const updateMarketing = m => { const n = parseMarketing(m); setMarketingDB(prev => prev.map(x => x.id === n.id ? n : x)); sync("update", "Marketing", n); };
  const deleteMarketing = id => { setMarketingDB(prev => prev.filter(x => x.id !== id)); sync("delete", "Marketing", null, id); };

  const saveHojaFuncion = async f => {
    const row = { ...f, timing: JSON.stringify(f.timing || []) };
    if (f.id) {
      setHojasFuncion(prev => prev.map(h => h.id === f.id ? f : h));
      await sheetsPost({ action: "update", sheet: "HojaFuncion", data: row });
    } else {
      const n = { ...f, id: nextId(hojasFuncion) };
      const nRow = { ...n, timing: JSON.stringify(n.timing || []) };
      setHojasFuncion(prev => [...prev, n]);
      await sheetsPost({ action: "add", sheet: "HojaFuncion", data: nRow });
    }
  };

  const createUser = async (form) => {
    setSyncing(true);
    const json = await sheetsPost({ action: "createUser", data: form }).finally(() => setSyncing(false));
    if (!json.ok) throw new Error(json.error || "Error al crear usuario");
    const updated = await sheetsGet();
    if (updated.usuarios) setUsuariosDB(updated.usuarios);
  };
  const toggleUser = u => {
    const next = !(String(u.active) === "true" || u.active === true);
    setUsuariosDB(prev => prev.map(x => x.id === u.id ? { ...x, active: next } : x));
    sheetsPost({ action: "setUserActive", data: { id: u.id, active: next } }).catch(() => {});
  };
  const resetUserPassword = async (u, newPassword) => {
    setSyncing(true);
    await sheetsPost({ action: "resetUserPassword", data: { id: u.id, password: newPassword } }).finally(() => setSyncing(false));
  };
  const changeUserRole = (u, newRole) => {
    setUsuariosDB(prev => prev.map(x => x.id === u.id ? { ...x, role: newRole } : x));
    sheetsPost({ action: "changeUserRole", data: { id: u.id, role: newRole } }).catch(() => {});
  };

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
        {view === "dashboard"  && <Dashboard events={events} clients={clients} payments={payments} costs={costs} setView={setView} setDetailEvent={setDetailEvent} />}
        {view === "pipeline"   && <Pipeline  events={events} onMove={moveStage} onCard={setDetailEvent} onNew={() => setEventModal("new")} />}
        {view === "clients"    && <Clients   clients={clients} events={events} onNew={() => setClientModal("new")} onEdit={setClientModal} />}
        {view === "operaciones" && (opEventId
          ? <OperacionDetalle ev={events.find(e => e.id === opEventId)} ops={operaciones.filter(o => o.eventId === opEventId)} recetas={recetas} equipoBase={personalDB} hojasFuncion={hojasFuncion} onAdd={addOp} onAddBulk={addBulkOps} onUpdate={updateOp} onDelete={deleteOp} onBack={() => setOpEventId(null)} onSaveHojaFuncion={saveHojaFuncion} />
          : <OperacionesList events={events} operaciones={operaciones} setOpEventId={setOpEventId} />
        )}
        {view === "personal"   && <PersonalModule personal={personalDB} onAdd={addPersonal} onUpdate={updatePersonal} onDelete={deletePersonal} />}
        {view === "pagos"      && canView("pagos", user?.role)    && <Pagos  events={events} payments={payments} onAdd={addPayment} onUpdate={updatePayment} onDelete={deletePayment} />}
        {view === "postventa"  && <PostVenta events={events} postventas={postventas} onSave={savePostventa} />}
        {view === "pyl"        && canView("pyl", user?.role)      && <PyL    events={events} payments={payments} costs={costs} onAddCost={addCost} onDeleteCost={deleteCost} />}
        {view === "marketing"  && <Marketing marketing={marketingDB} onAdd={addMarketing} onUpdate={updateMarketing} onDelete={deleteMarketing} />}
        {view === "usuarios"   && canView("usuarios", user?.role) && <UserManagement usuarios={usuariosDB} currentUser={user} onCreate={createUser} onToggle={toggleUser} onResetPassword={resetUserPassword} onChangeRole={changeUserRole} />}
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
