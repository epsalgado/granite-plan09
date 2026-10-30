const $ = (id) => document.getElementById(id);

let job = null;
let catalog = { shelf: [], kit: [], hatch: [] };
let articles = [];
let flowItems = [];
let extraSeq = 0;
let catalogOpen = false;
let catalogQuery = "";
let catalogTag = "quoted";
let catalogLang = "en";
let step = "drawing";
let specialist = false;
let chooseIndex = 0;
let selected = null;
let pitchTimer = null;
let pitching = false;
let scale = 1;
let panX = 0;
let panY = 0;
let viewerBound = false;
let landingPhase = "upload";
let landingBusy = false;
let readToken = 0;
let demoStarted = false;
let requestSent = false;
let lineFilter = "fittings";
const BASE_W = 1600;
const STEPS = ["drawing", "reading", "found", "choose", "send"];

function showBanner(msg) {
  const el = $("bootBanner");
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error("Could not load " + path + " (" + res.status + ")");
  return res.json();
}

async function loadAll() {
  job = await loadJson("data/job.json");
  try {
    catalog = await loadJson("data/catalog.json");
  } catch (err) {
    catalog = { shelf: [], kit: [], hatch: [] };
  }
  try {
    const pack = await loadJson("data/articles.json");
    articles = pack.items || [];
  } catch (err) {
    articles = [];
  }
  flowItems = buildFlowItems();
}

function roomName(id) {
  const r = (job.rooms || []).find((x) => x.id === id);
  return r ? r.name : "";
}

function plainTitle(ln) {
  if (ln.kind === "shelf") return "Shelf H2";
  if (ln.kind === "kit") return ln.code === "TP2" ? "Wash-place kit TP2" : "Wash-place kit TP3";
  if (ln.kind === "hatch") return ln.code ? ln.code + " inspection hatch" : "Inspection hatch";
  if (ln.kind === "tap") return "Elbow tap";
  if (ln.kind === "sanitary") {
    const names = {
      "WC-stol": "WC",
      "Tvättställ": "Washbasin",
      "Stödarm": "Support arm",
      "Utslagsback": "Slop sink",
    };
    return names[ln.text] || "Sanitary fitting";
  }
  if (ln.kind === "unknown") return ln.code ? ln.code + " — no product type" : "Unidentified mark";
  if (ln.kind === "door") return "Door (other trade)";
  if (ln.kind === "window") return "Window (other trade)";
  if (ln.kind === "frame") return "Metal frame (other trade)";
  if (ln.kind === "request") return (ln.code || "Item") + " on another floor";
  return ln.text || ln.code || "Item";
}

function buildFlowItems() {
  const items = [];
  for (const ln of job.lines || []) {
    const base = {
      id: ln.id,
      lineId: ln.id,
      code: ln.code,
      kind: ln.kind,
      room: ln.room,
      qty: ln.qty,
      text: ln.text,
      title: plainTitle(ln),
      choice: null,
      group: "cant",
      question: "",
      options: [],
    };
    if (ln.kind === "shelf" && ln.scope !== "request only") {
      items.push({
        ...base,
        group: "need",
        question: "What length is this shelf in " + (ln.room || "this room") + "?",
        hint: "The floor plan marks H2. Length is on the room description, which was not uploaded.",
        options: catalog.shelf || [],
      });
    } else if (ln.kind === "kit") {
      items.push({
        ...base,
        group: "need",
        question: "Which wash-place type is " + (ln.code || "this kit") + " in " + (ln.room || "this room") + "?",
        hint: "TP2 / TP3 are package codes. Contents come from the type standard.",
        options: catalog.kit || [],
      });
    } else if (ln.kind === "hatch" && ln.code === "IL.5") {
      items.push({
        ...base,
        group: "need",
        question: "The sheet table says 16 × IL.5 hatches. Are they for this floor?",
        hint: "PLAN 09 is the sheet name, not proof they all install here.",
        options: catalog.hatch || [],
      });
    } else if (ln.kind === "hatch") {
      const hatchOpts = catalog.hatch || [];
      items.push({
        ...base,
        group: "ready",
        question: "Include " + (ln.code || "this hatch") + " from the sheet table?",
        hint: "Named on the hatch schedule. Still not counted on the floor.",
        options: hatchOpts,
        choice: hatchOpts.find((o) => o.id === "hatch-yes") || hatchOpts[0] || null,
      });
    } else if (ln.kind === "tap" && ln.room) {
      items.push({
        ...base,
        group: "need",
        question: "Include the elbow tap in " + ln.room + " on the request?",
        hint: "Drawn on the plan. Confirm the article with Ahlsell.",
        options: [
          { id: "tap-yes", article: null, name: "Yes — ask Ahlsell for the article", note: "No article number on this sheet." },
          { id: "tap-no", article: null, name: "Leave it to the specialist", note: "Will stay off the customer list." },
        ],
      });
    } else {
      items.push({
        ...base,
        group: "cant",
        reason:
          ln.kind === "request"
            ? "This room is in the email, not on PLAN 09."
            : ln.kind === "unknown"
              ? "No product type — do not invent an article."
              : ln.kind === "sanitary"
                ? "A symbol is drawn, but there is no type code."
                : "Not Ahlsell fittings from this drawing (other trade or other floor).",
      });
    }
  }
  return items;
}

