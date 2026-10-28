const $ = (id) => document.getElementById(id);

let job = null;
let mode = "customer";
let selected = null;

async function load() {
  try {
    const res = await fetch("data/job.json");
    job = await res.json();
  } catch (err) {
    throw new Error(
      "Could not load data/job.json. Open this site via Cloudflare or run python3 -m http.server 4173 in the project folder (do not double-click the HTML file)."
    );
  }
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
  let g = ghosts
    .map(
      ([x, y, w, h]) =>
        `<rect class="ghost" x="${x}" y="${y}" width="${w}" height="${h}" />`
    )
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

function itemRows(items) {
  return items
    .map(
      (it) => `<div class="line">
        <span><strong>${it.code}</strong> ${it.text}</span>
        <span>${it.qty} ${it.unit}</span>
        ${pill(it.status)}
      </div>
      <div class="detail ${selected ? "on" : ""}">${it.why}</div>`
    )
    .join("");
}

function sideHtml() {
  if (mode === "specialist") {
    const checks = job.checks
      .map(
        (c) =>
          `<li class="${c.ok ? "ok" : ""}">${c.ok ? "✓" : "!"} ${c.text}</li>`
      )
      .join("");
    const rows = job.compare
      .map(
        (r) =>
          `<tr><td>${r.asked}</td><td>${r.drawn}</td><td>${r.basket}</td></tr>`
      )
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

$("tryExample").addEventListener("click", async () => {
  await load();
  $("landing").style.display = "none";
  $("app").classList.add("on");
  selected = "A0-025";
  render();
});

document.querySelectorAll(".mode button").forEach((b) => {
  b.addEventListener("click", () => setMode(b.dataset.mode));
});

$("requestBtn").addEventListener("click", () => {
  $("modalList").innerHTML = `
    <li>Included: 4 rooms with H2 + TP3 (A0-022, 023, 025, 026)</li>
    <li>Included: A0-006 with TP2 × 3</li>
    <li>Included as extra / flagged: hatch schedule IL.4–7</li>
    <li>Blocked: H2 lengths, kit contents, unverified hatch floor</li>`;
  $("sentMsg").hidden = true;
  $("modal").classList.add("on");
});
$("closeModal").addEventListener("click", () => $("modal").classList.remove("on"));
$("sendBtn").addEventListener("click", () => {
  $("sentMsg").hidden = false;
});
