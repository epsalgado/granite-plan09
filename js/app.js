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
let scale = 1;
let panX = 0;
let panY = 0;
let viewerBound = false;
let landingPhase = "upload";
let landingBusy = false;
let readToken = 0;
let sheetChosen = false;
let demoStarted = false;
let requestSent = false;
let lineFilter = "fittings";
let compareState = null;
let compareBusy = false;
let landingRole = "customer";
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

function questionGroups() {
  const map = new Map();
  for (const it of queue()) {
    const key =
      it.kind === "kit"
        ? "kit:" + (it.code || "kit")
        : it.kind === "hatch"
          ? "hatch:" + (it.code || "hatch")
          : it.kind;
    if (!map.has(key)) {
      const title =
        it.kind === "shelf"
          ? "H2 shelves"
          : it.kind === "kit"
            ? it.code === "TP2"
              ? "Wash-place kits TP2"
              : "Wash-place kits TP3"
            : it.kind === "hatch"
              ? (it.code || "Hatch") + " hatches"
              : "Elbow taps";
      const question =
        it.kind === "shelf"
          ? "The drawing marks H2, but not the length. What should we put on the request?"
          : it.kind === "kit"
            ? `The drawing marks ${it.code || "a wash-place kit"}, but not the contents. What should we put on the request?`
            : it.kind === "hatch"
              ? "The sheet table lists 16 × IL.5 hatches. Put them on this floor’s request?"
              : "Elbow taps are drawn. Put them on the request?";
      map.set(key, {
        key,
        kind: it.kind,
        code: it.code,
        title,
        question,
        hint: it.hint,
        options: it.options || [],
        items: [],
      });
    }
    map.get(key).items.push(it);
  }
  const order = ["shelf", "kit:TP3", "kit:TP2", "hatch:IL.5", "tap"];
  return [...map.values()].sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

function currentGroup() {
  const groups = questionGroups();
  if (!groups.length) return null;
  return groups[Math.min(chooseIndex, groups.length - 1)];
}

function optionVerb(opt) {
  const id = opt.id || "";
  if (id.endsWith("unknown") || id === "hatch-no" || id === "tap-no") return "Send as a question";
  return "Put on the request";
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

function zoomToFit(marks) {
  const vp = $("viewport");
  if (!vp || !marks.length) return;
  const vw = vp.clientWidth;
  const vh = vp.clientHeight;
  if (vw < 40 || vh < 40) return;
  const { w, h } = imgSize();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const m of marks) {
    minX = Math.min(minX, m.x);
    maxX = Math.max(maxX, m.x);
    minY = Math.min(minY, m.y);
    maxY = Math.max(maxY, m.y);
  }
  const spanX = Math.max(maxX - minX, 16);
  const spanY = Math.max(maxY - minY, 12);
  const marginPx = 64;
  const scaleX = (vw - 2 * marginPx) / ((spanX / 100) * w);
  const scaleY = (vh - 2 * marginPx) / ((spanY / 100) * h);
  let s = Math.min(scaleX, scaleY);
  if (!isFinite(s) || s <= 0) s = 1;
  scale = Math.min(2.8, Math.max(0.4, s));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  panX = vw / 2 - (cx / 100) * w * scale;
  panY = vh / 2 - (cy / 100) * h * scale;
  applyView();
}

function customerFocusSet() {
  const rooms = new Set();
  const codes = new Set();
  for (const it of flowItems) {
    if (it.group !== "need" && it.group !== "ready") continue;
    if (it.room) rooms.add(it.room);
    if (it.code) codes.add(normCode(it.code));
  }
  return { rooms, codes };
}

function comparePinClass(m) {
  if (!compareState || compareState.source === "Could not compare") return "";
  const isRoom = String(m.label || m.id).startsWith("A0-");
  const label = normCode(m.label || m.code);
  const room = normSpace(m.id || m.room || m.label);
  const rank = { extra: 4, diff: 3, miss: 2, same: 1 };
  let best = 0;
  let cls = "dim";
  const consider = (status, r) => {
    const sub = normCode(r.subject);
    const spaces = String(r.space || "")
      .split(",")
      .map((x) => normSpace(x))
      .filter(Boolean);
    const ok = isRoom ? spaces.includes(room) : sub === label;
    if (!ok) return;
    if (rank[status] > best) {
      best = rank[status];
      cls = "cmp-" + status;
    }
  };
  compareState.onlyBluebeam.forEach((r) => consider("extra", r));
  compareState.different.forEach((r) => consider("diff", r));
  compareState.onlyGranite.forEach((r) => consider("miss", r));
  compareState.same.forEach((r) => consider("same", r));
  return cls;
}

function pinTone(m) {
  if (specialist) return comparePinClass(m);
  const { rooms, codes } = customerFocusSet();
  const on =
    rooms.has(m.id) ||
    rooms.has(m.label) ||
    rooms.has(m.room) ||
    codes.has(normCode(m.label)) ||
    codes.has(normCode(m.code));
  return on ? "" : "dim";
}

function visibleMarks() {
  return (job.marks || []).filter((m) => {
    const label = String(m.label || m.id);
    if (label.startsWith("A0-")) return true;
    if (/^(H2|TP2|TP3|S1|IL|AK)/.test(label)) return true;
    return false;
  });
}

function drawMarks() {
  if (!$("marks") || !job) return;
  $("marks").innerHTML = visibleMarks()
    .map((m) => {
      const room = m.room || m.id;
      const sel = pinSelected(m) ? "sel" : "";
      const kind = String(m.label).startsWith("A0-")
        ? "room"
        : String(m.label).startsWith("IL")
          ? "extra"
          : "code";
      const tone = pinTone(m);
      return `<button type="button" class="pin ${kind} ${sel} ${tone}" data-id="${m.id}" data-room="${room}"
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

function markFor(id) {
  if (!job || !id) return null;
  const marks = job.marks || [];
  const hit =
    marks.find((m) => m.id === id) ||
    marks.find((m) => m.room === id) ||
    marks.find((m) => m.label === id) ||
    marks.find((m) => m.code === id);
  if (hit) return hit;
  const it = (flowItems || []).find((x) => x.id === id || x.room === id || x.code === id);
  if (!it) return null;
  return (
    marks.find((m) => m.id === it.room || m.room === it.room) ||
    marks.find((m) => m.label === it.code || m.code === it.code || m.id === it.code) ||
    null
  );
}

function groupFocusIds() {
  if (step !== "choose") return null;
  const g = currentGroup();
  if (!g) return null;
  const ids = new Set();
  for (const it of g.items) {
    if (it.room) ids.add(it.room);
    if (it.code) ids.add(it.code);
    if (it.id) ids.add(it.id);
  }
  return ids;
}

function pinSelected(m) {
  if (step === "choose") {
    const g = currentGroup();
    if (g) {
      const rooms = new Set(g.items.map((it) => it.room).filter(Boolean));
      const codes = new Set(g.items.map((it) => it.code).filter(Boolean));
      if (rooms.has(m.id) || rooms.has(m.label) || rooms.has(m.room)) return true;
      if (codes.has(m.label) || codes.has(m.code)) return true;
    }
  }
  if (!selected) return false;
  if (m.id === selected || m.room === selected || m.label === selected || m.code === selected) return true;
  const it = (flowItems || []).find((x) => x.id === selected);
  return !!(it && (it.room === m.id || it.room === m.room || it.code === m.label || it.code === m.code || it.code === m.id));
}

function marksForFocus() {
  const g = step === "choose" ? currentGroup() : null;
  if (g && job) {
    const marks = job.marks || [];
    const rooms = [...new Set(g.items.map((it) => it.room).filter(Boolean))];
    const roomHits = rooms
      .map((r) => marks.find((m) => m.id === r || m.label === r))
      .filter(Boolean);
    if (roomHits.length) return roomHits;
    const codes = [...new Set(g.items.map((it) => it.code).filter(Boolean))];
    const codeHits = marks.filter((m) => codes.includes(m.label) || codes.includes(m.code));
    if (codeHits.length) return codeHits;
  }
  const one = markFor(selected);
  return one ? [one] : [];
}

function focusSelected() {
  const marks = marksForFocus();
  if (!marks.length) return;
  zoomToFit(marks);
}

function select(id) {
  selected = id;
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
  const shelves = c.needAll.filter((it) => it.kind === "shelf").length;
  const kits = c.needAll.filter((it) => it.kind === "kit").length;
  const hatchesAsk = c.needAll.filter((it) => it.kind === "hatch").length;
  const taps = c.needAll.filter((it) => it.kind === "tap").length;
  const hatchReady = c.ready.filter((it) => it.kind === "hatch").map((it) => it.code).filter(Boolean);
  const hatchLabel = hatchReady.length ? hatchReady.join(", ") : "named hatches";
  const askBits = [
    shelves ? `${shelves} shelves (no length)` : "",
    kits ? `${kits} wash-place kits (no type)` : "",
    hatchesAsk ? `${hatchesAsk} hatch line from the table` : "",
    taps ? `${taps} elbow taps` : "",
  ].filter(Boolean);
  return `
    <div class="basket-head">
      <p class="cust-kicker">Customer · what we found</p>
      <h2>What goes on your request</h2>
      <p>Bright pins are this request. Click a card to zoom, then press Start questions. You are not shopping yet.</p>
    </div>
    <button type="button" class="brief ok ${selected === "IL.4" ? "sel" : ""}" data-zoom="IL.4">
      <strong>Already on the request</strong>
      <p>${c.ready.length} hatch types from the sheet table (${esc(hatchLabel)}). No question — they are already included.</p>
      <p class="how">Click to see the hatch table on the drawing</p>
    </button>
    <button type="button" class="brief ask ${selected === "A0-026" ? "sel" : ""}" data-zoom="A0-026">
      <strong>We will ask you next</strong>
      <p>${esc(askBits.join(" · ") || "A few items still need a product.")}</p>
      <p class="how">Click to see the rooms · then press Start questions</p>
    </button>
    <div class="brief off">
      <strong>Another trade / other floors</strong>
      <p>Doors, windows and rooms that are not on PLAN 09 stay off this request.</p>
    </div>`;
}

function chooseHtml() {
  const groups = questionGroups();
  const g = currentGroup();
  if (!g) {
    return `<div class="basket-head"><p class="cust-kicker">Customer · choose</p><h2>Questions done</h2><p>Press Review request to see the list before you send.</p></div>`;
  }
  const rooms = [...new Set(g.items.map((it) => it.room).filter(Boolean))];
  const picked = g.items[0] && g.items[0].choice;
  const skip = picked && optionVerb(picked) === "Send as a question";
  const options = (g.options || [])
    .map((opt) => {
      const verb = optionVerb(opt);
      const on = picked && picked.id === opt.id;
      return `<button type="button" class="choice ${on ? "sel" : ""} ${verb === "Send as a question" ? "skip" : ""}" data-opt="${opt.id}">
        <span class="act">${esc(verb)}</span>
        <strong>${esc(opt.name)}</strong>
        ${opt.article ? `<span class="art">Ahlsell ${esc(opt.article)}</span>` : ""}
        ${opt.note ? `<span>${esc(opt.note)}</span>` : ""}
        ${opt.parts ? `<span>${opt.parts.map((p) => esc(p.name)).join(" · ")}</span>` : ""}
      </button>`;
    })
    .join("");
  const where = rooms.length ? rooms.join(", ") : "from the sheet table";
  return `
    <div class="basket-head">
      <p class="cust-kicker">Customer · choose</p>
      <p class="q-progress">Question ${chooseIndex + 1} of ${groups.length}</p>
      <h2>${esc(g.title)}</h2>
      <p>${g.items.length} on PLAN 09 · ${esc(where)}</p>
    </div>
    <p class="ask">${esc(g.question)}</p>
    ${
      rooms.length > 1
        ? `<p class="apply-all">This answer applies to all ${rooms.length} rooms: ${esc(rooms.join(", "))}.</p>`
        : ""
    }
    <p class="need always">${esc(g.hint || "")}</p>
    <div class="choices">${options}</div>
    ${
      picked
        ? `<p class="picked-note">${skip ? "Saved as a question for Ahlsell." : "Saved on the request."} Press Next question.</p>`
        : `<p class="need always">Pick one box. This is still not an order.</p>`
    }
    <p class="cat-hint">Need a different article? Catalog is top right — it has names and numbers, not specs.</p>`;
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
    <p class="draft-meta">${c.need.length} still need an answer · doors and other floors stay off this list</p>
    <div class="send-actions">
      <button type="button" class="btn-orange" id="reqXlsBtn">Download request Excel</button>
      <button type="button" class="btn-ghost light" id="csvBtn">Download request CSV</button>
      <span id="sentMsg" ${requestSent ? "" : "hidden"}>Sent. A specialist will check this floor.</span>
    </div>`;
}

function filteredLines() {
  return (job.lines || []).filter((ln) => {
    if (lineFilter === "all") return true;
    if (lineFilter === "fittings") return ["shelf", "kit", "hatch", "tap", "sanitary", "unknown"].includes(ln.kind);
    if (lineFilter === "noroom") return !ln.room;
    if (lineFilter === "nocode") return !ln.code;
    if (lineFilter === "request") return ln.kind === "request";
    if (lineFilter === "doors") return ["door", "window", "frame"].includes(ln.kind);
    return true;
  });
}

function specialistHtml() {
  const checks = (job.checks || [])
    .map((c) => `<li class="${c.ok ? "ok" : ""}">${c.ok ? "✓" : "!"} ${esc(c.text)}</li>`)
    .join("");
  const lines = filteredLines();
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
    ${compareHtml()}
    <div class="basket-head spec-head">
      <p class="spec-kicker">Our draft · after you check</p>
      <h2>Markups list</h2>
      <p>${esc(job.apiNote)} Subject = code. Space = room. You still sign.</p>
    </div>
    <details class="bb-notes">
      <summary>Draft notes · ${(job.checks || []).length}</summary>
      <ul class="checks">${checks}</ul>
    </details>
    <div class="filters">${filters}</div>
    <div class="draft-wrap">
      <table class="draft">
        <thead><tr><th>Subject</th><th>Comment</th><th>Count</th><th>Space</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="send-actions">
      <button type="button" class="btn-ghost light" id="csvBtn">Export markups CSV</button>
      <span class="draft-meta spec-export-note">${lines.length} lines in this filter · not the customer request</span>
    </div>`;
}

function normCode(s) {
  const t = String(s == null ? "" : s).trim();
  if (!t || t === "—" || t === "-" || t === "–" || t === "−") return "";
  return t.toUpperCase();
}

function normSpace(s) {
  return String(s == null ? "" : s).trim().toUpperCase();
}

function graniteDraftRows() {
  return (job.lines || [])
    .filter((ln) => (ln.floor || "") === "PLAN 09")
    .map((ln) => ({
      subject: normCode(ln.code),
      space: normSpace(ln.room),
      count: Number(ln.qty) || 0,
      comment: ln.text || "",
    }));
}

function sampleBluebeamRows() {
  const rows = graniteDraftRows().map((r) => ({ ...r }));
  const keep = rows.filter((r) => r.subject !== "IL.6" && r.subject !== "IL.7");
  const tp = keep.find((r) => r.subject === "TP3" && r.space === "A0-025");
  if (tp) tp.count = 2;
  keep.push({
    subject: "H2",
    space: "A0-024",
    count: 1,
    comment: "Hylla H2 (specialist added this room)",
  });
  return keep;
}

const SAMPLE_BB_NOTE =
  "Sample — not a real Revu file. Pretend they dropped IL.6 and IL.7, set TP3 in A0-025 to 2, and added H2 in A0-024.";

function bucketRows(list) {
  const map = new Map();
  for (const r of list) {
    const subject = normCode(r.subject);
    const space = normSpace(r.space);
    const key = subject + "|" + space;
    if (!map.has(key)) {
      map.set(key, { subject, space, count: 0, comment: r.comment || "" });
    }
    const b = map.get(key);
    b.count += Number(r.count) || 1;
    if (!b.comment && r.comment) b.comment = r.comment;
  }
  return map;
}

function compareLists(graniteRows, theirRows) {
  const gMap = bucketRows(graniteRows);
  const tMap = bucketRows(theirRows);
  const same = [];
  const different = [];
  const onlyGranite = [];
  const onlyBluebeam = [];
  const usedG = new Set();
  const usedT = new Set();

  for (const [k, t] of tMap) {
    if (!gMap.has(k)) continue;
    const g = gMap.get(k);
    usedG.add(k);
    usedT.add(k);
    const row = {
      subject: t.subject || g.subject,
      space: t.space || g.space,
      graniteQty: g.count,
      bluebeamQty: t.count,
      comment: g.comment || t.comment || "",
    };
    if (g.count === t.count) same.push(row);
    else {
      row.note = "Count does not match";
      different.push(row);
    }
  }

  for (const [k, t] of tMap) {
    if (usedT.has(k) || t.space) continue;
    const gLeft = [...gMap.entries()].filter(([gk, g]) => !usedG.has(gk) && g.subject === t.subject);
    if (!gLeft.length) continue;
    const gSum = gLeft.reduce((n, [, g]) => n + g.count, 0);
    gLeft.forEach(([gk]) => usedG.add(gk));
    usedT.add(k);
    const rooms = gLeft.map(([, g]) => g.space).filter(Boolean).join(", ");
    const row = {
      subject: t.subject,
      space: rooms,
      graniteQty: gSum,
      bluebeamQty: t.count,
      comment: "No Space in their file — rooms grouped",
    };
    if (gSum === t.count) same.push(row);
    else different.push(row);
  }

  for (const [k, g] of gMap) {
    if (usedG.has(k)) continue;
    onlyGranite.push({
      subject: g.subject,
      space: g.space,
      graniteQty: g.count,
      bluebeamQty: 0,
      comment: g.comment || "",
    });
  }
  for (const [k, t] of tMap) {
    if (usedT.has(k)) continue;
    onlyBluebeam.push({
      subject: t.subject,
      space: t.space,
      graniteQty: 0,
      bluebeamQty: t.count,
      comment: t.comment || "",
    });
  }
  return { same, different, onlyGranite, onlyBluebeam };
}

function applyCompare(theirRows, meta) {
  const result = compareLists(graniteDraftRows(), theirRows);
  compareState = {
    source: meta.source || "",
    fileName: meta.fileName || "",
    note: meta.note || "",
    same: result.same,
    different: result.different,
    onlyGranite: result.onlyGranite,
    onlyBluebeam: result.onlyBluebeam,
  };
}

function cmpRowHtml(row) {
  return `<tr data-cmp="1" data-room="${esc(row.space || "")}" data-code="${esc(row.subject || "")}">
    <td>${esc(row.subject || "—")}</td>
    <td>${esc(row.space || "—")}</td>
    <td>${row.graniteQty}</td>
    <td>${row.bluebeamQty}</td>
    <td>${esc(row.note || row.comment || "")}</td>
  </tr>`;
}

function cmpTable(title, rows, open) {
  if (!rows.length) return "";
  return `<details class="bb-block" ${open ? "open" : ""}>
    <summary>${esc(title)} · ${rows.length}</summary>
    <div class="draft-wrap bb-wrap">
      <table class="draft">
        <thead><tr><th>Subject</th><th>Space</th><th>Granite</th><th>Bluebeam</th><th>Note</th></tr></thead>
        <tbody>${rows.map(cmpRowHtml).join("")}</tbody>
      </table>
    </div>
  </details>`;
}

function compareHtml() {
  const busy = compareBusy ? " disabled" : "";
  let result = "";
  if (compareState) {
    const s = compareState;
    if (s.source === "Could not compare") {
      result = `<p class="bb-source bb-error">${esc(s.note)}</p>
        <div class="send-actions">
          <button type="button" class="btn-ghost light" id="bbClear">Clear check</button>
        </div>`;
    } else {
      const label = s.fileName ? `${s.source} · ${s.fileName}` : s.source;
      result = `
        <div class="bb-pills">
          <span class="bb-pill same">Same ${s.same.length}</span>
          <span class="bb-pill diff">Different ${s.different.length}</span>
          <span class="bb-pill granite">Only in Granite ${s.onlyGranite.length}</span>
          <span class="bb-pill extra">Only in Bluebeam ${s.onlyBluebeam.length}</span>
        </div>
        <div class="bb-downloads">
          <button type="button" class="btn-orange" id="bbCmpXls">Download Excel</button>
          <button type="button" class="btn-ghost light" id="bbCmpCsv">Download comparison CSV</button>
        </div>
        <p class="bb-source">${esc(label)}${s.note ? " · " + esc(s.note) : ""}</p>
        ${cmpTable("Different", s.different, true)}
        ${cmpTable("Only in Granite", s.onlyGranite, true)}
        ${cmpTable("Only in Bluebeam", s.onlyBluebeam, true)}
        ${cmpTable("Same", s.same, false)}
        <div class="send-actions">
          <button type="button" class="btn-ghost light" id="bbClear">Clear check</button>
        </div>`;
    }
  }
  return `
    <div class="bb-box" id="bbDrop">
      <p class="spec-kicker">Specialist tool · Bluebeam</p>
      <h2>Upload your Bluebeam file</h2>
      <ol class="bb-steps">
        <li>Count in Revu</li>
        <li>Save PDF or Summary CSV</li>
        <li>Drop it here</li>
        <li>Take Excel — you still sign</li>
      </ol>
      <p class="bb-lead">Drop the PDF you saved in Revu, or a Markup Summary CSV. We check it against this draft: same, missing, extra, different.</p>
      <button type="button" class="bb-dropzone" id="bbPick"${busy}>
        <strong>Drop your Bluebeam PDF or CSV here</strong>
        <span>or click to choose · Revu save, or Markups List → Summary</span>
      </button>
      <div class="bb-actions">
        <button type="button" class="btn-ghost light" id="bbSample"${busy}>No file with you? Try a sample check</button>
      </div>
      <p class="bb-quiet">Want the CSV shape Revu exports? <button type="button" class="bb-link" id="bbSampleCsv"${busy}>Download a sample Summary</button></p>
      ${result}
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

function catalogAllowed() {
  if (specialist) return true;
  return step === "choose" || step === "send";
}

function openCatalog() {
  if (!job || !catalogAllowed()) return;
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

function setLandingRoleUi() {
  if ($("landing")) $("landing").dataset.role = landingRole;
  if ($("doorCust")) $("doorCust").classList.toggle("on", landingRole === "customer");
  if ($("doorSpec")) $("doorSpec").classList.toggle("on", landingRole === "specialist");
  const hint = $("doorHint");
  if (hint) {
    hint.textContent = landingRole === "specialist"
      ? "Then we open the Bluebeam check."
      : "Then we open the customer request.";
  }
  const spec = landingRole === "specialist";
  const badge = $("overviewBadge");
  const title = $("overviewTitle");
  const lead = $("overviewLead");
  const tryBtn = $("tryExample");
  if (badge) badge.textContent = spec ? "Draft ready · check Bluebeam" : "Draft ready · still not an order";
  if (title) {
    title.innerHTML = spec
      ? "PLAN 09 is ready.<br /><em>Check your Bluebeam file.</em>"
      : "PLAN 09 is ready.<br /><em>See what we found.</em>";
  }
  if (lead) {
    lead.textContent = spec
      ? "Drop the PDF you saved in Revu. We check it against this draft."
      : "Answer a few questions. This is a request, not an order.";
  }
  if (tryBtn) tryBtn.textContent = spec ? "Open Bluebeam check" : "See what we found";
  const foot = document.querySelector(".preview-list footer");
  if (foot) {
    foot.innerHTML = spec
      ? "Ready to <strong>check Bluebeam</strong>"
      : "Ready to choose <strong>after you answer</strong>";
  }
}

function updateLegend() {
  const el = document.querySelector(".pin-legend");
  if (!el) return;
  if (specialist && compareState && compareState.source !== "Could not compare") {
    el.innerHTML =
      `<span class="lg same"></span> Same <span class="lg diff"></span> Different <span class="lg miss"></span> Only Granite <span class="lg onlybb"></span> Only Bluebeam`;
  } else if (!specialist) {
    el.innerHTML =
      `<span class="lg room"></span> On this request <span class="lg code"></span> Product <span class="lg extra"></span> Hatch`;
  } else {
    el.innerHTML =
      `<span class="lg room"></span> Room <span class="lg code"></span> Product <span class="lg extra"></span> Extra`;
  }
}

function setRole(next) {
  specialist = !!next;
  landingRole = specialist ? "specialist" : "customer";
  setLandingRoleUi();
  if (catalogOpen && !catalogAllowed()) closeCatalog();
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
  $("catalogBtn").hidden = !catalogAllowed();
  const addedN = flowItems.filter((it) => it.group === "added").length;
  $("catalogBtn").textContent = addedN ? `Catalog (${addedN})` : "Catalog";
  $("app").dataset.step = step;
  $("steps").hidden = specialist;
  $("specToolsLabel").hidden = !specialist;
  $("trust").hidden = !specialist;
  const banner = $("roleBanner");
  const sheetTitle = $("sheetTitle");
  const c = counts();
  const groups = questionGroups();
  if (specialist) {
    banner.textContent = "Specialist tool · drop your Bluebeam PDF or CSV · we check it against this draft";
    if (sheetTitle) sheetTitle.textContent = "PLAN 09 · upload Bluebeam to check";
    $("flowStatus").textContent = "Drop their Revu PDF or Summary CSV on the right";
    $("continueBtn").textContent = "Customer request";
    $("continueBtn").disabled = false;
    $("backBtn").disabled = false;
  } else {
    banner.textContent = "Customer request · simple path · still not an order";
    if (sheetTitle) sheetTitle.textContent = "A-40-1-1091 · PLAN 09";
    $("backBtn").disabled = false;
    $("continueBtn").disabled = false;
    if (step === "found") {
      $("flowStatus").textContent = "Nothing to click yet · start the questions";
      $("continueBtn").textContent = "Start questions";
    } else if (step === "choose") {
      const g = currentGroup();
      const picked = g && g.items[0] && g.items[0].choice;
      const last = chooseIndex >= groups.length - 1;
      if (!g) {
        $("flowStatus").textContent = "Questions done";
        $("continueBtn").textContent = "Review request";
      } else if (!picked) {
        $("flowStatus").textContent = `Question ${chooseIndex + 1} of ${groups.length} · pick one box`;
        $("continueBtn").textContent = "Pick one first";
        $("continueBtn").disabled = true;
      } else {
        $("flowStatus").textContent = last
          ? "Last answer saved · review the request"
          : `Saved · ${chooseIndex + 1} of ${groups.length}`;
        $("continueBtn").textContent = last ? "Review request" : "Next question";
      }
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
      <div class="t-card ok"><strong>This floor</strong><b>PLAN 09</b><span>Fittings draft to check — you still sign</span></div>
      <div class="t-card ok"><strong>Email vs plan</strong><b>4 H2</b><span>Named shelf rooms are on this sheet</span></div>
      <div class="t-card warn"><strong>Old quote</strong><b>No H2</b><span>Never listed these shelves</span></div>
      <div class="t-card ok"><strong>Your job</strong><b>Revu</b><span>Count there, drop the save here, take Excel</span></div>`;
  }
  const pillEl = $("sheetPill");
  if (pillEl) {
    if (specialist) {
      const mark = markFor(selected);
      pillEl.textContent = mark
        ? `Showing ${mark.label || mark.id} on the drawing`
        : "Drop your Bluebeam file on the right to check this draft";
    } else if (step === "found") {
      const mark = markFor(selected);
      pillEl.textContent = mark
        ? `Showing ${mark.label || mark.id} on the drawing`
        : "Click a card to zoom · then Start questions";
    } else if (step === "choose") {
      const g = currentGroup();
      const rooms = g ? [...new Set(g.items.map((it) => it.room).filter(Boolean))] : [];
      pillEl.textContent = rooms.length > 1
        ? `This question · ${rooms.length} rooms`
        : rooms[0]
          ? `This question · ${rooms[0]}`
          : "Pick one box on the right";
    } else {
      const it = flowItems.find((x) => x.id === selected || x.room === selected);
      pillEl.textContent = it ? `${it.room || it.code || ""} · ${it.title}` : "Check the request list";
    }
  }
  updateLegend();
  drawMarks();
  $("side").innerHTML = sideHtml();
  $("side").querySelectorAll("[data-item]").forEach((el) => {
    el.addEventListener("click", () => {
      selected = el.dataset.room || el.dataset.code || el.dataset.item;
      render({ zoom: true });
    });
  });
  $("side").querySelectorAll("[data-zoom]").forEach((el) => {
    el.addEventListener("click", () => {
      selected = el.dataset.zoom;
      render({ zoom: true });
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
  const reqXls = $("reqXlsBtn");
  if (reqXls) reqXls.addEventListener("click", downloadRequestExcel);
  bindCompareUi();
  updateChrome();
  if (opts.zoom) focusSelected();
}

function pickOption(optId) {
  const g = currentGroup();
  if (!g) return;
  const opt = (g.options || []).find((o) => o.id === optId) || { id: optId, name: optId };
  g.items.forEach((it) => {
    it.choice = opt;
  });
  selected = g.items[0].room || g.items[0].id;
  render({ zoom: true });
}

function csvCell(v) {
  return `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
}

function unescapePdfString(raw) {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function pdfDictString(chunk, key) {
  const re = new RegExp("/" + key + "\\s*\\((?:\\\\.|[^\\\\)])*\\)");
  const m = chunk.match(re);
  if (m) {
    const inner = m[0].slice(m[0].indexOf("(") + 1, -1);
    return unescapePdfString(inner);
  }
  const hex = chunk.match(new RegExp("/" + key + "\\s*<([0-9A-Fa-f\\s]+)>"));
  if (hex) {
    const h = hex[1].replace(/\s/g, "");
    let out = "";
    for (let i = 0; i < h.length; i += 2) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
    return out;
  }
  return "";
}

function extractPdfMarkups(bytes) {
  const s = new TextDecoder("latin1").decode(bytes);
  const objs = s.split(/\bendobj\b/);
  const rows = [];
  const skip = /Popup|Link|Widget|FileAttachment/;
  for (const obj of objs) {
    if (!/\/Type\s*\/Annot\b/.test(obj) && !/\/Subtype\s*\/(Square|Circle|Polygon|PolyLine|Ink|Stamp|FreeText|Highlight|Underline|StrikeOut|Caret|Text|Line)\b/.test(obj)) {
      continue;
    }
    const subtype = (obj.match(/\/Subtype\s*\/(\w+)/) || [])[1] || "";
    if (skip.test(subtype)) continue;
    const subject = pdfDictString(obj, "Subj");
    const contents = pdfDictString(obj, "Contents");
    const code = normCode(subject) || normCode((contents.match(/^[A-Za-z0-9][A-Za-z0-9.\-]{0,12}/) || [""])[0]);
    if (!code && !contents) continue;
    rows.push({
      subject: code,
      space: normSpace(pdfDictString(obj, "Space")),
      count: 1,
      comment: contents || subject,
    });
  }
  return rows;
}

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error("Could not load PDF reader"));
    document.head.appendChild(s);
  });
}

async function extractPdfJsMarkups(bytes) {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const rows = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const annots = await page.getAnnotations();
    for (const a of annots) {
      const subtype = a.subtype || "";
      if (/Popup|Link|Widget/.test(subtype)) continue;
      const contents = String(a.contents || (a.contentsObj && a.contentsObj.str) || "").trim();
      const subject = normCode(a.subject || "");
      const code = subject || normCode((contents.match(/^[A-Za-z0-9][A-Za-z0-9.\-]{0,12}/) || [""])[0]);
      if (!code && !contents) continue;
      rows.push({
        subject: code,
        space: "",
        count: 1,
        comment: contents || code,
      });
    }
  }
  return rows;
}

function parseDelimited(text, delim) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQ) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function mapCsvHeader(h) {
  const s = String(h || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();
  if (/^subj|ämne|^subject$/.test(s)) return "subject";
  if (/comment|innehåll|contents|^text$/.test(s)) return "comment";
  if (/^count$|^antal$|^qty$|^quantity$/.test(s)) return "count";
  if (/space|rum|^room$/.test(s)) return "space";
  return "";
}

function rowsFromCsv(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const first = (clean.split(/\r?\n/)[0] || "");
  const semi = (first.match(/;/g) || []).length;
  const comma = (first.match(/,/g) || []).length;
  const delim = semi > comma ? ";" : ",";
  const table = parseDelimited(clean, delim).filter((r) => r.some((c) => String(c).trim()));
  if (!table.length) return [];
  const keys = table[0].map(mapCsvHeader);
  const hasHead = keys.some(Boolean);
  const body = hasHead ? table.slice(1) : table;
  const idx = {
    subject: keys.indexOf("subject"),
    comment: keys.indexOf("comment"),
    count: keys.indexOf("count"),
    space: keys.indexOf("space"),
  };
  return body.map((r) => {
    const subject = hasHead && idx.subject >= 0 ? r[idx.subject] : r[0];
    const comment = hasHead && idx.comment >= 0 ? r[idx.comment] : r[1] || "";
    const count = hasHead && idx.count >= 0 ? r[idx.count] : r[2];
    const space = hasHead && idx.space >= 0 ? r[idx.space] : r[3];
    return {
      subject: normCode(subject),
      comment: String(comment || "").trim(),
      count: Number(count) || 1,
      space: normSpace(space),
    };
  }).filter((r) => r.subject || r.comment);
}

function rowsFromMarkupDoc(text) {
  const xmlish = /^\s*</.test(text) || /<markup/i.test(text);
  if (!xmlish) return [];
  const type = /<\?xml|<\/\w+>/.test(text) && !/<html/i.test(text) ? "text/xml" : "text/html";
  const doc = new DOMParser().parseFromString(text, type);
  const tables = [...doc.querySelectorAll("table")];
  for (const table of tables) {
    const ths = [...table.querySelectorAll("th")].map((th) => mapCsvHeader(th.textContent));
    if (!ths.includes("subject") && !ths.includes("comment")) continue;
    const rows = [];
    table.querySelectorAll("tr").forEach((tr, i) => {
      if (i === 0 && tr.querySelector("th")) return;
      const cells = [...tr.querySelectorAll("td")].map((td) => td.textContent.trim());
      if (!cells.length) return;
      const get = (key, fallback) => {
        const n = ths.indexOf(key);
        return n >= 0 ? cells[n] : cells[fallback] || "";
      };
      rows.push({
        subject: normCode(get("subject", 0)),
        comment: get("comment", 1),
        count: Number(get("count", 2)) || 1,
        space: normSpace(get("space", 3)),
      });
    });
    if (rows.length) return rows;
  }
  const nodes = [...doc.querySelectorAll("Markup, markup")];
  if (nodes.length) {
    return nodes.map((n) => ({
      subject: normCode((n.querySelector("Subject, subject") || {}).textContent),
      comment: ((n.querySelector("Comment, comment, Contents, contents") || {}).textContent || "").trim(),
      count: Number((n.querySelector("Count, count") || {}).textContent) || 1,
      space: normSpace((n.querySelector("Space, space, Room, room") || {}).textContent),
    }));
  }
  return [];
}

function downloadText(filename, text, type) {
  downloadBlob(filename, new Blob([text], { type: type || "text/plain" }));
}

function downloadBlob(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function xmlEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function crc32(bytes) {
  if (!crc32.t) {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    crc32.t = t;
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crc32.t[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  files.forEach((f) => {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint16(8, 0, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  });
  const cdStart = offset;
  const cdSize = centrals.reduce((n, p) => n + p.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  const out = new Uint8Array(cdStart + cdSize + 22);
  let o = 0;
  locals.forEach((p) => {
    out.set(p, o);
    o += p.length;
  });
  centrals.forEach((p) => {
    out.set(p, o);
    o += p.length;
  });
  out.set(end, o);
  return out;
}

function xlsxCell(ref, value, style, type) {
  if (type === "n") {
    return `<c r="${ref}" s="${style}" t="n"><v>${value || 0}</v></c>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
}

function xlsxRow(r, cells) {
  return `<row r="${r}">${cells.join("")}</row>`;
}

function colLetter(n) {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function xlsxSheet(rows, { freeze = false, filter = false, widths = [] } = {}) {
  const maxCol = Math.max(1, ...rows.map((r) => r.length));
  const maxRow = Math.max(1, rows.length);
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const data = rows
    .map((row, ri) => {
      const r = ri + 1;
      const cells = row.map((cell, ci) => {
        const ref = colLetter(ci + 1) + r;
        const style = cell.s == null ? 0 : cell.s;
        if (cell.t === "n") return xlsxCell(ref, cell.v, style, "n");
        return xlsxCell(ref, cell.v, style, "s");
      });
      return xlsxRow(r, cells);
    })
    .join("");
  const views = freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : "";
  const auto = filter ? `<autoFilter ref="A1:${colLetter(maxCol)}${maxRow}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${views}${
    cols ? `<cols>${cols}</cols>` : ""
  }<sheetData>${data}</sheetData>${auto}</worksheet>`;
}

function comparePacks() {
  return [
    ["Different", "different", 3, compareState.different],
    ["Only in Granite", "only_granite", 4, compareState.onlyGranite],
    ["Only in Bluebeam", "only_bluebeam", 5, compareState.onlyBluebeam],
    ["Same", "same", 2, compareState.same],
  ];
}

function compareLineRows(statusLabel, style, list) {
  return list.map((r) => [
    { v: statusLabel, s: style },
    { v: r.subject || "—", s: style },
    { v: r.space || "—", s: style },
    { v: r.graniteQty, t: "n", s: style },
    { v: r.bluebeamQty, t: "n", s: style },
    { v: r.note || r.comment || "", s: style },
  ]);
}

function buildCompareXlsx() {
  const s = compareState;
  const header = [
    { v: "Status", s: 1 },
    { v: "Subject", s: 1 },
    { v: "Space", s: 1 },
    { v: "Granite qty", s: 1 },
    { v: "Bluebeam qty", s: 1 },
    { v: "Note", s: 1 },
  ];
  const widths = [18, 16, 14, 14, 16, 56];
  const source = [s.source, s.fileName, s.note].filter(Boolean).join(" · ");
  const summary = xlsxSheet(
    [
      [{ v: "PLAN 09 Bluebeam check", s: 6 }],
      [{ v: source, s: 0 }],
      [],
      [{ v: "Status", s: 1 }, { v: "Lines", s: 1 }],
      [{ v: "Different", s: 3 }, { v: s.different.length, t: "n", s: 3 }],
      [{ v: "Only in Granite", s: 4 }, { v: s.onlyGranite.length, t: "n", s: 4 }],
      [{ v: "Only in Bluebeam", s: 5 }, { v: s.onlyBluebeam.length, t: "n", s: 5 }],
      [{ v: "Same", s: 2 }, { v: s.same.length, t: "n", s: 2 }],
      [],
      [{ v: "Open the other sheets for the lines. You still sign. This is a check, not a new take-off.", s: 0 }],
    ],
    { widths: [22, 14] }
  );
  const allRows = [header];
  const sheets = [{ name: "Summary", xml: summary }];
  comparePacks().forEach(([label, , style, list]) => {
    const body = compareLineRows(label, style, list);
    body.forEach((row) => allRows.push(row));
    sheets.push({
      name: label.slice(0, 31),
      xml: xlsxSheet([header, ...body], { freeze: true, filter: true, widths }),
    });
  });
  sheets.splice(1, 0, {
    name: "All lines",
    xml: xlsxSheet(allRows, { freeze: true, filter: true, widths }),
  });
  return packXlsx(sheets);
}

function packXlsx(sheets) {
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts>
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="16"/><name val="Calibri"/></font>
  </fonts>
  <fills>
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0D4F4F"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE3F3EA"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFE0C2"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD4F5F5"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFDE8E6"/></patternFill></fill>
  </fills>
  <borders>
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`;
  const types =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join("") +
    `</Types>`;
  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;
  const wbRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;
  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    sheets.map((sh, i) => `<sheet name="${xmlEsc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets></workbook>`;
  const files = [
    { name: "[Content_Types].xml", data: types },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: wbRels },
    { name: "xl/styles.xml", data: styles },
    ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sh.xml })),
  ];
  return zipStore(files);
}

function sampleSummaryCsv() {
  const header = "Subject,Comment,Count,Space";
  const rows = sampleBluebeamRows().map((r) =>
    [r.subject, r.comment, r.count, r.space].map(csvCell).join(",")
  );
  return [header, ...rows].join("\n");
}

function runBbSample() {
  applyCompare(sampleBluebeamRows(), {
    source: "Sample",
    fileName: "",
    note: SAMPLE_BB_NOTE,
  });
  render({ zoom: false });
}

function clearCompare() {
  compareState = null;
  render({ zoom: false });
}

function downloadCompareCsv() {
  if (!compareState) return;
  const header = "status,subject,space,granite_qty,bluebeam_qty,note";
  const rows = [];
  comparePacks().forEach(([label, , , list]) => {
    list.forEach((r) => {
      rows.push(
        [label, r.subject, r.space, r.graniteQty, r.bluebeamQty, r.note || r.comment || ""].map(csvCell).join(",")
      );
    });
  });
  downloadText("granite-plan09-compare.csv", [header, ...rows].join("\n"), "text/csv");
}

function downloadCompareExcel() {
  if (!compareState) return;
  const bytes = buildCompareXlsx();
  downloadBlob(
    "granite-plan09-compare.xlsx",
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );
}

function downloadRequestExcel() {
  const c = counts();
  const header = [
    { v: "Room", s: 1 },
    { v: "Item", s: 1 },
    { v: "Qty", s: 1 },
    { v: "Article", s: 1 },
    { v: "Your choice", s: 1 },
  ];
  const body = c.inBasket.map((it) => {
    const ch = it.choice || {};
    const ask = optionVerb(ch) === "Send as a question";
    const style = ask ? 4 : 2;
    return [
      { v: it.room || "—", s: style },
      { v: itemTitle(it), s: style },
      { v: it.qty, t: "n", s: style },
      { v: ch.article || "question", s: style },
      { v: choiceName(it), s: style },
    ];
  });
  const summary = xlsxSheet(
    [
      [{ v: "PLAN 09 customer request", s: 6 }],
      [{ v: "Not an order. A specialist still checks lengths, kit types and hatch quantities.", s: 0 }],
      [],
      [{ v: "On the request", s: 2 }, { v: c.inBasket.length, t: "n", s: 2 }],
      [{ v: "Still a question", s: 4 }, { v: c.questions.length, t: "n", s: 4 }],
      [{ v: "Not answered yet", s: 3 }, { v: c.need.length, t: "n", s: 3 }],
    ],
    { widths: [28, 14] }
  );
  const bytes = packXlsx([
    { name: "Summary", xml: summary },
    {
      name: "Request",
      xml: xlsxSheet([header, ...body], { freeze: true, filter: true, widths: [14, 36, 8, 14, 32] }),
    },
  ]);
  downloadBlob(
    "granite-plan09-request.xlsx",
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );
}

function bindCompareUi() {
  const pick = $("bbPick");
  if (pick) pick.addEventListener("click", () => $("bbFile") && $("bbFile").click());
  const sample = $("bbSample");
  if (sample) sample.addEventListener("click", runBbSample);
  const clear = $("bbClear");
  if (clear) clear.addEventListener("click", clearCompare);
  const xls = $("bbCmpXls");
  if (xls) xls.addEventListener("click", downloadCompareExcel);
  const cmp = $("bbCmpCsv");
  if (cmp) cmp.addEventListener("click", downloadCompareCsv);
  const sampCsv = $("bbSampleCsv");
  if (sampCsv) sampCsv.addEventListener("click", () => downloadText("granite-plan09-sample-summary.csv", sampleSummaryCsv(), "text/csv"));
  const drop = $("bbDrop");
  if (drop) {
    ["dragenter", "dragover"].forEach((ev) => {
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.add("dragover");
      });
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("dragover");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) ingestBluebeamFile(file);
    });
  }
  $("side").querySelectorAll("tr[data-cmp]").forEach((el) => {
    el.addEventListener("click", () => {
      selected = el.dataset.room || el.dataset.code;
      render({ zoom: true });
    });
  });
}

async function ingestBluebeamFile(file) {
  if (!file || compareBusy) return;
  compareBusy = true;
  render({ zoom: false });
  try {
    const name = file.name || "upload";
    const lower = name.toLowerCase();
    const buf = await file.arrayBuffer();
    let rows = [];
    let source = "";
    let note = "";
    if (lower.endsWith(".pdf") || (file.type || "").includes("pdf")) {
      rows = extractPdfMarkups(buf);
      source = "PDF markups";
      if (!rows.length) {
        try {
          rows = await extractPdfJsMarkups(buf);
        } catch (err) {
          rows = [];
        }
      }
      if (!rows.length) {
        throw new Error(
          "This PDF has no markups we can read (plain drawing). In Revu: save after counting, or Markups List → Summary → CSV."
        );
      }
      note = `${rows.length} markup${rows.length === 1 ? "" : "s"} read from the PDF.`;
    } else {
      const text = new TextDecoder("utf-8").decode(buf);
      rows = rowsFromCsv(text);
      if (!rows.length) rows = rowsFromMarkupDoc(text);
      source = lower.endsWith(".xml") || /^\s*</.test(text) ? "Markup Summary XML" : "Markup Summary CSV";
      if (!rows.length) {
        throw new Error("No Subject / Count rows in that file. Export Markups List → Summary as CSV from Revu.");
      }
      note = `${rows.length} row${rows.length === 1 ? "" : "s"} from their summary.`;
    }
    applyCompare(rows, { source, fileName: name, note });
  } catch (err) {
    compareState = {
      source: "Could not compare",
      fileName: file.name || "",
      note: err && err.message ? err.message : "Could not read that file.",
      same: [],
      different: [],
      onlyGranite: [],
      onlyBluebeam: [],
    };
  }
  compareBusy = false;
  render({ zoom: false });
}

function downloadCsv() {
  let header;
  let rows;
  let filename;
  if (specialist) {
    header = "subject,comment,count,space,kind,note";
    rows = filteredLines().map((ln) =>
      [ln.code || "", ln.text || "", ln.qty, ln.room || "", ln.kind || "", ln.need || ln.blocker || ""].map(csvCell).join(",")
    );
    filename = "granite-plan09-markups.csv";
  } else {
    header = "room,item,qty,article,choice";
    rows = counts().inBasket.map((it) =>
      [it.room || "", itemTitle(it), it.qty, (it.choice && it.choice.article) || "", choiceName(it)].map(csvCell).join(",")
    );
    filename = "granite-plan09-request.csv";
  }
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
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
    const groups = questionGroups();
    const undone = groups.findIndex((g) => !(g.items[0] && g.items[0].choice));
    chooseIndex = undone >= 0 ? undone : 0;
    const g = currentGroup();
    if (g) selected = g.items[0].room || g.items[0].id;
  }
  if (next === "found") selected = null;
  render({ zoom: next === "choose" });
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (next === "choose") focusSelected();
      else fitView();
    })
  );
}