function queue() {
  const order = { shelf: 0, kit: 1, hatch: 2, tap: 3 };
  return flowItems
    .filter((it) => it.group === "need")
    .sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
}

function currentChoose() {
  const q = queue();
  return q[Math.min(chooseIndex, Math.max(0, q.length - 1))] || null;
}

function counts() {
  const decided = flowItems.filter((it) => it.choice && it.choice.article !== undefined && it.choice.id !== "hatch-no" && it.choice.id !== "tap-no" && it.choice.id !== "shelf-unknown" && it.choice.id !== "kit-unknown");
  const questions = flowItems.filter((it) => it.choice && (it.choice.id || "").endsWith("unknown"));
  const need = flowItems.filter((it) => it.group === "need" && !it.choice);
  const needAll = flowItems.filter((it) => it.group === "need");
  const ready = flowItems.filter((it) => it.group === "ready");
  const added = flowItems.filter((it) => it.group === "added");
  const cant = flowItems.filter((it) => it.group === "cant");
  const inBasket = flowItems.filter((it) => it.choice && it.choice.id !== "hatch-no" && it.choice.id !== "tap-no");
  return { decided, questions, need, needAll, ready, added, cant, inBasket };
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
  if (!vp) return;
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
  if (!$("marks") || !job) return;
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
      select(el.dataset.room || el.dataset.id);
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
  if (!job) return;
  const mark =
    job.marks.find((m) => m.id === selected) ||
    job.marks.find((m) => (m.room || m.id) === selected);
  if (mark) zoomTo(mark.x, mark.y, 2.4);
}

function select(id) {
  selected = id;
  if (step === "choose") {
    const q = queue();
    const idx = q.findIndex((it) => it.room === id || it.code === id || it.id === id);
    if (idx >= 0) chooseIndex = idx;
  }
  render({ zoom: true });
}

function groupClass(it) {
  if (it.choice && it.choice.id && it.choice.id !== "hatch-no" && it.choice.id !== "tap-no") return "green";
  if (it.group === "need") return "amber";
  if (it.group === "ready") return "green";
  return "grey";
}

