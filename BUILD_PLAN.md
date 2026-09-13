# Qestia Build Plan

**Deadline: Sep 18** · Stack: React+Vite+TS+Tailwind / FastAPI / Nimiq SDK · Payments: mock first, real later

---

## Process rules

1. **Phase by phase.** Never one-shot the project. One phase at a time → verify (lint, typecheck, build) → tick boxes → **commit & push** → post a phase summary (added / changed / improved).
2. **CI gate.** CI runs on the **self-hosted runner `qestia-pc`** (the dev PC — GitHub-hosted runners are account-blocked, E-013; setup/ops in DEPLOY.md). Pushes to `main` trigger: frontend lint + typecheck + build, backend install + compile. **CI green as of Phase 0.5.** If the runner is offline, start it with `C:\Users\hp\actions-runner\run.cmd` — queued jobs pick up automatically. Local gates (lint + build before every commit) remain mandatory regardless.
3. **Error discipline.** Every error gets logged in `ERROR.md` with cause + fix. When a new error appears, **scan `ERROR.md` first** — similar signatures often repeat.
4. **Build in slices.** UI for a flow → backend for that flow → test → commit. Integration happens per-flow, not as a big bang at the end.
5. **Deploy via `DEPLOY.md`.** Checklist before/after every deploy; every deploy maps to a git commit (rollback = redeploy previous tag).
6. **Regression rule.** Any bug caught late (CI, deploy, manual test) becomes a test that reproduces it before it's fixed.

---

## Phase 0 — Setup & Scaffolding ✅
**Goal:** Running shell with tooling, before any features.

- [x] **0.1 Scaffold frontend** — Vite + React + TS template; `tailwindcss @tailwindcss/vite react-router-dom` installed; dev server verified on :5173.
- [x] **0.2 Design tokens** — Soft-blue theme in Tailwind v4 `@theme` (canvas `#F4F7FE`, primary `#4A7DFF`, coral/amber accents, green/red feedback, radius 16–24px, Nunito/Inter). Verified with a token test page.
- [x] **0.3 Project structure** — `src/{screens,components,hooks,api,lib,context}` + `@/` path alias (Vite + tsconfig).
- [x] **0.4 Lint + typecheck** — oxlint + `tsc -b` (via `npm run build`) pass clean. *(See E-010 in ERROR.md: bare `tsc --noEmit` is a no-op on solution-style tsconfig — the gate is `npm run build`.)*

## Phase 0.5 — Safety Net (Git + CI + logs)
**Goal:** The solo-dev safety system, day one: version control, CI, error log, deploy checklist.

- [x] **0.5.1 Git repo** — `git init -b main`, root `.gitignore` (deps, dist, env, logs, zip, private planning docs); `git status` clean of junk.- [x] **0.5.2 ERROR.md** — Every error hit so far logged with cause + fix (13 entries; see E-013 for the CI block diagnosis).
- [x] **0.5.3 CI workflow** — `.github/workflows/ci.yml`: frontend (npm ci → lint → build) + backend (pip install → compileall). **Blocked from going green by account-level Actions restriction (E-013) — fix = add payment method to GitHub account, then re-push. Local gates remain mandatory meanwhile.**
- [x] **0.5.4 DEPLOY.md** — Deploy checklist, production smoke tests, rollback procedure, critical-flow list.
- [x] **0.5.5 Commit & push** — Backend baseline + Phase 0 + Phase 0.5 committed and pushed to https://github.com/er4l1m4d/qestia (public). CI green pending E-013 fix.

## Phase 1 — Foundation (API layer + shared components) ✅
**Goal:** Everything screens are built from, so screen work is assembly only.

