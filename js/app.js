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
      <div><strong>Scope</strong> PLAN 09 · ${job.packNote}</div>
      <div><strong>Ready to order</strong> 0 lines with full spec</div>
      <div><strong>Needs specialist</strong> 4× H2 (no length) · 4× TP3 · 3× TP2</div>
      <div><strong>Extra on drawing</strong> Inspection hatches IL.4–7 (you didn’t list these)</div>`;
  }
  return `
      <div><strong>Pack</strong> Incomplete — only A-40-1-1091.pdf</div>
      <div><strong>H2 vs email</strong> 4 rooms match · 8 H2 on other plans</div>
      <div><strong>Quote</strong> Specialist quote has no H2 lines</div>
      <div><strong>IL hatches</strong> Schedule qty, not counted on plan</div>`;
}

function drawPlan() {
  const svg = $("plan");
  const ghosts = [
    [52, 42, 14, 16],
    [68, 42, 14, 16],
    [52, 62, 14, 16],
    [68, 62, 22, 16],
    [8, 8, 40, 28],
    [82, 8, 14, 28],
  ];
  const g = ghosts
    .map(([x, y, w, h]) => `<rect class="ghost" x="${x}" y="${y}" width="${w}" height="${h}" />`)
    .join("");
  const rooms = job.rooms
    .map((r) => {
      const sel = r.id === selected ? "sel" : "";
      return `<rect class="room ${sel}" data-room="${r.id}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" />
        <text class="room-label" x="${r.x + 1.2}" y="${r.y + 6}">${r.id}</text>`;
    })
    .join("");
  svg.innerHTML = `<rect x="1" y="1" width="98" height="98" fill="#fff" stroke="#1b3a5f" stroke-width="0.6" />
    <text x="3" y="6" font-size="3.2" fill="#5c6b7a">A-40-1-1091 · schematic (not the legal drawing)</text>
    ${g}${rooms}`;
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
        <h3>${r.id}</h3>
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
  const extras = `<article class="basket-room">
      <h3>On the sheet, not in your Excel</h3>
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
  return `<h2>Basket for this floor</h2>${rooms}${extras}`;
}

function render() {
  $("drawingName").textContent = "· " + job.drawing;
  $("trust").className = "trust" + (mode === "specialist" ? " specialist" : "");
  $("trust").innerHTML = trustHtml();
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