function foundHtml() {
  const c = counts();
  const block = (title, list, cls) => `
    <section class="group ${cls}">
      <h2>${title} <small>${list.length}</small></h2>
      ${list.length ? list.map((it) => `
        <button type="button" class="found-row ${selected === it.room || selected === it.id ? "sel" : ""}" data-item="${it.id}" data-room="${esc(it.room || "")}">
          <strong>${esc(itemTitle(it))}</strong>
          <span>${it.group === "added" ? "Added from catalog" : it.room ? esc(it.room) + (roomName(it.room) ? " · " + esc(roomName(it.room)) : "") : "From the sheet table"} · ${it.qty} ${it.qty > 1 ? "pcs" : "pc"}${it.choice && it.group === "need" ? " · " + esc(it.choice.name) : ""}</span>
        </button>`).join("") : `<p class="empty">None</p>`}
    </section>`;
  return `
    <div class="basket-head">
      <p class="cust-kicker">Customer request</p>
      <h2>What we found on PLAN 09</h2>
      <p>This is a first draft from one drawing. Nothing here is an order yet.</p>
    </div>
    ${block("Ready to choose", c.ready, "green")}
    ${c.added.length ? block("Added from the catalog", c.added, "green") : ""}
    ${block("Needs your answer", c.needAll, "amber")}
    ${block("Can’t be bought from this drawing", c.cant.slice(0, 12), "grey")}
    ${c.cant.length > 12 ? `<p class="draft-meta">${c.cant.length - 12} more stay off this request (doors, other floors).</p>` : ""}
    <p class="draft-meta">Need something else? Open <strong>Catalog</strong> and search the hackathon article list.</p>`;
}

function chooseHtml() {
  const q = queue();
  const it = currentChoose();
  if (!it) {
    return `<div class="basket-head"><h2>Choices done</h2><p>Continue to send the request.</p></div>`;
  }
  const n = q.filter((x) => x.choice).length;
  const options = (it.options || [])
    .map(
      (opt) => `<button type="button" class="choice ${it.choice && it.choice.id === opt.id ? "sel" : ""}" data-opt="${opt.id}">
        <strong>${esc(opt.name)}</strong>
        ${opt.article ? `<span class="art">Ahlsell ${esc(opt.article)}</span>` : ""}
        ${opt.note ? `<span>${esc(opt.note)}</span>` : ""}
        ${opt.parts ? `<span>${opt.parts.map((p) => esc(p.name)).join(" · ")}</span>` : ""}
      </button>`
    )
    .join("");
  return `
    <div class="basket-head">
      <p class="cust-kicker">Customer request · choose</p>
      <h2>${esc(it.title)}</h2>
      <p>${n} of ${q.length} decided</p>
    </div>
    <p class="ask">${esc(it.question)}</p>
    <p class="need always">${esc(it.hint || "")}</p>
    <div class="choices">${options}</div>`;
}