- [x] **1.1 Types** — `api/types.ts`: Quiz, Participant, Question, Answer, User, all status enums, request/response shapes, `QestiaApi` interface, `VALID_QUIZ_TRANSITIONS` mirroring `services.py`, `QUIZ_LIFECYCLE` for the status stepper.
- [x] **1.2 API client** — `api/client.ts`: typed fetch wrapper for all existing endpoints (users, quizzes CRUD, publish/open/start, demo-start, state, answers) + JSON→domain mappers; `ApiError`. Base URL from `VITE_API_URL`.
- [x] **1.3 Mock mode** — `api/mock.ts`: full in-memory implementation (seeded quizzes, state machine, one-answer enforcement, auto-lifecycle advance) + `computePayouts` implementing the locked economics (50/30/10, 80/20, no-show 50/50, 10% completion bonus, ties split, skipped allocations → bonus). Toggle: `VITE_USE_MOCK=true`.
- [x] **1.4 Polling hook** — `hooks/usePolling.ts`: interval + pause-when-hidden + error swallowing.
- [x] **1.5 Core components** — Button (4 variants × 3 sizes), StatusPill (11 statuses), TimerPill (countdown, warn state), MeterBar (target marker), EmptyState, Modal, StepDots. Component gallery route in App.tsx to eyeball them all.
- [x] **1.6 Quiz components** — QuizCard, OptionButton (idle/selected/correct/wrong/missed), PodiumSlot (2-1-3 order, medals, heights), ParticipantRow (status dots), MemoCard (code + escrow address, copy buttons).
- [x] **1.7 (added) Payout regression tests** — `payouts.test.ts` (vitest): 4 scenarios incl. tie competition ranking (1,1,3) and no-shows, every case asserts money conservation (E-017). `npm test` added to gates + CI.

## Phase 2 — App Shell & Navigation ✅
**Goal:** Mobile-first frame all screens live in.

- [x] **2.1 Router + shell** — BrowserRouter, all 11 routes + session gates (`RequireSession` / `RedirectIfSession`); `AppShell` (max-w-md, safe areas); `BottomNav` (Home/Create/Profile, active pill); `vercel.json` SPA rewrites; dev-only `/dev/gallery` for components.
- [x] **2.2 Session context** — `SessionProvider` with lazy localStorage init (no restore flicker), `signIn`/`setMode`/`signOut`, display name + mode persisted.

## Phase 3 — Core MVP Screens (+ browse/detail/play slice) ✅ (3.6 backend pending)
**Goal:** The demo-critical path works end-to-end. Slice: browse → detail → play wired to the real backend wherever endpoints exist.

- [x] **3.1 Welcome** — Logo, tagline, 3 mode cards (Demo/Practice/Commitment), display-name input, Enter CTA; session created via mock/real API.
- [x] **3.2 Home/Browse** — Greeting + mode banner, status filter chips (All/Open/Live/Validating/Settled), sorted QuizCard list (joinable first, soonest start), skeleton loading, empty + error states, polling 6s.
- [x] **3.3 Quiz Detail** — Hero card (stake/questions/duration stats), starts-in countdown, pot preview + min-3 MeterBar, player chips, creator-blind note, sticky CTA (Commit / Go to lobby / See results by status).
- [x] **3.4 Quiz Play** — Idempotent join → auto-start → questions one at a time; server-clock TimerPill, progress bar, OptionButtons with reveal states (correct/wrong/missed), one-shot lock-in with double-submit guard, auto-advance, finish screen; play session persisted in sessionStorage (survives refresh mid-quiz).
- [x] **3.5 Submitted/Waiting** — Sealed-answers state with room status polling; button to results when validation starts.
- [x] **3.6 Backend: public quiz list** — `GET /api/quizzes` (status filter, joinable-first sort, participant counts, minParticipants); wired Home to it. Tested.
- [x] **3.7 (added) Mock flow integration tests** — `flow.test.ts`: 6 tests covering the DEPLOY.md critical flows on the mock layer (create → join x4 → idempotent join → hidden correct answers → one-answer enforcement → auto-VALIDATING → conserved payouts). 10/10 tests total.

## Phase 4 — Creation & Commitment Flow (+ join slice) ✅ (4.6 backend pending)
**Goal:** Users can create quizzes and join with stakes (mock payments).

- [x] **4.1 Create — Upload** — Title/description inputs, file upload (.txt/.md via FileReader; PDF politely deferred to the AI backend), paste area with char count, settings choosers (questions 5–20, duration 1–15 min, stake presets, start delay 15/30/60 min).
- [x] **4.2 Create — Generate** — Staged progress (Reading → Drafting → Polishing) with `lib/generator.ts`: cloze-style mock AI from pasted material (unique answer words, distractor pool, explanations). Real Gemini swaps in at Phase 6 behind the same interface. Failure path with retry.
- [x] **4.3 Create — Review** — Editable question cards (text, 4 options, correct-key selector, explanation), reorder/delete/add, blank-draft templates; publish = createQuiz → addQuestion×N → publish → open → navigate to detail.
- [x] **4.4 Commitment (mock)** — Stake summary + payout rules recap, confirming spinner, instant-CONFIRMED mock tx → join → MemoCard with `LK-XXXX` code (renamed QS- in Phase 9 — E.2) + escrow address → lobby CTA.
- [x] **4.5 Lobby** — SVG countdown ring to `startsAt`, quorum MeterBar (min 3) with success/warning states, participants list (host badge, creator-plays-blind note), auto-detects LIVE → "Enter the quiz", closed rooms → results link.
- [x] **4.7 (added) Generator tests** — `generator.test.ts`: 6 tests (count, cloze shape, unique options/answers, thin-material rejection, blank draft, memo format).
- [x] **4.6 Backend: join endpoint** — `POST /api/quizzes/{id}/join` (OPEN-only, idempotent, mock-instant CONFIRMED transaction ledger rows); publish auto-joins the creator as a participant (`CREATOR_COMMITMENT`) per the "min includes creator" rule; `GET .../participants` joined with display names. Tested.

