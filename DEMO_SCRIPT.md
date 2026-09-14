# Qestia — Demo Video Script

**Length:** ~2:45 · **Format:** screen recording (OBS / Windows Game Bar), phone-width viewport, mic voiceover
**Prod URL:** `https://qestia.vercel.app` (use this, not localhost — the two new features, PDF + AI, are the headline)

**Setup before recording:**
- Record against the **prod SPA** at `https://qestia.vercel.app` so the URL is correct on every frame.
- Stakes run in **mock mode** (sandbox, instant confirms — no wallet prompts). The recording setup note says "mock mode"; on prod that means the backend `PAYMENTS_MODE=mock` so commitments confirm instantly while you still show the on-chain memo flow.
- Browser devtools → mobile viewport (390×844), 100% zoom.
- Two browser windows side-by-side for the multiplayer moment (Window A = host, Window B = player).
- `DISPUTE_WINDOW_SECONDS=20` on a **staging copy or local instance** so the stepper walks VALIDATING → SETTLED on camera (keep prod window on default).
- `scripts/seed.mjs` quiz pre-staged; a real lecture **PDF** on the clipboard for the Create beat.
- Close Slack/notifications; do one dry run.

---

## Shot list (beats)

### 0:00–0:05 — Hook (title card)
**VO:** "What if your notes paid you for showing up?"
- Title card: **Qestia — Know it. Prove it.** (asset: `video/title-card.html`)

### 0:05–0:15 — Problem
**VO:** "Online studying is solo, and there's no skin in the game. Qestia flips that — you commit a stake, and the room keeps you honest."
- Quick cut to the Welcome screen: "Qestia — Know it. Prove it." Type name "Ada", pick **Commitment** mode.

### 0:15–0:55 — Create: PDF → AI (THE headline beat)
**VO:** "Here's the new part. Upload a real lecture PDF — and Qestia's AI reads it and drafts the whole Qest for you. Cloze, multiple choice, true-or-false. You review one question, tweak it, set the stake and the start time, and publish. You never see the answers, so you play blind, just like everyone else."
- Home → **Create a Qest** → **Upload PDF** → pick the lecture file → progress stages ("Extracting…", "Generating…") → review screen, tap through one question to show editing.
- Settings: 5 questions · 3 min · 10 NIM · starts now → **Publish** → lands on quiz detail.

### 0:55–1:10 — Commit (both windows)
**VO:** "Now the commitment. Each player locks in the stake — verified on-chain with a personal memo code in real mode; instant in this demo. The room fills, the quorum meter ticks up."
- Window A: quiz detail → **Commit 10 NIM** → "You're in" → **Go to the lobby**.
- Window B (new identity, same quiz): commit → lobby. Bring in player 3 the same way.
- Lobby shot: countdown ring, quorum meter filling, all players in the room.

### 1:10–1:45 — Compete (Window A, then B briefly)
**VO:** "Quorum met — the room goes live. One answer per question, locked the moment you confirm. The clock is the server's, not yours. Wrong answers and no-shows feed the pool; finishing pays a bonus."
- Lobby auto-detects LIVE → **Enter Qest**.
- Answer 2–3 questions fast; show a correct reveal and a wrong reveal.
- Let the timer visibly run; finish.

### 1:45–2:15 — Settle / Results (Window A)
**VO:** "When everyone's done, answers unseal. Ties share a rank's cut, and every payout is money-conserving — the pot always adds up."
- Submitted screen → results appear (polling walks the stepper VALIDATING → FINALIZED → SETTLED).
- **Podium shot**, personal result card, full ranking with tie badges.
- Open review: reveal states + the cream "Why" explanation card.

### 2:15–2:30 — Economics (caption card)
**VO:** "The economics: finish and get 80% back. Top three split the rest — 50, 30, 10. Under quorum, everyone's refunded in full. It literally pays to show up."
- Economics diagram card (asset: `video/economics.html`).

### 2:30–2:45 — CTA (Welcome screen)
**VO:** "Qestia. Turn today's lecture into tonight's Qest. Link in the description. Know it. Prove it."
- Thumbnail mock (asset: `video/thumbnail.html`) + logo + tagline. End.

---

## Recording checklist
- [ ] Mic level checked, quiet room
- [ ] Phone viewport + browser chrome hidden
- [ ] Prod URL in the address bar on every app shot (never localhost / `LK-` / dev jargon)
- [ ] PDF on clipboard, dispute window short on the staging/local instance
- [ ] One smooth dry run before the real take
- [ ] 1080p export, normalize audio, upload + add captions

## Fallback if live walk stalls
- If quorum is slow, seed extra players via `scripts/e2e-smoke.mjs` before recording that shot.
- If a poll takes long, edit a hard cut — polling gaps read worse than cuts.

## Agent-produced assets (in `video/`)
- `title-card.html` — hook title card
- `captions.html` — section caption slides
- `economics.html` — 50/30/10 + 80%-back diagram
- `thumbnail.html` — YouTube thumbnail mock (screenshot)
- `narration.md` — word-for-word teleprompter
- `youtube.md` — title, description, chapter stamps
