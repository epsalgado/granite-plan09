const $ = (id) => document.getElementById(id);

let job = null;
let mode = "customer";
let selected = null;
let pitchTimer = null;
let pitching = false;

async function load() {
  const res = await fetch("data/job.json");
  if (!res.ok) throw new Error("Could not load data/job.json");
  job = await res.json();
}

function pill(status) {
  return `<span class="pill ${status}">${status}</span>`;
}

function trustHtml() {
  if (mode === "customer") {
    return `
      <div class="t-card"><strong>Scope</strong><b>PLAN 09</b><span>${job.packNote}</span></div>
      <div class="t-card warn"><strong>Ready to order</strong><b>0</b><span>Nothing is fully specified</span></div>
      <div class="t-card warn"><strong>Needs a specialist</strong><b>4 H2</b><span>No lengths · TP3 kits unknown</span></div>
      <div class="t-card extra"><strong>You didn’t ask</strong><b>IL hatches</b><span>On the drawing, not in the Excel</span></div>`;
  }
  return `
      <div class="t-card warn"><strong>Pack</strong><b>1 PDF</b><span>Incomplete — only this sheet</span></div>
      <div class="t-card ok"><strong>H2 vs email</strong><b>4 match</b><span>8 more H2 sit on other plans</span></div>
      <div class="t-card warn"><strong>Quote</strong><b>No H2</b><span>Specialist quote never listed shelves</span></div>
      <div class="t-card extra"><strong>IL hatches</strong><b>Schedule</b><span>Not counted on the plan</span></div>`;
}

function drawPlan() {
  const svg = $("plan");
  const ghosts = [
    [50, 10, 28, 24],
    [80, 10, 16, 24],
    [50, 42, 16, 16],
    [68, 42, 16, 16],
    [50, 62, 16, 16],
    [68, 62, 28, 16],
  ];
  const g = ghosts
    .map(([x, y, w, h]) => `<rect class="ghost" x="${x}" y="${y}" width="${w}" height="${h}" rx="0.8" />`)
    .join("");
  const rooms = job.rooms
    .map((r) => {
      const sel = r.id === selected ? "sel" : "lit";
      const tag = r.items.some((i) => i.code === "H2") ? "H2" : r.items[0].code;
      return `<rect class="room ${sel}" data-room="${r.id}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="0.8" />
        <text class="room-label" x="${r.x + r.w / 2}" y="${r.y + r.h / 2 - 1.2}" text-anchor="middle">${r.id}</text>
        <text class="room-tag" x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 3.4}" text-anchor="middle">${tag}</text>`;
    })
    .join("");
  svg.innerHTML = `
    <rect x="1.5" y="1.5" width="97" height="97" fill="#f6f8fb" stroke="#0b3a6e" stroke-width="0.8"/>
    <text class="plan-quiet" x="4" y="6">Ground floor · health centre</text>
    ${g}${rooms}
    <text class="plan-quiet" x="4" y="96">Amber = on the drawing, not ready to order</text>`;
  svg.querySelectorAll(".room").forEach((el) => {
    el.addEventListener("click", () => select(el.dataset.room));
  });
}

function sideHtml() {
  if (mode === "specialist") {
    const checks = job.checks
      .map((c) => `<li class="${c.ok ? "ok" : ""}">${c.ok ? "✓" : "!"} ${c.text}</li>`)
      .join("");
    const rows = job.compare
      .map((r) => `<tr><td>${r.asked}</td><td>${r.drawn}</td><td>${r.basket}</td></tr>`)
      .join("");
    return `
      <h2>Check these first</h2>
      <ul class="checks">${checks}</ul>
      <h2>Asked · drawn · basket</h2>
      <table class="compare">
        <thead><tr><th>Asked</th><th>On this drawing</th><th>Basket</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${customerBasketHtml()}`;
  }
  return customerBasketHtml();
}

function customerBasketHtml() {
  const rooms = job.rooms
    .map((r) => {
      const sel = r.id === selected ? "sel" : "";
      const details =
        r.id === selected
          ? r.items.map((it) => `<div class="detail on">${it.why}</div>`).join("")
          : "";
      return `<article class="basket-room ${sel}" data-room="${r.id}">
        <h3>Room ${r.id}</h3>
        ${r.items
          .map(
            (it) => `<div class="line">
              <span><strong>${it.code}</strong> ${it.text}</span>
              <span>${it.qty} ${it.unit}</span>
              ${pill(it.status)}
            </div>`
          )
          .join("")}
        ${details}
      </article>`;
    })
    .join("");
  const extras = `<article class="basket-room extras">
      <h3>On the sheet · not in your list</h3>
      ${job.sheetExtras
        .map(
          (it) => `<div class="line">
            <span><strong>${it.code}</strong> ${it.text}</span>
            <span>${it.qty} ${it.unit}</span>
            ${pill(it.status)}
          </div>`
        )
        .join("")}
    </article>`;
  return `<div class="basket-head">
      <h2>Basket</h2>
      <p>11 lines · all amber · 0 kr ready</p>
    </div>${rooms}${extras}`;
}