## Phase 5 — Results & Post-Quiz (+ results slice) ✅ (5.4 backend pending)
**Goal:** Full lifecycle visible: validate → finalize → payout.

- [x] **5.1 Results** — Personal result banner (rank, score, NIM back/won/lost), podium top 3 with pool split note, full ranking rows (medals, correct counts, tie badges, payout + kind labels, "you" highlight), status stepper VALIDATING→FINALIZED→SETTLED with 5s polling; waiting state while LIVE. Mock auto-advances the lifecycle (~15s per stage) to demo the dispute window.
- [x] **5.2 Review** — Per-question cards: options with reveal states (correct ✓, your wrong pick ✗, missed dimmed), "You picked B — the answer was A" line, METHOD-style cream "Why" explanation card; sealed-until-validated gate; summary header with score + %.
- [x] **5.3 Profile** — Avatar + name + wallet chip, stat cards (quizzes / podiums / net NIM), mode switcher (demo/practice/commitment) with explanations, history list (title, score, medal/#rank, net NIM colored, status pill) linking to results, sign-out.
- [x] **5.5 (added) Review + history tests** — flow.test.ts extended to 8 tests: review reveals correct answers + player answers (with a missed-question case), history returns rank/payout/entry. API: `getReview` + `getMyHistory` in interface (mock real, client stubs until Phase 6).
- [x] **5.4 Backend: results + payout plan** — `GET /api/quizzes/{id}/results` (competition ranking 1,1,3; exact locked payout economics in `compute_payouts`, Decimal-based, money-conservation asserted in tests; ranks + score percentages persisted at FINALIZE). Wired Results to it.

## Phase 5.5 — UI/UX Quality Pass ✅
**Goal:** Bring the implemented app in line with the inspiration references and the UI/UX quality rules before deeper backend work.

- [x] **5.5.1 Visual system** — Persisted `design-system/MASTER.md`; refined the existing soft-blue direction into a restrained, contrast-safe OKLCH token system with compact 16px surfaces and consistent elevation.
- [x] **5.5.2 Icon language** — Added a shared stroke-based SVG `Icon` component and replaced structural emoji across navigation, states, payout explanations, results, and forms.
- [x] **5.5.3 Responsive shell** — Expanded the app frame for desktop, retained a readable content column, reserved fixed navigation space, added safe-area support, and added a skip link.
- [x] **5.5.4 Interaction quality** — Added visible focus rings, route-change focus, 44px controls, semantic form sizing, modal close/focus trap/Escape behavior, touch manipulation, and reduced-motion support.
- [x] **5.5.5 Screen polish** — Improved Welcome hierarchy, Home orientation/CTA, quiz-card affordance, status/timer readability, participant state text, editor controls, result/review surfaces, and loading/empty states.
- [x] **5.5.6 Quality verification** — Detector clean; lint, 18 tests, and production build pass. Commit and push this phase before starting backend integration.

## Phase 6 — Lifecycle & Backend Integration ✅
**Goal:** The real FastAPI owns the clock and the state machine; critical flows are regression-protected.

- [x] **6.0 (added) Portable backend** — Models on portable types (`Uuid`/`JSON`), SQLite (aiosqlite) as zero-setup dev/test DB with Postgres `DATABASE_URL` for production; `init_db()` on startup; `min_participants` + lifecycle timestamps added to schema/SQL; `explanation` stored.
- [x] **6.1 Full state machine** — `maybe_advance` (one transition per poll, so steppers visibly walk): auto-LIVE at `starts_at` when quorum met, auto-CANCEL→REFUNDING→REFUNDED under quorum (mock refund ledger), LIVE→ENDED when all terminal, ENDED→VALIDATING, dispute window (`DISPUTE_WINDOW_SECONDS`, default 300) →FINALIZE (persists ranks/scores) →SETTLED.
- [x] **6.2 Timer authority (shipped scope)** — Server-owned deadline from `quiz.started_at`, enforced in `submit_answer` (+10s grace, "Time is up"), auto-TIMED_OUT on expiry via polling, `/state?user_id=` returns participant status. Disconnect-pause/60s-window/3-strike deferred to Phase 7 hardening (needs session endpoints).
- [x] **6.3 Critical-flow e2e suite** — `backend/tests/test_api.py` (pytest + httpx ASGI, in-memory SQLite): 7 tests incl. full 4-player flow with exact payout assertions (110.5/106.5/102.5/80.5 of 400 staked), questions never leak answers, underquorum auto-cancel, auto-LIVE, deadline enforcement, review/history. CI backend job now installs dev deps + runs pytest.
- [x] **6.4 3-profile run** — `scripts/e2e-smoke.mjs` runs the full 3-user loop against a live server (health → users → create → commit x3 → LIVE → play → SETTLED → conserved payouts → review → history). **PASSED** against local uvicorn; frontend wired to real endpoints (`VITE_USE_MOCK=false`).
- [x] **6.5 (added) Frontend wiring** — Real client endpoints for list/join/participants/questions/results/review/history; camelCase payload fix (E-023); creator-only early start; `/questions` marks callers ACTIVE; practice mode = minParticipants 1 + "start now" (default 0 min); Detail/Lobby quorum from `quiz.minParticipants`.

## Phase 7 — Nimiq Integration (real mode) ✅
**Goal:** Real NIM commitments + payouts for scoring points.

- [x] **7.1 Mini App SDK** — `@nimiq/mini-app-sdk` installed; `src/lib/nimiq.ts` wraps `init()` (graceful null outside Nimiq Pay), `listAccounts`, `sendBasicTransactionWithData` (feeless NIM + LK-memo (renamed QS- in Phase 9 — E.2), lunas conversion), `requestDeviceIdentifier` (anti-cheat, stored on user via wallet link). Profile screen links the wallet through the real provider; CommitScreen probes availability and degrades to manual send + tx-hash verification.
- [x] **7.2 Real commitment flow** — Join (real mode) → participant PENDING + unique `LK-XXXX` memo (renamed QS- in Phase 9 — E.2) + PENDING transaction row → wallet sends escrow tx with memo → `POST /commitments/verify` looks it up via `getTransactionByHash` on the Nim RPC node and validates recipient/value/memo/sender (sender must equal the linked wallet) → JOINED + CONFIRMED tx. Quorum counts confirmed players only; PENDING never counts, never refunds (never paid). `GET /config` exposes paymentsMode + escrow address; fake-chain pytest covers the whole path incl. rejections and settlement.
- [x] **7.3 Settlement sidecar** — `settlement/` Node service using `@nimiq/core`: restores escrow keypair from `ESCROW_PRIVATE_KEY`, polls `GET /api/settlement/queue` (token-guarded), builds feeless `TransactionBuilder.newBasicWithData` payouts ("LK-PAYOUT" memo (renamed QS-PAYOUT in Phase 9 — E.2)), broadcasts via `sendRawTransaction`, reports hashes via `POST /api/settlement/complete` → backend records PAYOUT transactions + flips SETTLED. `npm run new-key` generates the escrow keypair (verified against the real library). `DRY_RUN=true` runs the loop without a node. FINALIZED→SETTLED is sidecar-gated in real mode (mock still auto-settles).
- [x] **7.4 Feature flag** — `PAYMENTS_MODE=mock|real` end-to-end: backend env → `/api/config` → frontend CommitScreen flow selection. Mock = instant confirm (default, demo-safe); real = memo + wallet send + on-chain verification + sidecar settlement. Both paths testable (mock via smoke, real via fake-chain pytest).
- [x] **7.5 (added) Tests + smoke** — `test_real_mode.py` (7 tests): pending/memo join, underquorum with PENDING, wrong-amount/recipient/memo/unknown-hash rejections, sender-mismatch with linked wallet, full 4-player real flow with exact tie-aware payouts + sidecar queue/complete, token guards. 14/14 backend + 18/18 frontend green; live smoke PASSED (config + commitment status checks added).

## Phase 8 — Polish & Competition Prep
**Goal:** Ship-ready submission.

- [x] **8.1 UX polish pass** — Audit-driven: every screen now has loading/empty/error(+retry)/stale states; failed answer submits no longer render as wrong answers (QuizPlay); friendly error copy via `api/errors.ts`; new `ErrorState`/`ErrorBanner`/`StaleBanner`/`Skeleton` components; AA contrast fixes (amber-dark, accent-dark tokens); a11y (h1 on play screen, aria-live for question/reveal/success announcements, tablist misuse fixed, 44px touch targets, label fixes); route + modal enter motion (reduced-motion safe); copy tone pass (no "mock payments"/"ping"/"AI backend" jargon, pot/pool unified, "99th place" no-show bug fixed).
- [ ] **8.2 Deploy** — Prep complete: CORS middleware on the backend (`CORS_ORIGINS` allowlist — was a deploy blocker), `render.yaml` blueprint (render blueprint dropped — single Vercel project, see DEPLOY.md), DEPLOY.md first-deploy runbook (Neon → Vercel, env vars, smoke checks), + E-027 disk-full CI failure fixed. **Execution pending: run the DEPLOY.md "First deploy runbook" (needs Neon/Vercel accounts).**
- [x] **8.3 Repo requirements** — MIT LICENSE, README rewritten (quickstart, demo sequence, real-mode setup, commands, architecture notes), `DESCRIPTION.md` 250-word description, repo description set via `gh repo edit`.
- [ ] **8.4 Demo video** — Script done (`DEMO_SCRIPT.md`, ~2:30 shot list + setup checklist). **Recording pending.** → superseded by **9.6** (script must update for AI + PDF scenes first; see `SPRINT_PLAN.md` G.1).
- [ ] **8.5 Register + first users** — Checklist done (`LAUNCH.md`: dashboard registration, pre-launch sanity, quiz plan, WhatsApp template, post-launch) + `scripts/seed.mjs` (idempotent launch-night quiz seeder, tested against a local server). **Registration + push pending.** → execution plan in `SPRINT_PLAN.md` Track H.

## Phase 9 — Completion Sprint (Sep 13–18) — full detail in [`SPRINT_PLAN.md`](SPRINT_PLAN.md)
**Goal:** close every remaining gap and ship the submission by the deadline. One track at a time, in this order; each has a time-box + cut line in SPRINT_PLAN.

- [ ] **9.1 E — Consistency & hygiene** (Sun, 3 h) — fix `LK-`→`QS-` smoke bug (E.1) + `LK-PAYOUT` memo (E.2), kill stale nivora/onrender refs (E.3–E.4), **schema freeze before first deploy** (E.6). Gate: smoke PASSES locally.
- [ ] **9.2 C — Production deploy** (Sun, 4 h) — run DEPLOY.md first-deploy runbook (Neon + single Vercel project, mock mode), deps `pypdf` + `python-multipart` added pre-deploy, tag v0.9.0. Gate: **e2e smoke PASSES against prod URL.**
- [ ] **9.3 A — AI question generation** (Mon, 6 h) — backend `POST /api/generate` via OpenAI-compatible client (`llm.py`; model bake-off qwen3.8-flash vs hy3 first, qwen default), CreateScreen tries API then falls back to the local cloze generator; key stays server-side; `LLM_ENABLED=false` = instant rollback.
- [ ] **9.4 B — PDF upload** (Mon–Tue, 3 h) — `POST /api/materials` (pypdf, 5 MB cap, scanned-PDF → friendly 422); extracted text lands in the editable paste area; "PDF coming soon" removed.
- [ ] **9.5 D — Real NIM verification** (Mon spike, **Tue 12:00 hard gate**) — mainnet micro-stakes proof on a dev instance (1 commitment + 1 payout, hashes in `REALMODE_PROOF.md`); prod stays mock. NO-GO = freeze with honest FakeChain-tested story; zero further time.
- [ ] **9.6 F — Reconnect hardening (minimal)** (Tue, 4 h) — `last_seen_at` heartbeat via `/state`, server-authoritative "first unanswered" resume, away dots in Lobby, welcome-back banner. **No timer pause** (deferred, SPRINT_PLAN §12).
- [ ] **9.7 G — Demo video** (Wed, 4 h) — update `DEMO_SCRIPT.md` (AI + PDF beats + prod URL), agent preps slides/narration/description/thumbnail, recording + upload.
- [ ] **9.8 H — Launch & submission** (Thu–Fri) — Thu: draft submission + incognito/phone dry run + **feature freeze 12:00**; Fri: submit, seed launch quiz, WhatsApp push, results post, `v1.0.0` tag.
- [ ] **9.9 Process rules** (continuous) — local gates before every commit; runner started per session; ERROR.md discipline; regression-before-fix; time-box → cut line → next gate, never overtime.
