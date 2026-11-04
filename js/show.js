const DURATION = 128;

const PHASES = [
  { t: 0, phase: "cover" },
  { t: 6.5, phase: "case" },
  { t: 18, phase: "promise" },
  { t: 30, phase: "empty" },
  { t: 36, phase: "scan" },
  { t: 44, phase: "marks" },
  { t: 54, phase: "list" },
  { t: 68, phase: "need" },
  { t: 82, phase: "stamp" },
  { t: 94, phase: "compare" },
  { t: 108, phase: "insight" },
  { t: 122, phase: "end" },
];

const CAPTIONS = [
  { t: 0, text: "" },
  { t: 6.5, text: "Interior fittings. The quote is won or lost on this floor." },
  { t: 18, text: "Can a specialist review this in Bluebeam — and still sign?" },
  { t: 30, text: "PLAN 09. Empty. No list yet." },
  { t: 36, text: "The API reads text on the sheet. Codes, tables, notes." },
  { t: 44, text: "Marks land where the text already named a fitting." },
  { t: 54, text: "A filled list. They do not re-type sixty-nine lines." },
  { t: 68, text: "NEED means a person still has to fill this in." },
  { t: 82, text: "TEXT DRAFT · NOT SIGNED. Checking starts from a list, not a blank page." },
  { t: 94, text: "Same. Missing. Extra. The specialist can see the gaps." },
  { t: 108, text: "The machine read text, not objects. That is a dead end for take-off — and still a head start." },
  { t: 122, text: "The person still signs." },
];

const ROWS = [
  { code: "H2", note: "A0-026 shelf · no length", flag: "NEED", hot: true },
  { code: "H2", note: "A0-022 shelf · no length", flag: "NEED" },
  { code: "TP3", note: "Wash-place kit · no type", flag: "NEED" },
  { code: "TP2", note: "Wash-place kit · no type", flag: "NEED" },
  { code: "IL.5", note: "Hatches from the table", flag: "CHECK" },
  { code: "H3", note: "A0-015 · off this sheet", flag: "NEED" },
  { code: "DT", note: "Doors · other trade", flag: "—" },
];

const $ = (id) => document.getElementById(id);

let job = null;
let playing = false;
let startedAt = 0;
let elapsed = 0;
let raf = 0;
let lastPhase = "";
let countTimer = 0;
const pending = [];

function later(fn, ms) {
  pending.push(window.setTimeout(fn, ms));
}

function clearPending() {
  pending.forEach((id) => window.clearTimeout(id));
  pending.length = 0;
  cancelAnimationFrame(countTimer);
}

function atTime(list, t) {
  let hit = list[0];
  for (const item of list) {
    if (t >= item.t) hit = item;
  }
  return hit;
}

function pinKind(m) {
  const label = String(m.label || "");
  if (label.startsWith("A0-") || m.code === "room") return "room";
  if (String(m.code || "").startsWith("IL") || label.startsWith("IL")) return "extra";
  return "code";
}

function compareClass(m) {
  const code = String(m.code || m.label || "");
  if (code.startsWith("IL")) return "extra";
  if (code === "H2" || code === "TP3" || code === "TP2") return "miss";
  return "same";
}

function drawMarks() {
  const marks = (job && job.marks) || [];
  $("marks").innerHTML = marks
    .map(
      (m) =>
        `<button type="button" class="pin ${pinKind(m)} ${compareClass(m)}" data-id="${m.id}" style="left:${m.x}%;top:${m.y}%">${m.label}</button>`
    )
    .join("");
}

function resetMarks() {
  $("marks").querySelectorAll(".pin").forEach((el) => {
    el.classList.remove("on", "hot", "dim");
  });
}

function landMarks() {
  const pins = [...$("marks").querySelectorAll(".pin")];
  pins.forEach((el, i) => {
    later(() => el.classList.add("on"), i * 90);
  });
}

function drawRows() {
  $("rows").innerHTML = ROWS.map(
    (r) =>
      `<div class="row${r.hot ? " is-need" : ""}"><b>${r.code}</b><span>${r.note}</span><span class="flag">${r.flag}</span></div>`
  ).join("");
}

function landRows() {
  [...$("rows").querySelectorAll(".row")].forEach((el, i) => {
    later(() => el.classList.add("on"), 180 + i * 140);
  });
}