function landingUrl(hash) {
  return location.pathname + location.search + hash;
}

function goLanding(phase) {
  demoStarted = false;
  $("app").classList.remove("on");
  $("landing").hidden = false;
  $("landing").style.display = "";
  if (phase !== "reading") {
    readToken += 1;
    landingBusy = false;
  }
  if (phase === "reading") {
    if (!sheetChosen) {
      goLanding("upload");
      return;
    }
    playLandingRead();
  } else if (phase === "overview") {
    if (!sheetChosen) {
      goLanding("upload");
      return;
    }
    setLandingPhase("overview");
    history.replaceState(null, "", landingUrl("#overview"));
  } else {
    sheetChosen = false;
    setLandingPhase("upload");
    history.replaceState(null, "", landingUrl("#drawing"));
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
    pill.textContent = "Pick a path";
    label.textContent = "PLAN 09";
  } else if (phase === "reading") {
    pill.textContent = "Reading…";
    label.textContent = "A-40-1-1091 · PLAN 09";
  } else {
    pill.textContent = landingRole === "specialist" ? "Check ready" : "Draft ready";
    label.textContent = "A-40-1-1091 · PLAN 09";
  }
  setLandingRoleUi();
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

function choosePlan09() {
  sheetChosen = true;
  playLandingRead();
}

async function playLandingRead() {
  if (landingBusy && landingPhase === "reading") return;
  landingBusy = true;
  sheetChosen = true;
  const token = ++readToken;
  setLandingPhase("reading");
  history.replaceState(null, "", landingUrl("#reading"));
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
  history.replaceState(null, "", landingUrl("#overview"));
  landingBusy = false;
}

function skipLandingRead() {
  if (landingPhase !== "reading") return;
  readToken += 1;
  landingBusy = false;
  $("heroBar").style.width = "100%";
  markHeroSteps(READ_STEPS.length);
  setLandingPhase("overview");
  history.replaceState(null, "", landingUrl("#overview"));
}

async function startDemo() {
  showBanner("");
  try {
    if (!job) await loadAll();
  } catch (err) {
    showBanner("Could not start: " + (err.message || err));
    demoStarted = false;
    return;
  }
  demoStarted = true;
  sheetChosen = true;
  $("landing").style.display = "none";
  $("landing").hidden = true;
  $("app").classList.add("on");
  bindViewer();
  selected = null;
  specialist = landingRole === "specialist";
  setLandingRoleUi();
  setStep("found");
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
    const groups = questionGroups();
    const g = currentGroup();
    if (g && !(g.items[0] && g.items[0].choice)) return;
    if (chooseIndex < groups.length - 1) {
      chooseIndex += 1;
      const next = currentGroup();
      selected = next ? next.items[0].room || next.items[0].id : selected;
      render({ zoom: true });
      requestAnimationFrame(() => requestAnimationFrame(focusSelected));
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
  if (specialist) {
    goLanding("overview");
    return;
  }
  if (step === "send") setStep("choose");
  else if (step === "choose") setStep("found");
  else if (step === "found") goLanding("overview");
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
  if (h === "overview") {
    goLanding("overview");
    return;
  }
  if (["found", "choose", "send"].includes(h)) {
    if (!sheetChosen) {
      goLanding("upload");
      return;
    }
    if (!demoStarted || !job) startDemo().then(() => setStep(h, { silent: true }));
    else setStep(h, { silent: true });
  }
}

function bootLanding() {
  sheetChosen = false;
  demoStarted = false;
  landingBusy = false;
  readToken += 1;
  $("app").classList.remove("on");
  $("landing").hidden = false;
  $("landing").style.display = "";
  setLandingPhase("upload");
  if (location.hash !== "#drawing") {
    history.replaceState(null, "", landingUrl("#drawing"));
  }
}

$("tryExample").addEventListener("click", () => startDemo());
$("uploadExample").addEventListener("click", choosePlan09);
$("pick1091").addEventListener("click", (e) => {
  e.stopPropagation();
  choosePlan09();
});
$("skipRead").addEventListener("click", skipLandingRead);
$("doorCust").addEventListener("click", () => {
  landingRole = "customer";
  setLandingRoleUi();
});
$("doorSpec").addEventListener("click", () => {
  landingRole = "specialist";
  setLandingRoleUi();
});
$("custBtn").addEventListener("click", () => setRole(false));
$("specBtn").addEventListener("click", () => setRole(true));
$("bbFile").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (file) ingestBluebeamFile(file);
});
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
  if (landingPhase === "upload") choosePlan09();
});

window.addEventListener("hashchange", onHash);
bootLanding();
