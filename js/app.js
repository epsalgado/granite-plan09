const $ = (id) => document.getElementById(id);

let job = null;
let mode = "customer";
let selected = null;
let lineFilter = "fittings";
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

function trustHtml() {
  const n = job.counts || {};
  if (mode === "customer") {
    return `
      <div class="t-card"><strong>This sheet</strong><b>PLAN 09</b><span>1 of 11 drawings — this floor only</span></div>
      <div class="t-card warn"><strong>Ready to order</strong><b>0</b><span>Lengths and kit lists are missing</span></div>
      <div class="t-card warn"><strong>Blocked</strong><b>Shelves · kits · symbols</b><span>Drawn, but not specified enough to buy</span></div>
      <div class="t-card extra"><strong>Not in the request</strong><b>Hatches</b><span>On this sheet anyway — not counted on the floor</span></div>`;
  }
  return `
      <div class="t-card warn"><strong>API draft</strong><b>${n.linesRecovered || 63}/${n.linesClaimed || 69}</b><span>${job.apiNote}</span></div>
      <div class="t-card ok"><strong>Email vs plan</strong><b>4 match</b><span>Named H2 rooms are here · extra H2 is other floors</span></div>
      <div class="t-card warn"><strong>Old quote</strong><b>No H2</b><span>The specialist quote never listed these shelves</span></div>
      <div class="t-card extra"><strong>Doors / other floors</strong><b>Hidden from customer</b><span>Still in the specialist table</span></div>`;
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

function visibleMarks() {
  return (job.marks || []).filter((m) => {
    const label = String(m.label || m.id);
    if (label.startsWith("A0-")) return true;
    if (/^(H2|TP2|TP3|S1|IL)/.test(label)) return true;
    return false;
  });
}

function drawMarks() {
  $("marks").innerHTML = visibleMarks()
    .map((m) => {
      const room = m.room || m.id;
      const sel = room === selected || m.id === selected ? "sel" : "";
      const kind = String(m.label).startsWith("A0-")
        ? "room"
        : String(m.label).startsWith("IL")
          ? "extra"
          : "code";
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
  img.addEventListener("load", fitView);
}

function focusSelected() {
  const mark =
    job.marks.find((m) => m.id === selected) ||
    job.marks.find((m) => (m.room || m.id) === selected);
  if (mark) zoomTo(mark.x, mark.y, 2.6);
}

function qtyLabel(it) {
  return it.qty > 1 ? `×${it.qty}` : "";
}

function lineMatchesFilter(line) {
  if (lineFilter === "all") return true;
  if (lineFilter === "fittings") {
    return ["shelf", "kit", "hatch", "tap", "sanitary", "unknown"].includes(line.kind);
  }
  if (lineFilter === "noroom") return !line.room;
  if (lineFilter === "nocode") return !line.code;
  if (lineFilter === "request") return line.kind === "request";
  if (lineFilter === "doors") return ["door", "window", "frame"].includes(line.kind);
  return true;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function draftTableHtml() {
  const lines = (job.lines || []).filter(lineMatchesFilter);
  const filters = [
    ["fittings", "This floor (fittings)"],
    ["all", "All recovered"],
    ["noroom", "No room"],
    ["nocode", "No code"],
    ["doors", "Doors / frames"],
    ["request", "Other floors"],
  ]
    .map(
      ([id, label]) =>
        `<button type="button" class="filter-btn ${lineFilter === id ? "active" : ""}" data-filter="${id}">${label}</button>`
    )
    .join("");
  const rows = lines
    .map((ln) => {
      const sel = selected && (selected === ln.room || selected === ln.code || selected === ln.id);
      return `<tr class="${sel ? "sel" : ""}" data-line="${ln.id}" data-room="${esc(ln.room || "")}" data-code="${esc(ln.code || "")}">
        <td>${esc(ln.code || "—")}</td>
        <td>${esc(ln.text)}</td>
        <td>${ln.qty}</td>
        <td>${esc(ln.room || "—")}</td>
        <td>${esc(ln.scope)}</td>
        <td><span class="blocker">${esc(ln.blocker)}</span></td>
      </tr>`;
    })
    .join("");
  const notes = (job.notes || []).map((n) => `<li>! ${esc(n)}</li>`).join("");
  return `
    <h2>Wilmer’s draft · ${lines.length} shown</h2>
    <p class="draft-meta">${esc(job.apiNote)}</p>
    <div class="filters">${filters}</div>
    <div class="draft-wrap">
      <table class="draft">
        <thead><tr><th>Code</th><th>Text</th><th>Qty</th><th>Room</th><th>Scope</th><th>Gap</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <h2>Notes from the run</h2>
    <ul class="checks">${notes}</ul>`;
}

function sideHtml() {
  if (mode === "specialist") {
    const checks = job.checks
      .map((c) => `<li class="${c.ok ? "ok" : ""}">${c.ok ? "✓" : "!"} ${esc(c.text)}</li>`)
      .join("");
    const rows = job.compare
      .map((r) => `<tr><td>${esc(r.asked)}</td><td>${esc(r.drawn)}</td><td>${esc(r.basket)}</td></tr>`)
      .join("");
    return `
      <h2>Check these before you sign</h2>
      <ul class="checks">${checks}</ul>
      <h2>Asked · on this drawing · in the list</h2>
      <table class="compare">
        <thead><tr><th>Asked</th><th>On this drawing</th><th>In the list</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${draftTableHtml()}
      ${customerBasketHtml()}`;
  }
  return customerBasketHtml();
}

function customerBasketHtml() {
  const rooms = job.rooms
    .map((r) => {
      const open = r.id === selected;
      return `<article class="basket-room ${open ? "sel" : ""}" data-room="${r.id}">
        <h3>${r.id}<small>${r.name}</small></h3>
        ${r.items
          .map(
            (it) => `<div class="line-block">
              <div class="line">
                <span><strong>${it.code}</strong> ${it.text} ${qtyLabel(it)}</span>
                <span class="blocker">${it.blocker}</span>
              </div>
              ${open ? `<p class="need">${it.need}</p>` : ""}
            </div>`
          )
          .join("")}
      </article>`;
    })
    .join("");
  const extraOpen = job.sheetExtras.some((x) => x.code === selected);
  const extras = `<article class="basket-room extras ${extraOpen ? "sel" : ""}" data-extra="1">
      <h3>On the sheet · no room</h3>
      <p class="need always">Hatches from the table, plus symbols the draft could not tie to a room. Not in the customer Excel.</p>
      ${job.sheetExtras
        .map(
          (it) => `<div class="line-block">
            <div class="line">
              <span><strong>${it.code}</strong> ${it.text} ${qtyLabel(it)}</span>
            </div>
            ${extraOpen && selected === it.code ? `<p class="need">${it.need}</p>` : ""}
          </div>`
        )
        .join("")}
    </article>`;
  const intro =
    mode === "specialist"
      ? "Same rooms the customer sees. Sign nothing until the gaps are closed."
      : "Nothing here is ready to order. Click a room to see it on the plan.";
  return `<div class="basket-head">
      <h2>This floor</h2>
      <p>${intro}</p>
    </div>${rooms}${extras}`;
}

function render(opts = {}) {
  $("drawingName").textContent = "· " + job.drawing;
  $("trust").className = "trust" + (mode === "specialist" ? " specialist" : "");
  $("trust").innerHTML = trustHtml();
  const pillEl = $("sheetPill");
  if (pillEl) {
    const room = job.rooms.find((r) => r.id === selected);
    const extra = job.sheetExtras.find((x) => x.code === selected);
    if (room) pillEl.textContent = `${room.id} · ${room.name}`;
    else if (extra) pillEl.textContent = `${extra.code} · not in the request`;
    else pillEl.textContent = "Click a room to see why it is blocked";
  }
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
  $("side").querySelectorAll("[data-filter]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      lineFilter = el.dataset.filter;
      render({ zoom: false });
    });
  });
  $("side").querySelectorAll("tr[data-line]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      selected = el.dataset.room || el.dataset.code || el.dataset.line;
      render();
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

const READ_STEPS = [
  [10, "File received"],
  [28, "Sorting the sheet"],
  [48, "Finding room names"],
  [68, "Matching H2 to the request"],
  [86, "Flagging missing lengths"],
  [100, "Nothing is ready to order"],
];

let landingPhase = "upload";
let landingBusy = false;
let readToken = 0;
let demoStarted = false;

function setLandingPhase(phase) {
  landingPhase = phase;
  $("landing").dataset.phase = phase;
  document.querySelectorAll("[data-phase-copy]").forEach((el) => {
    el.hidden = el.dataset.phaseCopy !== phase;
  });
  const pill = $("heroPill");
  const label = $("heroBarLabel");
  if (phase === "upload") {
    pill.textContent = "Empty";
    label.textContent = "No file";
  } else if (phase === "reading") {
    pill.textContent = "AI reading…";
    label.textContent = "A-40-1-1091 · PLAN 09";
  } else {
    pill.textContent = "Gaps found";
    label.textContent = "A-40-1-1091 · PLAN 09";
  }
}

function markHeroSteps(activeIdx) {
  $("heroSteps").querySelectorAll("li").forEach((li, i) => {
    li.classList.toggle("on", i === activeIdx);
    li.classList.toggle("done", activeIdx >= 0 && i < activeIdx);
  });
}

async function playLandingRead() {
  if (landingBusy || landingPhase !== "upload") return;
  landingBusy = true;
  const token = ++readToken;
  setLandingPhase("reading");
  load().catch(() => {});
  $("heroBar").style.width = "0%";
  for (let i = 0; i < READ_STEPS.length; i++) {
    if (token !== readToken) return;
    const [pct, text] = READ_STEPS[i];
    $("heroStatus").textContent = text;
    $("heroBar").style.width = pct + "%";
    markHeroSteps(i);
    await sleep(i === 0 ? 700 : 1200);
  }
  if (token !== readToken) return;
  markHeroSteps(READ_STEPS.length);
  setLandingPhase("overview");
  landingBusy = false;
}

function skipLandingRead() {
  if (landingPhase !== "reading") return;
  readToken += 1;
  landingBusy = false;
  $("heroBar").style.width = "100%";
  markHeroSteps(READ_STEPS.length);
  setLandingPhase("overview");
}

async function startDemo({ pitch = false } = {}) {
  if (demoStarted) return;
  demoStarted = true;
  await load();
  $("landing").style.display = "none";
  $("app").classList.add("on");
  bindViewer();
  selected = "A0-025";
  mode = "customer";
  setMode("customer");
  requestAnimationFrame(() => {
    requestAnimationFrame(fitView);
  });
  if (pitch) runPitch();
}

async function enterFromHero({ pitch = false } = {}) {
  if (landingPhase === "reading") skipLandingRead();
  if (landingPhase === "upload") await playLandingRead();
  await startDemo({ pitch });
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
    enterFromHero({ pitch: true });
    return;
  }
  runPitch();
}

function openModal() {
  $("modalList").innerHTML = `
    <li>Included: 4 rooms with H2 + TP3 (A0-022, 023, 025, 026)</li>
    <li>Included: A0-006 with TP2 × 3, WC/basin symbols, elbow taps</li>
    <li>Included as extra / flagged: hatch schedule IL.4–7</li>
    <li>Blocked: H2 lengths, kit contents, unverified hatch floor, codes with no product</li>
    <li>Not in the customer list: doors/windows, and H1/H2 on other floors</li>
    <li>Draft recovered: 63 of 69 API lines (export was cut)</li>`;
  $("sentMsg").hidden = true;
  $("modal").classList.add("on");
}

$("tryExample").addEventListener("click", () => startDemo({ pitch: false }));
$("uploadExample").addEventListener("click", () => playLandingRead());
$("pick1091").addEventListener("click", (e) => {
  e.stopPropagation();
  playLandingRead();
});
$("skipRead").addEventListener("click", skipLandingRead);
$("pitchFromHero").addEventListener("click", () => enterFromHero({ pitch: true }));
$("pitchBtn").addEventListener("click", togglePitch);

const heroSheet = $("heroSheet");
["dragenter", "dragover"].forEach((ev) => {
  heroSheet.addEventListener(ev, (e) => {
    e.preventDefault();
    if (landingPhase === "upload") heroSheet.classList.add("dragover");
  });
});
heroSheet.addEventListener("dragleave", () => heroSheet.classList.remove("dragover"));
heroSheet.addEventListener("drop", (e) => {
  e.preventDefault();
  heroSheet.classList.remove("dragover");
  if (landingPhase === "upload") playLandingRead();
});

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