function sendHtml() {
  const c = counts();
  const rows = c.inBasket
    .map((it) => {
      const ch = it.choice || {};
      return `<tr>
        <td>${esc(it.room || "—")}</td>
        <td>${esc(itemTitle(it))}</td>
        <td>${it.qty}</td>
        <td>${esc(ch.article || "question")}</td>
        <td>${esc(choiceName(it))}</td>
      </tr>`;
    })
    .join("");
  return `
    <div class="basket-head">
      <p class="cust-kicker">Customer request · send</p>
      <h2>Send PLAN 09 as a request</h2>
      <p>Not an order. An Ahlsell specialist still checks lengths, kit types and hatch quantities.</p>
    </div>
    <p class="stamp">PARTIAL · NOT SIGNED</p>
    <table class="draft send-table">
      <thead><tr><th>Room</th><th>Item</th><th>Qty</th><th>Article</th><th>Your choice</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">Nothing added yet — you can still send the questions.</td></tr>`}</tbody>
    </table>
    <p class="draft-meta">${c.need.length} still need an answer · ${c.cant.length} cannot be bought from this drawing</p>
    <div class="send-actions">
      <button type="button" class="btn-ghost light" id="csvBtn">Download CSV</button>
      <span id="sentMsg" ${requestSent ? "" : "hidden"}>Sent. A specialist will check this floor.</span>
    </div>`;
}

function specialistHtml() {
  const checks = (job.checks || [])
    .map((c) => `<li class="${c.ok ? "ok" : ""}">${c.ok ? "✓" : "!"} ${esc(c.text)}</li>`)
    .join("");
  const lines = (job.lines || []).filter((ln) => {
    if (lineFilter === "all") return true;
    if (lineFilter === "fittings") return ["shelf", "kit", "hatch", "tap", "sanitary", "unknown"].includes(ln.kind);
    if (lineFilter === "noroom") return !ln.room;
    if (lineFilter === "nocode") return !ln.code;
    if (lineFilter === "request") return ln.kind === "request";
    if (lineFilter === "doors") return ["door", "window", "frame"].includes(ln.kind);
    return true;
  });
  const filters = [
    ["fittings", "Fittings"],
    ["all", "All 63"],
    ["noroom", "No room"],
    ["nocode", "No code"],
    ["doors", "Doors"],
    ["request", "Other floors"],
  ]
    .map(([id, label]) => `<button type="button" class="filter-btn ${lineFilter === id ? "active" : ""}" data-filter="${id}">${label}</button>`)
    .join("");
  const rows = lines
    .map((ln) => `<tr data-line="${ln.id}" data-room="${esc(ln.room || "")}" data-code="${esc(ln.code || "")}">
      <td>${esc(ln.code || "—")}</td>
      <td>${esc(ln.text)}</td>
      <td>${ln.qty}</td>
      <td>${esc(ln.room || "—")}</td>
    </tr>`)
    .join("");
  return `
    <div class="basket-head spec-head">
      <p class="spec-kicker">Specialist · Bluebeam-style check</p>
      <h2>Markups list</h2>
      <p>${esc(job.apiNote)} Subject = code. Space = room. You still sign.</p>
    </div>
    <ul class="checks">${checks}</ul>
    <div class="filters">${filters}</div>
    <div class="draft-wrap">
      <table class="draft">
        <thead><tr><th>Subject</th><th>Comment</th><th>Count</th><th>Space</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function sideHtml() {
  if (specialist) return specialistHtml();
  if (step === "choose") return chooseHtml();
  if (step === "send") return sendHtml();
  return foundHtml();
}

const CAT_TAGS = [
  ["quoted", { en: "In a quote", sv: "I offert" }],
  ["shelf", { en: "Shelf", sv: "Hylla" }],
  ["hook", { en: "Hook", sv: "Krok" }],
  ["hygiene", { en: "Hygiene", sv: "Hygien" }],
  ["hatch", { en: "Hatch", sv: "Lucka" }],
  ["wc", { en: "WC", sv: "WC" }],
  ["door", { en: "Door", sv: "Dörr" }],
  ["all", { en: "All", sv: "Alla" }],
];

function articleBlob(it) {
  return (
    it.a +
    " " +
    (it.n || "") +
    " " +
    (it.n2 || "") +
    " " +
    (it.ne || "") +
    " " +
    (it.t || []).join(" ")
  ).toLowerCase();
}

function articleLabel(it) {
  if (catalogLang === "en" && it.ne) return it.ne;
  return [it.n, it.n2].filter(Boolean).join(" · ");
}

function itemTitle(it) {
  if (it.group === "added") {
    return catalogLang === "sv" ? it.titleSv || it.title : it.titleEn || it.title;
  }
  return it.title;
}

function choiceName(it) {
  const ch = it.choice || {};
  if (it.group === "added") {
    return catalogLang === "sv" ? ch.nameSv || ch.name || "" : ch.nameEn || ch.name || "";
  }
  return ch.name || "";
}

function applyCatalogChrome() {
  const sv = catalogLang === "sv";
  $("catTitle").textContent = sv ? "Katalog" : "Catalog";
  $("catClose").textContent = sv ? "Stäng" : "Close";
  $("catNote").textContent = sv
    ? "Officiella namn är svenska. EN är en visningstext. Sök fungerar på båda språken."
    : "Official names are Swedish. EN is a demo gloss. Search works in both.";
  $("catSearch").placeholder = sv
    ? "Sök svenska eller engelska (hylla, shelf, 309452…)"
    : "Search Swedish or English (hylla, shelf, 309452…)";
  $("catLang")
    .querySelectorAll("[data-lang]")
    .forEach((btn) => btn.classList.toggle("on", btn.dataset.lang === catalogLang));
}

