# Granite PLAN 09 — App-team demo

Hackathon prototype (Team Granite). Customer basket + specialist trust view for **one drawing**: `A-40-1-1091.pdf`.

**Live demo:** https://granite-plan09.pages.dev  
**Code:** https://github.com/epsalgado/granite-plan09  
Cloudflare Web Analytics is on for the live demo (page views only, no names).  

This is Eddie’s working mockup, not the official 2Hero repo (`2hero-programs/ahl-team-granite`). The pack has 11 drawings; only PLAN 09 (`A-40-1-1091`) has a BoM API run. The specialist view uses Wilmer’s exported draft (**63 of 69 lines** recovered; the file was cut at the end).

## For teammates

Anyone can **view and clone** this repo (it is public). To **edit and push**:

1. Send Eddie your GitHub username.
2. He adds you under GitHub → this repo → **Settings → Collaborators**.
3. Accept the email invite.
4. Clone, edit, push `main`. Cloudflare Pages will update the live demo.

```bash
git clone https://github.com/epsalgado/granite-plan09.git
```

Static HTML/CSS/JS. No build step. Pages settings: Framework **None**, output `/`, branch `main`.

Customer path is a five-step flow: Drawing → Reading → Found → Choose → Send. Header switch **Customer | Specialist** changes colour, banner, and tools: customer keeps the request steps; specialist gets a teal markups list. Direct links: `#found`, `#choose`, `#send`.

**Catalog** (header) searches `data/articles.json`: 7,800+ real Ahlsell article numbers from the school packing-protocol `ARTIKELLISTA` plus the four `reference-quote.csv` files. SV/EN toggle; search matches Swedish names, English glosses, and article numbers. Not a live ahlsell.se download. Rebuild with `python3 scripts/build-articles.py`.

## Local

Open `index.html` in a browser, or from this folder:

```bash
python3 -m http.server 4173
```

Then visit `http://127.0.0.1:4173`

## Cloudflare Pages (no build)

- Framework: **None**
- Build command: *(leave empty)*
- Output directory: `/`
- Branch: `main`
