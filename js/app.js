const $ = (id) => document.getElementById(id);

let job = null;
let mode = "customer";
let selected = null;
let pitchTimer = null;
let pitching = false;
let scale = 1;
let panX = 0;
let panY = 0;
let viewerBound = false;
const BASE_W = 1600;

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

function imgSize() {
  const img = $("stage").querySelector("img");
  const ratio =
    img.naturalWidth && img.naturalHeight
      ? img.naturalHeight / img.naturalWidth
      : 3368 / 4768;
  return { w: BASE_W, h: BASE_W * ratio };
}

function applyView() {
  const stage = $("stage");
  const { w } = imgSize();
  stage.style.width = `${w * scale}px`;
  stage.style.height = "auto";
  stage.style.left = `${panX}px`;
  stage.style.top = `${panY}px`;
  stage.style.transform = "none";
}

function fitView() {
  const vp = $("viewport");
  const { w, h } = imgSize();
  scale = Math.min(vp.clientWidth / w, vp.clientHeight / h) * 0.98;
  panX = (vp.clientWidth - w * scale) / 2;
  panY = (vp.clientHeight - h * scale) / 2;
  applyView();
}

function zoomAt(factor, cx, cy) {
  const next = Math.min(5.5, Math.max(0.4, scale * factor));
  panX = cx - ((cx - panX) * next) / scale;
  panY = cy - ((cy - panY) * next) / scale;
  scale = next;
  applyView();
}

function zoomTo(pctX, pctY, s = 2.5) {
  const vp = $("viewport");
  const { w, h } = imgSize();
  scale = s;
  panX = vp.clientWidth / 2 - (pctX / 100) * w * scale;
  panY = vp.clientHeight / 2 - (pctY / 100) * h * scale;
  applyView();
}

function drawMarks() {
  $("marks").innerHTML = job.marks
    .map((m) => {
      const room = m.room || m.id;
      const sel = room === selected || m.id === selected ? "sel" : "";
      const kind = m.label.startsWith("A0-") ? "room" : "code";
      return `<button type="button" class="pin ${kind} ${sel}" data-id="${m.id}" data-room="${room}"
        style="left:${m.x}%;top:${m.y}%">${m.label}</button>`;
    })
    .join("");
  $("marks").querySelectorAll(".pin").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const room = el.dataset.room;
      if (job.rooms.some((r) => r.id === room)) select(room);
      else select(el.dataset.id);
    });
  });
}

function bindViewer() {
  if (viewerBound) return;
  viewerBound = true;
  const vp = $("viewport");
  $("zoomIn").addEventListener("click", (e) => {
    e.preventDefault();
    zoomAt(1.25, vp.clientWidth / 2, vp.clientHeight / 2);
  });
  $("zoomOut").addEventListener("click", (e) => {
    e.preventDefault();
    zoomAt(0.8, vp.clientWidth / 2, vp.clientHeight / 2);
  });
  $("zoomFit").addEventListener("click", (e) => {
    e.preventDefault();
    fitView();
  });
  vp.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 0.9, e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false }
  );
  let drag = null;
  vp.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".pin")) return;
    drag = { x: e.clientX, y: e.clientY, panX, panY, moved: false };
    vp.classList.add("drag");
  });
  vp.addEventListener("pointermove", (e) => {
    if (!drag || e.buttons !== 1) {
      if (e.buttons !== 1) {
        drag = null;
        vp.classList.remove("drag");
      }
      return;
    }
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) < 3 && !drag.moved) return;
    drag.moved = true;
    panX = drag.panX + dx;
    panY = drag.panY + dy;
    applyView();
  });
  const endDrag = () => {
    drag = null;
    vp.classList.remove("drag");
  };
  vp.addEventListener("pointerup", endDrag);
  vp.addEventListener("pointercancel", endDrag);
  vp.addEventListener("pointerleave", endDrag);
  const img = $("stage").querySelector("img");
  if (img.complete) fitView();
  img.addEventListener("load", () => {
    fitView();
    if (selected) focusSelected();
  });
}

function focusSelected() {
  const mark =
    job.marks.find((m) => m.id === selected) ||
    job.marks.find((m) => (m.room || m.id) === selected);
  if (mark) zoomTo(mark.x, mark.y, 2.6);
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

function render(opts = {}) {
  $("drawingName").textContent = "· " + job.drawing;
  $("trust").className = "trust" + (mode === "specialist" ? " specialist" : "");
  $("trust").innerHTML = trustHtml();
  const pillEl = $("sheetPill");
  if (pillEl) pillEl.textContent = selected ? selected : "Click a pin";
  drawMarks();
  $("side").innerHTML = sideHtml();
  $("side").querySelectorAll("[data-room]").forEach((el) => {
    el.addEventListener("click", () => select(el.dataset.room));
  });
  $("side").querySelectorAll(".extras").forEach((el) => {
    el.addEventListener("click", () => {
      const m = job.marks.find((x) => x.id === "IL.5");
      if (m) {
        selected = "IL.5";
        drawMarks();
        zoomTo(m.x, m.y, 2.8);
      }
    });
  });
  if (opts.zoom !== false) focusSelected();
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
  render({ zoom: false });
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
  bindViewer();
  selected = "A0-025";
  mode = "customer";
  setMode("customer");
  requestAnimationFrame(() => {
    fitView();
    focusSelected();
  });
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