function filteredArticles() {
  const terms = catalogQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const it of articles) {
    if (catalogTag === "quoted" && !(it.q || []).length) continue;
    if (catalogTag !== "all" && catalogTag !== "quoted" && !(it.t || []).includes(catalogTag)) continue;
    if (terms.length && !terms.every((t) => articleBlob(it).includes(t))) continue;
    out.push(it);
    if (out.length >= 60) break;
  }
  return out;
}

function renderCatalog() {
  if (!catalogOpen) return;
  applyCatalogChrome();
  const sv = catalogLang === "sv";
  $("catTags").innerHTML = CAT_TAGS.map(
    ([id, label]) =>
      `<button type="button" class="filter-btn ${catalogTag === id ? "active" : ""}" data-cat-tag="${id}">${label[catalogLang]}</button>`
  ).join("");
  const hits = filteredArticles();
  const quotedN = articles.filter((it) => (it.q || []).length).length;
  $("catCount").textContent = catalogQuery.trim()
    ? sv
      ? `${hits.length}${hits.length === 60 ? "+" : ""} träffar`
      : `${hits.length}${hits.length === 60 ? "+" : ""} matches`
    : catalogTag === "quoted"
      ? sv
        ? `Visar ${hits.length} av ${quotedN} artiklar från offerterna`
        : `Showing ${hits.length} of ${quotedN} articles from the four quotes`
      : sv
        ? `Visar ${hits.length} av ${articles.length} i listan`
        : `Showing ${hits.length} of ${articles.length} in this list`;
  $("catList").innerHTML = hits.length
    ? hits
        .map((it) => {
          const inReq = flowItems.some((x) => x.choice && x.choice.article === it.a && x.group === "added");
          return `<button type="button" class="cat-row ${inReq ? "in" : ""}" data-add-art="${it.a}">
            <strong>Ahlsell ${esc(it.a)}</strong>
            <span>${esc(articleLabel(it))}</span>
            <em>${inReq ? (sv ? "På förfrågan" : "On the request") : (sv ? "Lägg till" : "Add to request")} · ${esc(it.u || "ST")}${(it.q || []).length ? (sv ? " · offert" : " · quoted") : ""}</em>
          </button>`;
        })
        .join("")
    : `<p class="empty">${sv ? "Ingen träff. Prova artikelnummer, hylla eller shelf." : "Nothing in this list matches. Try an article number, hylla, or shelf."}</p>`;
  $("catTags").querySelectorAll("[data-cat-tag]").forEach((el) => {
    el.addEventListener("click", () => {
      catalogTag = el.dataset.catTag;
      renderCatalog();
    });
  });
  $("catList").querySelectorAll("[data-add-art]").forEach((el) => {
    el.addEventListener("click", () => addFromCatalog(el.dataset.addArt));
  });
}

function openCatalog() {
  if (!job) return;
  catalogOpen = true;
  $("catOverlay").hidden = false;
  renderCatalog();
  $("catSearch").value = catalogQuery;
  $("catSearch").focus();
}

function closeCatalog() {
  catalogOpen = false;
  $("catOverlay").hidden = true;
}

function addFromCatalog(article) {
  const it = articles.find((x) => x.a === article);
  if (!it) return;
  const existing = flowItems.find((x) => x.group === "added" && x.choice && x.choice.article === it.a);
  if (existing) {
    existing.qty += 1;
  } else {
    extraSeq += 1;
    const nameSv = [it.n, it.n2].filter(Boolean).join(" · ");
    const nameEn = it.ne || nameSv;
    flowItems.push({
      id: "extra-" + extraSeq,
      lineId: "extra-" + extraSeq,
      code: it.a,
      kind: "catalog",
      room: "",
      qty: 1,
      text: nameSv,
      title: nameEn || nameSv || "Ahlsell " + it.a,
      titleSv: nameSv,
      titleEn: nameEn,
      group: "added",
      question: "",
      options: [],
      choice: { id: "cat-" + it.a, article: it.a, name: nameEn || nameSv, nameSv, nameEn },
    });
  }
  render({ zoom: false });
  renderCatalog();
}

