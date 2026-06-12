import { useState, useEffect, useRef } from "react";

// ---------- PROGRAM ----------
const PROGRAM = {
  liftA: {
    label: "Lift A", sub: "Squat focus", color: "#D63A2F",
    exercises: [
      { name: "Back squat", sets: 3, lo: 5, hi: 8, inc: 5 },
      { name: "Bench press", sets: 3, lo: 5, hi: 8, inc: 2.5 },
      { name: "Barbell row", sets: 3, lo: 6, hi: 10, inc: 2.5 },
      { name: "Romanian deadlift", sets: 3, lo: 8, hi: 10, inc: 5 },
      { name: "Plank (sec)", sets: 3, lo: 45, hi: 60, inc: 0 },
    ],
  },
  liftB: {
    label: "Lift B", sub: "Bench focus", color: "#2E5FA3",
    exercises: [
      { name: "Bench press", sets: 4, lo: 5, hi: 8, inc: 2.5 },
      { name: "Front squat / leg press", sets: 3, lo: 8, hi: 10, inc: 5 },
      { name: "Pull-ups / pulldown", sets: 3, lo: 6, hi: 10, inc: 2.5 },
      { name: "Overhead press", sets: 3, lo: 6, hi: 10, inc: 2.5 },
      { name: "Curls + triceps ext.", sets: 2, lo: 10, hi: 12, inc: 2.5 },
    ],
  },
  liftC: {
    label: "Lift C", sub: "Deadlift focus", color: "#E0B43A",
    exercises: [
      { name: "Deadlift", sets: 3, lo: 4, hi: 6, inc: 5 },
      { name: "Incline DB press", sets: 3, lo: 8, hi: 10, inc: 2 },
      { name: "Seated cable row", sets: 3, lo: 8, hi: 10, inc: 2.5 },
      { name: "Lunges / split squat", sets: 2, lo: 10, hi: 10, inc: 2.5 },
      { name: "Hanging leg raise", sets: 3, lo: 10, hi: 15, inc: 0 },
    ],
  },
  easyRun: { label: "Easy Run", sub: "30-40 min · can talk in full sentences (~7:15-7:45/km)", color: "#3D8C51" },
  qualityRun: { label: "Quality Run", sub: "Intervals: 5-6×800m @6:00-6:10, 90s rest · or Tempo: 15-20 min @6:25-6:35", color: "#1F6E5C" },
};
const WEEK_PLAN = [
  ["Mon", "Lift A"], ["Tue", "Easy run"], ["Wed", "Lift B"],
  ["Thu", "Rest / easy run"], ["Fri", "Lift C"], ["Sat", "Quality run"], ["Sun", "Rest"],
];
const PROGRAM_EXERCISES = [...new Set([
  ...PROGRAM.liftA.exercises, ...PROGRAM.liftB.exercises, ...PROGRAM.liftC.exercises,
].map(ex => ex.name))];
const KEY = "trainlog-v2", OLD_KEY = "trainlog-v1";

// ---------- helpers ----------
const dayMs = 86400000;
function weekKey(d) {
  const date = new Date(d); const day = (date.getDay() + 6) % 7;
  const m = new Date(date.getTime() - day * dayMs); m.setHours(0, 0, 0, 0); return m.getTime();
}
const fmt = ts => new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
// progression suggestion based on last log of an exercise
function suggest(ex, hist) {
  const last = hist && hist.length ? hist[hist.length - 1] : null;
  if (!last) return { text: "First time — pick a weight you can do for " + ex.lo + " clean reps", up: false, weight: null };
  const allTop = last.reps.length >= ex.sets && last.reps.every(r => r >= ex.hi);
  if (allTop && ex.inc > 0)
    return { text: `▲ Add ${ex.inc}kg → ${(last.weight + ex.inc)}kg × ${ex.lo}`, up: true, weight: last.weight + ex.inc };
  return { text: `Last: ${last.weight > 0 ? last.weight + "kg — " : ""}${last.reps.join(", ")} · beat it by 1 rep`, up: false, weight: last.weight };
}

