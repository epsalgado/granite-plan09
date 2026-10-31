# Granite vision script — the dream, not the inventory

Spoken English. About 90 seconds. No item counts. No “69 lines.”
A human still signs. Bluebeam stays.

Use this for the film. The app walk comes after, as pictures of this story — not the other way around.

---

## The story in one breath

A customer asks what the fittings cost. A specialist spends hours counting the drawings by hand. The idea: let AI take the first pass, put a draft in the tool they already use, and let the specialist start from something — not from zero. They check, verify, add or remove, then sign off.

---

## Spoken script

**[0:00 — The ask]**  
A contractor sends Ahlsell a pack of drawings and says: what will the hardware and fittings cost?

They need that answer early. Sometimes two years before the building exists. The quote is how Ahlsell wins the job.

**[0:12 — Two people]**  
The customer wants a clear request: you saw my rooms, you didn’t invent a shopping list.

The specialist wants to answer faster, and still be sure. They own the customer. They sign the quote.

**[0:24 — The pain]**  
Today that answer is hand work.

They open drawing after drawing. They count every hook, hatch, shelf, dispenser. They measure what has no length. They look up an article — or an equivalent — in the catalogue.

Some do it in Bluebeam. Some still print A2 and use a highlighter. Either way, they start from a blank page.

Hours. And if they miss a room, the quote is wrong.

**[0:48 — The dream]**  
What if the first pass was not blank?

AI reads the plans, page by page. It drafts a mark-up — the same kind of list they already make in Bluebeam. It suggests catalogue matches for what the drawing asked for.

Not a finished quote. A starting point.

**[1:04 — The specialist’s job, still theirs]**  
The specialist opens that draft. They check. They verify. They add or remove what is needed.

They sign off on the take-off. The draft does not.

They did not start from zero. They did not walk every page only to begin counting.

**[1:22 — Close]**  
Faster. More confident. Still a person accountable.

That is what Ahlsell asked for. That is the idea.

---

## What we are *not* saying in this film

- How many lines the API found on one floor  
- H3, NEED, CHECK, or other working labels  
- That the machine is accurate enough to skip a human  
- That they should leave Bluebeam  

Those belong in a later, optional “how the prototype works” clip — not this one.

---

## Pictures that should sit under the words (later)

When we film the app, each beat is a *feeling*, not a tutorial:

| Time | Picture | Feeling |
|---|---|---|
| The ask | A drawing pack / PLAN 09 on screen | The request arrived |
| Two people | The two doors: Customer / Specialist | Two jobs, one drawing |
| The pain | Empty mark-up list, or a zoomed plan with no boxes yet | Starting from zero |
| The dream | First-crack PDF opening in Revu — boxes already on the sheet | They didn’t start from zero |
| Still theirs | Someone edits a mark, then the stamp “not signed” | They check. They sign. |
| Close | Customer “request sent” then specialist still in Revu | Handoff, not an order |

---

## How we actually make it

Three jobs. Do them in this order. Do not mix them.

1. **Pictures** — you click the real app and the two PDFs in **Edge**. No Revu. Screen only. No talking.  
2. **Voice** — later, a human or a warmer computer voice reads the script. Not the old robot track.  
3. **Cut** — we drop the six clips under the six voice lines on the NAS.

You never have to narrate.

### The six shots (you click this)

This recording pass is **Edge only**. Do not open Revu. Do not press Alt+L.

Open https://granite-plan09.pages.dev — hard-refresh first.

| Shot | Script beat | You do | Hold on this |
|---|---|---|---|
| 1 | The ask | Landing. Show the file `A-40-1-1091.pdf` in the list. Do not go in yet. | “A pack of drawings arrived.” |
| 2 | Two people | Click **Customer**, then **Specialist**, then back to **Customer**. Stay on the two doors. | Two jobs, one drawing. |
| 3 | The pain | **Neither door.** Do **not** press Open PLAN 09. Open `data/A-40-1-1091.pdf` in Edge. Zoom a room. Empty sheet. | Starting from zero. |
| 4 | The dream | Specialist door → Open PLAN 09 → download first-crack PDF (or the board link). Open in Edge. **Page 2.** Zoom the amber boxes. | Boxes already there. |
| 5 | Still theirs | Same Edge tab, page 2. Click one amber box so the comment pops. Leave it. | They check. They sign. |
| 6 | Close | Back to the site. Customer path → **Send request** until **SENT · NOT AN ORDER**. | Handoff, not an order. |

### How you record (laptop)

Windows: **Win + G** → Capture → Start recording. One take per shot is enough. Pause between shots.

Save the six clips. Copy them onto the NAS (this folder: `granite-plan09/files/demo-video/takes/`). Not only on the laptop disk.

### Voice (after the pictures exist)

Best: a teammate reads the spoken script once, in a quiet room, phone is fine.

Next best, no teammate: Edge browser → open the teleprompter page → **Read aloud** (a neural voice, much less robot than the old track) → we record that audio only.

We do **not** use the current `demo-voice` MP3s for this film.

### What I do after you have the takes

Takes landed in `2hero/screenshots/` as `1-dream.mp4` … `6-dream.mp4`.

Cut (silent + captions): `files/demo-video/granite-plan09-dream.mp4`  
Also copied next to the takes. Rebuild: `python3 scripts/build-dream-cut.py`

---

## Next physical step

Open `demo-board.html` on Pages (or this repo). It is the six shots and the words. Record with that beside the demo.