function setRole(next) {
  specialist = !!next;
  if (catalogOpen) closeCatalog();
  render({ zoom: false });
}

function updateChrome() {
  document.querySelectorAll(".steps a").forEach((a) => {
    const name = a.getAttribute("href").slice(1);
    a.classList.toggle("on", name === step);
    a.classList.toggle("done", STEPS.indexOf(name) < STEPS.indexOf(step));
  });
  $("app").dataset.role = specialist ? "specialist" : "customer";
  $("custBtn").classList.toggle("on", !specialist);
  $("specBtn").classList.toggle("on", specialist);
  $("catalogBtn").classList.toggle("active", catalogOpen);
  const addedN = flowItems.filter((it) => it.group === "added").length;
  $("catalogBtn").textContent = addedN ? `Catalog (${addedN})` : "Catalog";
  $("app").dataset.step = step;
  $("steps").hidden = specialist;
  $("specToolsLabel").hidden = !specialist;
  $("trust").hidden = !specialist;
  const banner = $("roleBanner");
  const sheetTitle = $("sheetTitle");
  const c = counts();
  const q = queue();
  if (specialist) {
    banner.textContent = "Specialist check · Markups list · you still sign this draft";
    if (sheetTitle) sheetTitle.textContent = "PLAN 09 · specialist markups";
    $("flowStatus").textContent = "63-line API draft · not the customer basket";
    $("continueBtn").textContent = "Back to customer";
    $("backBtn").disabled = true;
  } else {
    banner.textContent = "Customer request · simple path · still not an order";
    if (sheetTitle) sheetTitle.textContent = "A-40-1-1091 · PLAN 09";
    $("backBtn").disabled = false;
    if (step === "found") {
      $("flowStatus").textContent = `${c.need.length} need an answer · ${c.ready.length} ready${c.added.length ? " · " + c.added.length + " added" : ""} · ${c.cant.length} not from this drawing`;
      $("continueBtn").textContent = "Choose products";
    } else if (step === "choose") {
      const n = q.filter((x) => x.choice).length;
      $("flowStatus").textContent = `${n} of ${q.length} decided · ${c.inBasket.length} in the request`;
      $("continueBtn").textContent = n >= q.length ? "Review request" : "Next";
    } else {
      $("flowStatus").textContent = `${c.inBasket.length} lines on the request · still not an order`;
      $("continueBtn").textContent = "Send request";
    }
  }
}

function render(opts = {}) {
  if (!job) return;
  $("drawingName").textContent = "· " + job.drawing;
  if (specialist) {
    $("trust").hidden = false;
    $("trust").innerHTML = `
      <div class="t-card warn"><strong>API draft</strong><b>63/69</b><span>${esc(job.apiNote)}</span></div>
      <div class="t-card ok"><strong>Email vs plan</strong><b>4 match</b><span>Named H2 rooms are here</span></div>
      <div class="t-card warn"><strong>Old quote</strong><b>No H2</b><span>Never listed these shelves</span></div>
      <div class="t-card extra"><strong>This path</strong><b>Specialist</b><span>Switch back to Customer for the request flow</span></div>`;
  }
  const pillEl = $("sheetPill");
  if (pillEl) {
    const it = flowItems.find((x) => x.id === selected || x.room === selected);
    if (it) pillEl.textContent = `${it.room || it.code || ""} · ${it.title}`;
    else pillEl.textContent = "Click a pin to see it in the list";
  }
  drawMarks();
  $("side").innerHTML = sideHtml();
  $("side").querySelectorAll("[data-item]").forEach((el) => {
    el.addEventListener("click", () => {
      selected = el.dataset.room || el.dataset.item;
      const q = queue();
      const idx = q.findIndex((it) => it.id === el.dataset.item);
      if (idx >= 0) {
        chooseIndex = idx;
        if (step === "found") setStep("choose");
        else render({ zoom: true });
      } else {
        render({ zoom: true });
      }
    });
  });
  $("side").querySelectorAll("[data-opt]").forEach((el) => {
    el.addEventListener("click", () => pickOption(el.dataset.opt));
  });
  $("side").querySelectorAll("[data-filter]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      lineFilter = el.dataset.filter;
      render({ zoom: false });
    });
  });
  $("side").querySelectorAll("tr[data-line]").forEach((el) => {
    el.addEventListener("click", () => {
      selected = el.dataset.room || el.dataset.code;
      render({ zoom: true });
    });
  });
  const csv = $("csvBtn");
  if (csv) csv.addEventListener("click", downloadCsv);
  updateChrome();
  if (opts.zoom) focusSelected();
}