function countUp() {
  const el = $("countNum");
  const start = performance.now();
  const run = (now) => {
    const p = Math.min(1, (now - start) / 1600);
    el.textContent = String(Math.round(p * 69));
    if (p < 1 && playing) countTimer = requestAnimationFrame(run);
  };
  countTimer = requestAnimationFrame(run);
}

function setNeed() {
  const pins = [...$("marks").querySelectorAll(".pin")];
  pins.forEach((el) => {
    el.classList.toggle("hot", el.dataset.id === "H2_0");
    el.classList.toggle("dim", el.dataset.id !== "H2_0");
    el.classList.add("on");
  });
  const row = $("rows").querySelector(".is-need");
  if (row) {
    row.classList.add("on", "hot");
  }
}

function clearNeed() {
  $("marks").querySelectorAll(".pin").forEach((el) => {
    el.classList.remove("hot", "dim");
    el.classList.add("on");
  });
  $("rows").querySelectorAll(".row").forEach((el) => el.classList.remove("hot"));
}

function applyPhase(phase) {
  if (phase === lastPhase) return;
  const prev = lastPhase;
  lastPhase = phase;
  document.body.dataset.phase = phase;
  $("pill").textContent = {
    cover: "Show",
    case: "Case",
    promise: "Promise",
    empty: "Empty floor",
    scan: "Reading text",
    marks: "Marks",
    list: "Take-off",
    need: "NEED",
    stamp: "Draft",
    compare: "Compare",
    insight: "Insight",
    end: "Sign",
  }[phase] || "Show";

  if (phase === "cover" || phase === "case" || phase === "promise" || phase === "empty") {
    resetMarks();
    $("countNum").textContent = "0";
    $("rows").querySelectorAll(".row").forEach((el) => el.classList.remove("on", "hot"));
  }
  if (phase === "marks" && prev !== "marks") {
    resetMarks();
    landMarks();
  }
  if (phase === "list" && prev !== "list") {
    $("marks").querySelectorAll(".pin").forEach((el) => el.classList.add("on"));
    landRows();
    countUp();
  }
  if (phase === "need") setNeed();
  if (phase === "stamp" || phase === "compare" || phase === "insight" || phase === "end") {
    clearNeed();
    $("marks").querySelectorAll(".pin").forEach((el) => el.classList.add("on"));
    $("rows").querySelectorAll(".row").forEach((el) => el.classList.add("on"));
    $("countNum").textContent = "69";
  }
}

function applyCaption(t) {
  $("caption").textContent = atTime(CAPTIONS, t).text;
}

function tick(now) {
  if (!playing) return;
  elapsed = Math.min(DURATION, (now - startedAt) / 1000);
  applyPhase(atTime(PHASES, elapsed).phase);
  applyCaption(elapsed);
  if (elapsed >= DURATION) {
    playing = false;
    document.body.classList.add("is-playing");
    return;
  }
  raf = requestAnimationFrame(tick);
}

function play() {
  document.body.classList.add("is-playing");
  $("hud").hidden = true;
  playing = true;
  startedAt = performance.now() - elapsed * 1000;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

function pause() {
  playing = false;
  cancelAnimationFrame(raf);
}

function restart() {
  elapsed = 0;
  lastPhase = "";
  clearPending();
  resetMarks();
  $("countNum").textContent = "0";
  $("rows").querySelectorAll(".row").forEach((el) => el.classList.remove("on", "hot"));
  applyPhase("cover");
  applyCaption(0);
  play();
}

function toggle() {
  if (!document.body.classList.contains("is-playing") && elapsed === 0) {
    play();
    return;
  }
  if (playing) pause();
  else play();
}

async function boot() {
  $("play").addEventListener("click", play);
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      toggle();
    } else if (e.key === "r" || e.key === "R") {
      restart();
    } else if (e.key === "F") {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen();
    }
  });

  drawRows();
  try {
    const res = await fetch("data/job.json");
    job = await res.json();
  } catch (err) {
    job = { marks: [] };
  }
  drawMarks();
  applyPhase("cover");

  if (location.hash === "#record") {
    $("hud").hidden = true;
    window.setTimeout(play, 1800);
  }
}

boot();