function render() {
  $("drawingName").textContent = "· " + job.drawing;
  $("trust").className = "trust" + (mode === "specialist" ? " specialist" : "");
  $("trust").innerHTML = trustHtml();
  const pillEl = $("sheetPill");
  if (pillEl) pillEl.textContent = selected ? selected : "Click a room";
  drawPlan();
  $("side").innerHTML = sideHtml();
  $("side").querySelectorAll("[data-room]").forEach((el) => {
    el.addEventListener("click", () => select(el.dataset.room));
  });
}

function select(id) {
  selected = id;
  render();
}

function setMode(next) {
  mode = next;
  document.querySelectorAll(".mode button").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  render();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function playReading() {
  const overlay = $("readOverlay");
  const bar = $("readBar");
  const status = $("readStatus");
  const steps = [
    [8, "Sorting the sheet"],
    [28, "Finding room names"],
    [52, "Matching H2 to the request"],
    [74, "Flagging missing lengths"],
    [100, "Basket is amber — not ready to order"],
  ];
  overlay.hidden = false;
  bar.style.width = "0%";
  for (const [pct, text] of steps) {
    status.textContent = text;
    bar.style.width = pct + "%";
    await sleep(1600);
  }
  overlay.hidden = true;
}

async function startDemo({ pitch = false } = {}) {
  await load();
  $("landing").style.display = "none";
  await playReading();
  $("app").classList.add("on");
  selected = "A0-025";
  mode = "customer";
  setMode("customer");
  if (pitch) runPitch();
}

function setPitchCaption(text) {
  const el = $("pitchCaption");
  el.hidden = !text;
  el.textContent = text || "";
}

function runPitch() {
  stopPitch();
  pitching = true;
  document.body.classList.add("pitch");
  $("pitchBtn").textContent = "Exit pitch";
  const beats = [
    { t: 0, caption: "1 · Four H2 rooms on this floor — lengths unknown", room: "A0-022", mode: "customer" },
    { t: 3500, caption: "1 · Four H2 rooms on this floor — lengths unknown", room: "A0-023", mode: "customer" },
    { t: 7000, caption: "1 · Four H2 rooms on this floor — lengths unknown", room: "A0-025", mode: "customer" },
    { t: 10500, caption: "1 · Four H2 rooms on this floor — lengths unknown", room: "A0-026", mode: "customer" },
    { t: 14000, caption: "2 · Specialist: check these first. H2 is not even in the quote.", room: "A0-025", mode: "specialist" },
    { t: 20000, caption: "3 · Request quote = partial, not signed.", room: "A0-025", mode: "specialist", modal: true },
  ];
  pitchTimer = [];
  beats.forEach((b) => {
    pitchTimer.push(
      setTimeout(() => {
        if (!pitching) return;
        setMode(b.mode);
        select(b.room);
        setPitchCaption(b.caption);
        if (b.modal) openModal();
      }, b.t)
    );
  });
}

function stopPitch() {
  pitching = false;
  document.body.classList.remove("pitch");
  $("pitchBtn").textContent = "Pitch mode";
  setPitchCaption("");
  if (pitchTimer) pitchTimer.forEach(clearTimeout);
  pitchTimer = [];
  $("modal").classList.remove("on");
}

function togglePitch() {
  if (pitching) {
    stopPitch();
    return;
  }
  if (!$("app").classList.contains("on")) {
    startDemo({ pitch: true });
    return;
  }
  runPitch();
}

function openModal() {
  $("modalList").innerHTML = `
    <li>Included: 4 rooms with H2 + TP3 (A0-022, 023, 025, 026)</li>
    <li>Included: A0-006 with TP2 × 3</li>
    <li>Included as extra / flagged: hatch schedule IL.4–7</li>
    <li>Blocked: H2 lengths, kit contents, unverified hatch floor</li>`;
  $("sentMsg").hidden = true;
  $("modal").classList.add("on");
}

$("tryExample").addEventListener("click", () => startDemo({ pitch: false }));
$("pitchFromHero").addEventListener("click", () => startDemo({ pitch: true }));
$("pitchBtn").addEventListener("click", togglePitch);

document.querySelectorAll(".mode button").forEach((b) => {
  b.addEventListener("click", () => {
    if (pitching) stopPitch();
    setMode(b.dataset.mode);
  });
});

$("requestBtn").addEventListener("click", openModal);
$("closeModal").addEventListener("click", () => $("modal").classList.remove("on"));
$("sendBtn").addEventListener("click", () => {
  $("sentMsg").hidden = false;
});