function pickOption(optId) {
  const it = currentChoose();
  if (!it) return;
  it.choice = (it.options || []).find((o) => o.id === optId) || { id: optId, name: optId };
  const q = queue();
  if (chooseIndex < q.length - 1) chooseIndex += 1;
  const next = currentChoose();
  selected = next ? next.room || next.id : selected;
  render({ zoom: true });
}

function downloadCsv() {
  const c = counts();
  const header = "room,item,qty,article,choice";
  const rows = c.inBasket.map((it) =>
    [it.room || "", itemTitle(it), it.qty, (it.choice && it.choice.article) || "", choiceName(it)]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "granite-plan09-request.csv";
  a.click();
}

function setStep(next, { silent = false } = {}) {
  if (!STEPS.includes(next)) return;
  if (next === "drawing" || next === "reading") {
    goLanding(next);
    return;
  }
  step = next;
  if (!silent) {
    const hash = "#" + next;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }
  if (next === "choose") {
    const q = queue();
    const undone = q.findIndex((it) => !it.choice);
    chooseIndex = undone >= 0 ? undone : 0;
    const it = currentChoose();
    if (it) selected = it.room || it.id;
  }
  if (next === "found") selected = selected || "A0-025";
  render({ zoom: next === "choose" });
  requestAnimationFrame(() => requestAnimationFrame(fitView));
}

function goLanding(phase) {
  demoStarted = false;
  $("app").classList.remove("on");
  $("landing").hidden = false;
  $("landing").style.display = "";
  if (phase === "reading") {
    if (landingPhase === "upload") playLandingRead();
    else setLandingPhase("reading");
    history.replaceState(null, "", "#reading");
  } else if (phase === "overview") {
    setLandingPhase("overview");
    history.replaceState(null, "", "#drawing");
  } else {
    setLandingPhase("upload");
    history.replaceState(null, "", "#drawing");
  }
}

const READ_STEPS = [
  [12, "File received"],
  [28, "Reading room names"],
  [48, "5 wash-place kits found"],
  [68, "4 shelves found — no lengths"],
  [86, "Hatch table on the right"],
  [100, "Doors are another trade"],
];

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
    pill.textContent = "Reading…";
    label.textContent = "A-40-1-1091 · PLAN 09";
  } else {
    pill.textContent = "Draft ready";
    label.textContent = "A-40-1-1091 · PLAN 09";
  }
}