export default function App() {
  const [st, setSt] = useState(null);
  const [tab, setTab] = useState("train");
  const [active, setActive] = useState(null); // {type, entries:{name:{weight, reps:[]}}}
  const [toast, setToast] = useState(null);
  const [timer, setTimer] = useState(0);
  const [progressEx, setProgressEx] = useState(PROGRAM_EXERCISES[0]);
  const [confirmDelete, setConfirmDelete] = useState(null); // {ex, ts}
  const timerRef = useRef(null);

  // ----- load + migrate -----
  useEffect(() => {
    (async () => {
      let s = { sessions: [], exHist: {} };
      try {
        const r = await window.storage.get(KEY);
        if (r && r.value) s = JSON.parse(r.value);
      } catch (e) {
        try { // migrate from v1
          const old = await window.storage.get(OLD_KEY);
          if (old && old.value) { const o = JSON.parse(old.value); s.sessions = o.sessions || []; }
        } catch (e2) { /* fresh start */ }
      }
      setSt(s);
    })();
  }, []);

  async function persist(next) {
    setSt(next);
    try { await window.storage.set(KEY, JSON.stringify(next)); }
    catch (e) { flash("Couldn't save — check connection"); }
  }
  function flash(m) { setToast(m); setTimeout(() => setToast(null), 2600); }

  // ----- rest timer -----
  function startTimer(sec) {
    clearInterval(timerRef.current);
    setTimer(sec);
    timerRef.current = setInterval(() => setTimer(t => {
      if (t <= 1) { clearInterval(timerRef.current); return 0; }
      return t - 1;
    }), 1000);
  }
  useEffect(() => () => clearInterval(timerRef.current), []);

  // ----- workout flow -----
  function startWorkout(type) {
    const day = PROGRAM[type];
    if (!day.exercises) { finishRun(type); return; }
    const entries = {};
    day.exercises.forEach(ex => {
      const sg = suggest(ex, st.exHist[ex.name]);
      entries[ex.name] = { weight: sg.weight ? String(sg.weight) : "", reps: Array(ex.sets).fill("") };
    });
    setActive({ type, entries });
    setTab("train");
  }
  async function finishRun(type) {
    await logDone(type, null);
  }
  async function finishWorkout() {
    const details = {};
    const exHist = { ...st.exHist };
    PROGRAM[active.type].exercises.forEach(ex => {
      const e = active.entries[ex.name];
      const reps = e.reps.map(r => parseInt(r)).filter(r => r > 0);
      const weight = parseFloat(e.weight) || 0;
      if (reps.length > 0) {
        details[ex.name] = { weight, reps };
        exHist[ex.name] = [...(exHist[ex.name] || []), { ts: Date.now(), weight, reps }];
      }
    });
    await logDone(active.type, details, exHist);
    setActive(null);
  }
  async function logDone(type, details, exHist) {
    const sessions = [...st.sessions, { type, ts: Date.now(), details }];
    await persist({ ...st, sessions, exHist: exHist || st.exHist });
    flash(`${PROGRAM[type].label} logged ✓`);
  }

  // ----- delete a logged session -----
  async function deleteSession(ts) {
    const session = st.sessions.find(s => s.ts === ts);
    const sessions = st.sessions.filter(s => s.ts !== ts);
    const exHist = { ...st.exHist };
    if (session && session.details) {
      Object.keys(session.details).forEach(exName => {
        if (exHist[exName]) exHist[exName] = exHist[exName].filter(h => h.ts !== ts);
      });
    }
    await persist({ ...st, sessions, exHist });
    setConfirmDelete(null);
    flash(`${PROGRAM[session.type].label} session deleted`);
  }

  // ---------- styles ----------
  const ink = "#232A35", panel = "#2C3542", line = "#3C4655", chalk = "#D8D2C4";
  const mono = "'Courier New', monospace";
  const card = { background: panel, borderRadius: 12, padding: 14, border: `1px solid ${line}` };
  const inputS = { background: ink, color: chalk, border: `1px solid ${line}`, borderRadius: 8, padding: "10px 8px", fontSize: 16, width: "100%", textAlign: "center" };

  if (!st) return <div style={{ background: ink, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: chalk }}>Loading…</div>;

  const wk = weekKey(Date.now());
  const thisWeek = st.sessions.filter(s => weekKey(s.ts) === wk);
  const allExercises = [...new Set([...PROGRAM_EXERCISES, ...Object.keys(st.exHist)])];

  // ---------- ACTIVE WORKOUT VIEW ----------
  if (active) {
    const day = PROGRAM[active.type];
    return (
      <div style={{ background: ink, minHeight: "100vh", color: chalk, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto", paddingBottom: 120 }}>
        <div style={{ padding: "18px 16px 10px", borderBottom: `4px solid ${day.color}` }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 3, opacity: 0.55 }}>WORKOUT IN PROGRESS</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{day.label} <span style={{ fontSize: 14, fontWeight: 400, opacity: 0.6 }}>· {day.sub}</span></div>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {day.exercises.map(ex => {
            const sg = suggest(ex, st.exHist[ex.name]);
            const e = active.entries[ex.name];
            return (
              <div key={ex.name} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{ex.name}</div>
                  <div style={{ fontFamily: mono, fontSize: 12, opacity: 0.6 }}>{ex.sets}×{ex.lo}-{ex.hi}</div>
                </div>
                <div style={{ fontSize: 12, marginTop: 4, color: sg.up ? "#7FD08A" : chalk, opacity: sg.up ? 1 : 0.55 }}>{sg.text}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                  <div style={{ width: 80 }}>
                    <input style={inputS} type="number" inputMode="decimal" placeholder="kg"
                      value={e.weight}
                      onChange={ev => setActive(a => ({ ...a, entries: { ...a.entries, [ex.name]: { ...a.entries[ex.name], weight: ev.target.value } } }))} />
                  </div>
                  {e.reps.map((r, i) => (
                    <input key={i} style={inputS} type="number" inputMode="numeric" placeholder={`S${i + 1}`}
                      value={r}
                      onChange={ev => setActive(a => {
                        const reps = [...a.entries[ex.name].reps]; reps[i] = ev.target.value;
                        return { ...a, entries: { ...a.entries, [ex.name]: { ...a.entries[ex.name], reps } } };
                      })} />
                  ))}
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setActive(null)} style={{ flex: 1, background: "none", border: `1px solid ${line}`, color: chalk, opacity: 0.6, borderRadius: 10, padding: 14, cursor: "pointer" }}>Discard</button>
            <button onClick={finishWorkout} style={{ flex: 2, background: chalk, color: ink, border: "none", borderRadius: 10, padding: 14, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Finish workout ✓</button>
          </div>
        </div>
        {/* rest timer bar */}
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: panel, borderTop: `1px solid ${line}`, padding: "10px 16px", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: 2, opacity: 0.6 }}>REST</div>
          {[90, 150, 180].map(s => (
            <button key={s} onClick={() => startTimer(s)} style={{ background: ink, color: chalk, border: `1px solid ${line}`, borderRadius: 8, padding: "8px 12px", fontFamily: mono, fontSize: 13, cursor: "pointer" }}>
              {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
            </button>
          ))}
          <div style={{ flex: 1, textAlign: "right", fontFamily: mono, fontSize: 22, fontWeight: 700, color: timer > 0 && timer <= 10 ? "#D63A2F" : chalk }}>
            {timer > 0 ? `${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, "0")}` : "—"}
          </div>
        </div>
        {toast && <Toast msg={toast} chalk={chalk} ink={ink} />}
      </div>
    );
  }

  // ---------- MAIN VIEW ----------
  return (
    <div style={{ background: ink, minHeight: "100vh", color: chalk, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto", paddingBottom: 60 }}>
      {/* header */}
      <div style={{ padding: "20px 18px 6px" }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 3, opacity: 0.55 }}>TRAINING LOGBOOK</div>
        <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>This week</div>
      </div>

      {/* this week's sessions */}
      <div style={{ margin: "16px 18px 0", ...card }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 2, opacity: 0.6, marginBottom: thisWeek.length ? 10 : 0 }}>
          {thisWeek.length === 0 ? "NOTHING LOGGED YET" : `${thisWeek.length} SESSION${thisWeek.length > 1 ? "S" : ""}`}
        </div>
        {thisWeek.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderTop: i ? `1px solid ${line}` : "none" }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: PROGRAM[s.type].color }} />
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{PROGRAM[s.type].label}</div>
            <div style={{ fontFamily: mono, fontSize: 11, opacity: 0.5 }}>{fmt(s.ts)}</div>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div style={{ display: "flex", margin: "16px 18px 0", borderBottom: `1px solid ${line}` }}>
        {[["train", "Train"], ["plan", "Plan"], ["history", "History"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, background: "none", border: "none", color: chalk, padding: "10px 0", fontFamily: mono, fontSize: 12, letterSpacing: 2, cursor: "pointer", opacity: tab === id ? 1 : 0.45, borderBottom: tab === id ? `2px solid ${chalk}` : "2px solid transparent" }}>{l.toUpperCase()}</button>
        ))}
      </div>

      {/* TRAIN */}
      {tab === "train" && (
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {["liftA", "liftB", "liftC"].map(t => (
            <button key={t} onClick={() => startWorkout(t)} style={{ ...card, borderLeft: `5px solid ${PROGRAM[t].color}`, textAlign: "left", color: chalk, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{PROGRAM[t].label}</div>
                <div style={{ fontSize: 12, opacity: 0.55 }}>{PROGRAM[t].sub} · {PROGRAM[t].exercises.length} exercises</div>
              </div>
              <div style={{ fontFamily: mono, fontSize: 13, opacity: 0.7 }}>START →</div>
            </button>
          ))}
          <div style={{ display: "flex", gap: 10 }}>
            {["easyRun", "qualityRun"].map(t => (
              <button key={t} onClick={() => startWorkout(t)} style={{ ...card, flex: 1, borderLeft: `5px solid ${PROGRAM[t].color}`, color: chalk, cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{PROGRAM[t].label}</div>
                <div style={{ fontFamily: mono, fontSize: 11, opacity: 0.6, marginTop: 4 }}>LOG ✓</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PLAN */}
      {tab === "plan" && (
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={card}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 2, opacity: 0.6, marginBottom: 8 }}>WEEKLY SCHEDULE</div>
            {WEEK_PLAN.map(([d, w]) => (
              <div key={d} style={{ display: "flex", padding: "5px 0", borderBottom: `1px solid ${line}`, fontSize: 13 }}>
                <div style={{ width: 48, fontFamily: mono, opacity: 0.55 }}>{d}</div>
                <div>{w}</div>
              </div>
            ))}
          </div>
          {["liftA", "liftB", "liftC"].map(t => (
            <div key={t} style={{ ...card, borderLeft: `5px solid ${PROGRAM[t].color}` }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{PROGRAM[t].label} · {PROGRAM[t].sub}</div>
              {PROGRAM[t].exercises.map(ex => {
                const h = st.exHist[ex.name]; const last = h && h.length ? h[h.length - 1] : null;
                return (
                  <div key={ex.name} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${line}`, fontSize: 13 }}>
                    <div>{ex.name}</div>
                    <div style={{ fontFamily: mono, opacity: 0.65 }}>{ex.sets}×{ex.lo}-{ex.hi}{last && last.weight > 0 ? ` · ${last.weight}kg` : ""}</div>
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ ...card, borderLeft: `5px solid ${PROGRAM.easyRun.color}` }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Running</div>
            <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.6 }}>
              <b>Easy:</b> {PROGRAM.easyRun.sub}<br />
              <b>Quality:</b> {PROGRAM.qualityRun.sub}<br />
              Never the day before Lift A.
            </div>
          </div>
          <div style={{ fontFamily: mono, fontSize: 11, opacity: 0.5, lineHeight: 1.7 }}>
            PROGRESSION: same weight all sets, 1-3 reps from failure. All sets at top of range → +2.5kg upper / +5kg lower, back to bottom. Rest 2-3 min compounds, 1.5-2 min accessories. Deload every 6-8 weeks at 60%.
          </div>
        </div>
      )}

      {/* HISTORY */}
      {tab === "history" && (
        <div style={{ padding: 18 }}>
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 2, opacity: 0.6, marginBottom: 8 }}>EXERCISE PROGRESS</div>
            <select value={progressEx} onChange={ev => setProgressEx(ev.target.value)}
              style={{ ...inputS, textAlign: "left", appearance: "none" }}>
              {allExercises.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <div style={{ marginTop: 10 }}>
              {(!st.exHist[progressEx] || st.exHist[progressEx].length === 0) && (
                <div style={{ opacity: 0.4, fontSize: 13 }}>No logs yet.</div>
              )}
              {[...(st.exHist[progressEx] || [])].reverse().map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: i ? `1px solid ${line}` : "none", fontSize: 13 }}>
                  <div style={{ fontFamily: mono, opacity: 0.55 }}>{fmt(h.ts)}</div>
                  <div style={{ fontFamily: mono }}>{h.weight > 0 ? `${h.weight}kg · ` : ""}{h.reps.join(", ")}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 2, opacity: 0.5, marginBottom: 10 }}>TOTAL SESSIONS: {st.sessions.length}</div>
          {st.sessions.length === 0 && <div style={{ opacity: 0.4, fontSize: 13 }}>Nothing yet. The first entry is the hardest one.</div>}
          {[...st.sessions].reverse().slice(0, 20).map((s, i) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: `1px solid ${line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: 5, background: PROGRAM[s.type].color }} />
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{PROGRAM[s.type].label}</div>
                <div style={{ fontFamily: mono, fontSize: 11, opacity: 0.5 }}>{fmt(s.ts)}</div>
                <button onClick={() => setConfirmDelete({ ts: s.ts, type: s.type })}
                  style={{ background: "none", border: "none", color: chalk, opacity: 0.4, cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1 }}>✕</button>
              </div>
              {s.details && (
                <div style={{ fontFamily: mono, fontSize: 11, opacity: 0.55, marginTop: 6, marginLeft: 20, lineHeight: 1.7 }}>
                  {Object.entries(s.details).map(([n, d]) => `${n}: ${d.weight > 0 ? d.weight + "kg " : ""}${d.reps.join(",")}`).join(" · ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {toast && <Toast msg={toast} chalk={chalk} ink={ink} />}

      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ ...card, width: 280 }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Delete this session?</div>
            <div style={{ fontFamily: mono, fontSize: 12, opacity: 0.6, marginBottom: 14 }}>
              {PROGRAM[confirmDelete.type].label} · {fmt(confirmDelete.ts)}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, background: "none", border: `1px solid ${line}`, color: chalk, borderRadius: 10, padding: 12, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => deleteSession(confirmDelete.ts)} style={{ flex: 1, background: "#D63A2F", color: chalk, border: "none", borderRadius: 10, padding: 12, fontWeight: 700, cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toast({ msg, chalk, ink }) {
  return (
    <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: chalk, color: ink, padding: "10px 18px", borderRadius: 24, fontWeight: 700, fontSize: 13, boxShadow: "0 4px 18px rgba(0,0,0,.4)", whiteSpace: "nowrap", zIndex: 50 }}>{msg}</div>
  );
}