function markHeroSteps(activeIdx) {
  $("heroSteps").querySelectorAll("li").forEach((li, i) => {
    li.classList.toggle("on", i === activeIdx);
    li.classList.toggle("done", activeIdx >= 0 && i < activeIdx);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function playLandingRead() {
  if (landingBusy && landingPhase === "reading") return;
  landingBusy = true;
  const token = ++readToken;
  setLandingPhase("reading");
  history.replaceState(null, "", "#reading");
  loadAll().catch((err) => showBanner(String(err.message || err)));
  $("heroBar").style.width = "0%";
  for (let i = 0; i < READ_STEPS.length; i++) {
    if (token !== readToken) return;
    const [pct, text] = READ_STEPS[i];
    $("heroStatus").textContent = text;
    $("heroBar").style.width = pct + "%";
    markHeroSteps(i);
    await sleep(i === 0 ? 600 : 1000);
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
  showBanner("");
  try {
    if (!job) await loadAll();
  } catch (err) {
    showBanner("Could not start: " + (err.message || err));
    demoStarted = false;
    return;
  }
  demoStarted = true;
  $("landing").style.display = "none";
  $("landing").hidden = true;
  $("app").classList.add("on");
  bindViewer();
  selected = "A0-025";
  specialist = false;
  setStep("found");
  if (pitch) runPitch();
}

async function enterFromHero({ pitch = false } = {}) {
  if (landingPhase === "reading") skipLandingRead();
  if (landingPhase === "upload") await playLandingRead();
  await startDemo({ pitch });
}

function continueFlow() {
  if (specialist) {
    setRole(false);
    return;
  }
  if (step === "found") {
    setStep("choose");
    return;
  }
  if (step === "choose") {
    const q = queue();
    const it = currentChoose();
    if (it && !it.choice && chooseIndex < q.length - 1) {
      chooseIndex += 1;
      const next = currentChoose();
      selected = next ? next.room || next.id : selected;
      render({ zoom: true });
      return;
    }
    setStep("send");
    return;
  }
  if (step === "send") {
    requestSent = true;
    render({ zoom: false });
  }
}

function backFlow() {
  if (step === "send") setStep("choose");
  else if (step === "choose") setStep("found");
  else if (step === "found") goLanding("overview");
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
    { t: 0, caption: "1 · Four H2 rooms — we need the shelf length", step: "found", room: "A0-022" },
    { t: 3500, caption: "1 · Four H2 rooms — we need the shelf length", step: "found", room: "A0-025" },
    { t: 7000, caption: "2 · Choose: one question at a time", step: "choose", room: "A0-025" },
    { t: 13000, caption: "3 · Send as a request, not an order", step: "send", room: "A0-025" },
  ];
  pitchTimer = beats.map((b) =>
    setTimeout(() => {
      if (!pitching) return;
      specialist = false;
      selected = b.room;
      setStep(b.step);
      setPitchCaption(b.caption);
    }, b.t)
  );
}

function stopPitch() {
  pitching = false;
  document.body.classList.remove("pitch");
  $("pitchBtn").textContent = "Pitch mode";
  setPitchCaption("");
  if (pitchTimer) pitchTimer.forEach(clearTimeout);
  pitchTimer = [];
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

function onHash() {
  const h = (location.hash || "#drawing").slice(1);
  if (h === "drawing") {
    goLanding("upload");
    return;
  }
  if (h === "reading") {
    goLanding("reading");
    return;
  }
  if (["found", "choose", "send"].includes(h)) {
    if (!demoStarted || !job) startDemo().then(() => setStep(h, { silent: true }));
    else setStep(h, { silent: true });
  }
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
$("custBtn").addEventListener("click", () => setRole(false));
$("specBtn").addEventListener("click", () => setRole(true));
$("continueBtn").addEventListener("click", continueFlow);
$("backBtn").addEventListener("click", backFlow);
$("catalogBtn").addEventListener("click", () => (catalogOpen ? closeCatalog() : openCatalog()));
$("catClose").addEventListener("click", closeCatalog);
$("catOverlay").addEventListener("click", (e) => {
  if (e.target === $("catOverlay")) closeCatalog();
});
$("catSearch").addEventListener("input", () => {
  catalogQuery = $("catSearch").value;
  renderCatalog();
});
$("catLang").querySelectorAll("[data-lang]").forEach((btn) => {
  btn.addEventListener("click", () => {
    catalogLang = btn.dataset.lang;
    renderCatalog();
    if (demoStarted && job) render({ zoom: false });
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && catalogOpen) closeCatalog();
});

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

window.addEventListener("hashchange", onHash);
if (location.hash && location.hash !== "#drawing") onHash();
