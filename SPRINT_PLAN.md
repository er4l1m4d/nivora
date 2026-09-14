# SPRINT_PLAN.md — Qestia Completion Sprint (Sep 13 → Sep 18)

**Goal:** close every gap between "92% built" and "submitted, deployed, demoed, launched" by the **Sep 18 deadline**, without destabilizing what already works.

This document is the execution plan for the remaining work. It inherits every process rule from `BUILD_PLAN.md` (phase-by-phase, local gates before commit, ERROR.md discipline, regression rule, commit & push per phase). BUILD_PLAN gets short Phase 9 pointers; this file holds the detail.

---

## 0. Definition of Done (what "submitted" means)

The sprint is finished when ALL of these are true:

- [ ] **Prod URL live** — Vercel (frontend + `/api`), Neon Postgres, `PAYMENTS_MODE=mock`, deep links work.
- [ ] **AI generation shipped** — pasted/uploaded material → LLM-drafted questions behind the existing Review UI, with automatic fallback to the local cloze generator on failure.
- [ ] **PDF upload shipped** — `.pdf` material extracts server-side and lands in the same paste area.
- [ ] **All `LK-` legacy refs gone** — smoke test green against current code, payout memo is `QS-PAYOUT`, docs consistent.
- [ ] **Reconnect-hardened play** — refresh/disconnect mid-quiz resumes from the first unanswered question; away state visible to the room.
- [ ] **Real-NIM proof recorded** (Go) or **documented stretch runbook** (No-Go) — see Track D's gate.
- [ ] **Demo video uploaded** (~2:30, per updated `DEMO_SCRIPT.md`).
- [ ] **Competition dashboard submission complete** — repo, description, video, live URL, all openable incognito.
- [ ] **Launch night executed** — seeded quiz, cohort push, results screenshot, `v1.0.0` tag.
- [ ] **CI green**, `npm run checks` green, `python -m pytest backend/tests -q` green (≥ 34 + new tests).

---

## 1. Workstream overview

| # | Track | What it closes | Time-box | Days | Depends on |
|---|---|---|---|---|---|
| E | Consistency & hygiene | stale refs, smoke bug, schema freeze | 3 h | Sun | — |
| C | Production deploy | 8.2 | 4 h | Sun | E |
| A | AI generation | 4.2 deferral | 6 h | Mon | C (env slots) — code independent |
| B | PDF upload | 4.1 deferral | 3 h | Mon–Tue | A |
| D | Real NIM verification | Phase 7 live gap | 4 h spike + 3 h exec | Mon–Tue | C (HTTPS URL), E |
| F | Reconnect hardening | 6.2 deferral | 4 h | Tue | E (schema freeze) |
| G | Demo video | 8.4 | 4 h | Wed | A, B, (D optional) |
| H | Launch & submission | 8.4–8.5 | 5 h | Thu–Fri | all |

**Ordering rationale:**
1. **E first** — it's cheap, fixes a broken smoke test, and freezes the schema *before* the first production `init_db()` (see E.6 — this avoids every migration problem in one move).
2. **C second** — a real URL de-risks everything downstream (video, mini-app testing, launch). Nothing after this point needs a localhost dance.
3. **A → B** share the generation pipeline; B feeds text into A, so B builds on A's endpoint shape.
4. **D is time-boxed with a hard gate** — it's the only track with external dependencies (node access, buying NIM) that can eat the whole week.
5. **G needs the final feature set stable** — recording twice because the UI changed is the classic deadline trap.
6. **H is execution of `LAUNCH.md`** with corrected URLs and the two new scenes (AI + PDF).

---

## 2. Answers to the open decisions (baked into the tracks)

| Question | Decision | Why |
|---|---|---|
| Which LLM — `qwen3.8-flash` vs `hy3` (b.ai)? | **`qwen3.8-flash` first**, provider-agnostic config, one env var swaps to `hy3` | Question generation is a *constrained JSON* task (cloze + 4 options + explanation), not a reasoning task. Flash-class models are faster, cheaper, and follow strict JSON schemas reliably; hy3's extra reasoning buys little here and costs latency inside a 10 s serverless budget. A 15-minute head-to-head on Day 1 (A.0) confirms it with your own material before we lock it. |
| PDF upload where? | **Backend extraction (`pypdf`)** | The AI path is already moving server-side, so extraction joins it: one code path, no 400 KB pdf.js bundle in a mobile-first app, works identically in mock/real modes, and the extracted text still lands in the editable paste area so the user sees exactly what the AI saw. Client-side pdf.js only wins on privacy, and the material is being sent to an LLM anyway. |
| Testnet or mainnet? | **Mainnet, micro-stakes, verified on a dev instance; prod stays mock** | Nimiq's testnet (Rialto) tooling, faucets, and Nimiq Pay support are uncertain in 2026 — chasing a dead faucet is exactly the time sink Track D's gate exists to prevent. Mainnet with a 1–2 NIM stake is real money but trivial amounts, works in the real wallet, and produces explorer links judges can click. **Production keeps `PAYMENTS_MODE=mock`** per LAUNCH.md's own rule — the demo URL must never risk someone's funds or depend on an escrow balance. The verified real-mode run becomes evidence (video scene + submission text + tx hashes), not a live dependency. |
| Deploy hands? | **You do ~20 min of signups + paste env values; agent executes everything scriptable** (vercel CLI checks, `gh`, curl smokes, config edits) | Accounts must be yours (billing, ownership). The runbook (C) is written as numbered dashboard clicks + the exact values, then a verification phase the agent runs. |
| Forward-looking schema tables (Track I)? | **Explicit non-goal** (see §12) | They're a head start on post-launch features (disputes, flags, payout plans), not gaps. Nobody interacting with the product can see them. |

---

## 3. Track E — Consistency & hygiene (Sun, ~3 h)

**Objective:** make the codebase's own artifacts agree with itself before anything else changes. Every later track tests through these.

### E.1 Fix the broken smoke test
`scripts/e2e-smoke.mjs:83` asserts `memoCode.startsWith('LK-')`, but `generate_memo_code()` (`backend/app/services.py:47-48`) and the mock generator (`frontend/src/lib/generator.ts:112`) both produce `QS-`. **The smoke test fails against current code today.**
- Change line 83 to `startsWith('QS-')`.
- Run `node scripts/e2e-smoke.mjs` against a local uvicorn and confirm PASS.

### E.2 Rename the last legacy memo: `LK-PAYOUT` → `QS-PAYOUT`
- `settlement/index.mjs:25` — `const PAYOUT_MEMO = new TextEncoder().encode('QS-PAYOUT')`
- `settlement/index.mjs:4` — update the comment.
- No backend test asserts the payout memo bytes (verified), so no test churn. The fake-chain tests only check commitment memos (`QS-`).
- Note in §15 of this doc + ERROR.md if anything surprises us; the sidecar memo is data embedded in a payout tx, cosmetic on-chain, zero parsing anywhere.

### E.3 Kill stale `nivora`/`onrender` references
- `LAUNCH.md:16-18` — replace `https://nivora-api.onrender.com` with `https://nivora-api.onrender.com` **and** the health path with `/api/health` (DEPLOY.md topology is single-origin Vercel). Replaced with the real project URL by C.6; placeholder `[PROD_URL]` until then.
- `BUILD_PLAN.md:115` — strike the `render.yaml` mention in the Phase 8.2 line (append note: "render blueprint dropped — single Vercel project, see DEPLOY.md"). Don't rewrite history elsewhere in BUILD_PLAN.
- `ERROR.md` is an append-only historical log — **do not edit past entries** (the nivora-era entries are accurate history).
- Grep to verify zero live-path refs: `rg "onrender|render.yaml|nivora-api" -g '!ERROR.md'` → only intentional historical notes remain.

### E.4 Docs truth pass
- `BUILD_PLAN.md` 4.4 / 7.1 / 7.2 / 7.3 mention `LK-XXXX`/`LK-memo`/`LK-PAYOUT` — append a bracket note "(renamed QS- in Phase 9 — E.2)" rather than rewriting, so the log stays honest.
- `README.md` and `DESCRIPTION.md` already say `QS-XXXX` — verify, no change.
- `DEMO_SCRIPT.md` — deferred to G.1 (it changes with the new AI/PDF scenes).

### E.5 CI green on the rename
- Start the self-hosted runner (DEPLOY.md "CI runner" WMI snippet).
- Run full local gates: `npm run lint && npm run build && npm run test && python -m pytest backend/tests -q`.
- Commit `fix: QS- memo consistency, smoke test, stale refs (E.1-E.4)` → push → confirm CI green in `runner-run.log`.

### E.6 Schema freeze — do this BEFORE the first production deploy
`init_db()` uses `create_all`, which **never alters existing tables**. Whatever the models say on deploy day is the production schema forever (no migration tooling in the MVP). So before C:
- Add `last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))` to `Participant` (`backend/app/models.py`) — Track F needs it.
- Mirror the column in `sql/001_initial_schema.sql` (participants table) to keep the reference schema honest.
- Dev SQLite: delete `qestia.db` and let `init_db()` recreate it (known procedure — ERROR.md disk/409 entry).
- **Freeze:** after this point, model columns are append-only through launch; any new column idea waits for post-launch migration work.

**Acceptance:** smoke PASSES locally; `rg "LK-"` over `frontend/ backend/ settlement/ scripts/` → zero hits (ERROR.md/BUILD_PLAN historical notes excepted); CI green; both schema files agree.

---

## 4. Track C — Production deploy (Sun, ~4 h) — closes 8.2

**Objective:** one Vercel project (SPA + Python `/api`), Neon Postgres, mock mode, pinned URL, everything documented. Follow DEPLOY.md "First deploy runbook" — this section adds the who-does-what and the exact values.

### C.1 Accounts (you, ~20 min total)
- [ ] **Neon** — console.neon.tech, sign in with GitHub, free tier. Create project `qestia`, region **`aws-eu-central-1`**. Copy the **pooled** connection string (ends `-pooler.neon.tech`, port `6543`).
- [ ] **Vercel** — vercel.com, sign in with the same GitHub account. Install nothing yet; dashboard is enough (agent CLI optional: `npm i -g vercel` + `vercel login`).

### C.2 Vercel project (dashboard, you + agent verifying)
- [ ] Import `er4l1m4d/qestia`. **Root Directory: repository root** (not `frontend/`).
- [ ] Framework preset: Vite → but build command must run from root: `npm run build` (it builds `frontend/dist` per `vercel.json`); output `frontend/dist`.
- [ ] `vercel.json` already routes `/api/*` → `api/index.py` and sets `maxDuration: 10`. `api/index.py` exports the FastAPI `app` for the Python runtime's ASGI autodetect.
- [ ] `requirements.txt` (root) is what Vercel's builder installs for the function — it currently lacks **`python-multipart`** and **`pypdf`**. Add BOTH now to root + `backend/requirements.txt` (B needs them; doing it at deploy time avoids a broken-build surprise later). Pin versions: `pypdf>=5.0`, `python-multipart>=0.0.9`.

### C.3 Environment variables (Vercel dashboard → Project → Settings → Environments)

| Var | Value | Set by |
|---|---|---|
| `DATABASE_URL` | Neon pooled string (paste) | you |
| `PYTHON_VERSION` | `3.12` | you |
| `PAYMENTS_MODE` | `mock` | you |
| `DISPUTE_WINDOW_SECONDS` | `300` | you |
| `CORS_ORIGINS` | `http://localhost:5173` | you |
| `SETTLEMENT_TOKEN` | `openssl rand -hex 32` output (agent generates) | agent |
| `ESCROW_ADDRESS`, `NIMIQ_RPC_URL` | **omit for now** — Track D may fill them (then re-check DEPLOY.md real-payments boxes) | — |
| `VITE_API_URL` | *(empty — same-origin `/api`)* | you |
| `VITE_USE_MOCK` | `false` | you |
| `LLM_API_BASE` / `LLM_API_KEY` / `LLM_MODEL` | from Track A — placeholders now, real values after A.0 | you |

- [ ] **Redeploy after setting env vars** (Vercel bakes `VITE_*` at build time).

### C.4 Verification (agent, scripted)
- [ ] `curl https://<project>.vercel.app/api/health` → 200 (allow 30–60 s cold start; Neon wake + `init_db`).
- [ ] Homepage 200; deep link `https://<project>.vercel.app/quiz/nonexistent` → SPA serves index (not 404).
- [ ] `node scripts/e2e-smoke.mjs https://<project>.vercel.app` → **full loop against production, mock mode, PASS** (this is the single biggest confidence event of the sprint).
- [ ] Create a real quiz via the prod UI in a browser, reload, still there (persistence round-trip).
- [ ] Vercel function logs clean during the smoke run (no 500s, no timeouts).

### C.5 Cold-start & serverless notes
- Hobby plan: 10 s max duration (already set), function may cold start ~1–3 s — acceptable; the frontend's error/stale states already cover a slow first paint. Do NOT add cron-warming this sprint (non-goal).
- `maybe_advance` batching was already refactored for this (DEPLOY.md line 22) — smoke run confirms it under real latency.

### C.6 Pin + record
- [ ] `git tag v0.9.0 && git push origin v0.9.0`.
- [ ] Record the prod URL in: `LAUNCH.md` (replace `[PROD_URL]`), `DESCRIPTION.md` if it links a demo, `DEMO_SCRIPT.md` setup section.
- [ ] Vercel: confirm the *production* alias (not a preview URL) is what's written down.

**Acceptance:** e2e smoke PASS against prod URL, logged in ERROR.md-free state; LAUNCH.md sanity list can start being ticked.

**Rollback:** every deploy = a git commit; redeploy previous tag (DEPLOY.md "If anything fails").

---

## 5. Track A — AI question generation (Mon, ~6 h) — closes the 4.2 deferral

**Objective:** `lib/generator.ts` stays as the offline fallback; the real pipeline runs **in the backend** so the API key is never client-side, and so Track B's PDF text feeds the same door.

### A.0 Provider spike — 15 minutes, do first (decision, not coding)
- [ ] Get an API key from b.ai. Record the exact auth style (bearer key + base URL; confirm it speaks **OpenAI-compatible `POST {base}/chat/completions`** — the plan assumes yes; if not, A.1's client function is the only file that changes).
- [ ] Head-to-head: run the SAME 3 short study texts (one rich, one thin, one bulleted) through `qwen3.8-flash` and `hy3` with the prompt below. Score each on: valid JSON first try (must be ≥ 5/6), fact fidelity to material, distractor plausibility, latency.
- [ ] **Default pick: `qwen3.8-flash`** (schema discipline + latency); promote `hy3` only if it visibly wins on quality. Either way it's just `LLM_MODEL=`.
- Log the outcome + chosen model in this file (append to A.0). This record is the "why qwen" answer if a judge asks.

### A.1 Backend client — new `backend/app/llm.py`
```
Config (env, read once at import like the rest of settings):
  LLM_ENABLED   = bool(LLM_API_KEY)
  LLM_API_BASE  = https://… (OpenAI-compatible, no trailing slash)
  LLM_API_KEY
  LLM_MODEL     = qwen3.8-flash
  LLM_TIMEOUT_SECONDS = 20        # under Vercel's 10s? NO — see A.2 timeout note
Interface:
  async def generate_questions(material: str, num_questions: int) -> list[GeneratedQuestion]
```
- Single `httpx.AsyncClient` POST to `{LLM_API_BASE}/chat/completions`, `response_format={"type":"json_object"}` if supported, temperature 0.7, max_tokens ≈ `90 * num_questions`.
- **Retry once** on network/5xx/JSON-parse/validation failure (the second try gets the parse error appended: "your previous output was invalid: …").
- Raise a clean `LlmError(detail)` on final failure — the endpoint translates it.
- Client injectable for tests (pass `httpx.Client`-like object), matching the `FakeChain` DI style from Phase 7.

### A.2 Endpoint — `POST /api/generate` in `backend/app/main.py`
- Request (`schemas.py`): `{ "material": str (≥ 200 chars), "numQuestions": int (5–20) }`.
- Response: `{ "source": "ai", "questions": [ {text, options[4], correctIndex, explanation} ] }` — camelCase via the existing `CamelModel`; **same shape the Review editor consumes** so 4.3's UI is untouched.
- Server-side validation of every LLM output: count matches request, 4 unique non-empty options per question, `correctIndex ∈ 0..3`, non-empty question text, explanation ≤ 400 chars. Any violation = the internal retry; final violation = `503 {"detail": "Generation failed — try the basic generator."}`.
- Guard rails: reject material > 40 000 chars (400); 429 on a naive per-IP rate limit is NOT built this sprint (MVP, trusted cohort) — note in non-goals.
- **Timeout arithmetic:** Vercel `maxDuration: 10` — so `LLM_TIMEOUT_SECONDS` must be **8**, single retry allowed only if first call returned fast; otherwise one retry risks the wall clock. Simplest correct behavior: 8 s per call, **max 2 calls total**, and if the budget is exhausted the endpoint 503s fast → frontend falls back locally. Judge demo never sees a spinner die.

### A.3 Prompt spec (goes in `llm.py` as a constant)
- System: "You write multiple-choice study questions from a student's own material. Rules: only facts present in the material; cloze ('____') where natural; exactly 4 plausible options, exactly one correct; distractors must be same-kind as the answer (dates with dates, terms with terms); one-sentence explanation citing the material; output ONLY a JSON object `{\"questions\":[{\"text\",\"options\":[…4],\"correctIndex\",…}]}`."
- User: material + `num_questions`.
- Log (without keys) prompt/response sizes at INFO for debuggability.

### A.4 Frontend wiring
- `api/types.ts`: add `generateQuestions(req): Promise<{source: 'ai'|'fallback', questions: DraftQuestion[]}>` to `QestiaApi` + a `DraftQuestion` type matching the editor's shape.
- `api/client.ts`: POST `/api/generate`; on any `ApiError`/network failure, **caller decides fallback** (next bullet).
- `api/mock.ts`: implement via existing `lib/generator.ts` (so mock mode = unchanged behavior).
- `CreateScreen.tsx` step 2: try API first (keep staged progress labels — Reading → Drafting → Polishing map 1:1); on failure, run `generateDraftLocally()` and show a small `ErrorBanner`-style note: "AI unavailable — drafted from your text directly." Demo-safe by construction: no network, no key, still works.
- Remove the "Real Gemini swaps in at Phase 6" comment from `generator.ts:44-45`; it now reads "fallback engine — backend `/api/generate` is primary."

### A.5 Config + deploy
- Add the real `LLM_*` values to Vercel env (C.3 placeholders) → redeploy → re-smoke.
- `.env.example` files (root + backend + frontend) updated with the new vars.

### A.6 Tests
- `backend/tests/test_generate.py` (new, injected fake LLM client): happy parse; invalid JSON → retry → valid; still-invalid → 503; short material → 400; oversized → 400; `LLM_ENABLED=false` → 503 (so smoke tests are hermetic without a key).
- `flow.test.ts` unaffected (mock layer unchanged). Add 1 mock test: `generateQuestions` in mock returns cloze drafts (interface parity).
- Manual: prod UI, paste the README text itself, generate 8 questions, eyeball, publish, play it once.

**Acceptance:** prod Create-screen generates AI questions < 10 s on typical material; pulling the network mid-generate lands on the local fallback, never a dead spinner; `pytest` count ≥ 16 + new.

**Rollback:** `LLM_ENABLED=false` reverts the entire product to pre-sprint behavior with zero code changes.

---

## 6. Track B — PDF upload (Mon eve → Tue, ~3 h) — closes the 4.1 deferral

**Objective:** `.pdf` files upload in Create step 1, text lands in the paste area, then it's A's normal path. No file storage anywhere (non-goal: blobs).

### B.1 Backend — `POST /api/materials`
- `UploadFile` (multipart; `python-multipart` added in C.2). Accept `.pdf` only; size cap **5 MB** → 413 above.
- `pypdf.PdfReader` → concat `page.extract_text()` (cap output at 40 000 chars — same ceiling as A.2).
- Response: `{ "text": …, "pages": int, "chars": int, "truncated": bool }`.
- Zero extractable text (scanned/image PDF) → `422 {"detail": "No selectable text — looks scanned. Paste the text instead."}`. Parse error / encrypted → 422 with a one-line reason.
- ~35 lines, lives in `main.py` (no new module).

### B.2 Frontend — CreateScreen step 1
- File input: add `.pdf`; route `.pdf` to `api.uploadMaterial(file)` (new `QestiaApi` method + client + mock that just rejects with "PDF needs the backend" — mock demo keeps paste flow); `.txt/.md` path unchanged (client FileReader).
- On success: append extracted text into the paste textarea (user sees exactly what gets generated from), toast "Extracted N pages", `truncated` → amber banner.
- Kill the "PDF coming soon" strings (`CreateScreen.tsx:54` message + `:242` label).

### B.3 Tests
- Backend: build a tiny PDF in-test with `pypdf.PdfWriter` + a text page (pypdf can write minimal pages; if proving awkward, commit a 2-page fixture PDF under `backend/tests/fixtures/`); cover happy, no-text, oversized, non-pdf, encrypted.
- Frontend: mock-path test that the UI branch calls `uploadMaterial` for pdf input (keep it cheap — API-surface test only).

**Acceptance:** upload a real lecture PDF on prod → questions generated from its content → published; scanned PDF gets the friendly 422, never a 500.

---

## 7. Track D — Real NIM, time-boxed (Mon spike → Tue 12:00 gate → Tue exec, ≤ 7 h total)

**Objective (re-decided):** get **one verified real commitment + one verified real payout on mainnet, at micro-stakes, against a local instance** — evidence for judges, confidence for us. Production stays mock. Testnet (Rialto) is explicitly **not** the default: faucet/node availability in 2026 is unverifiable from here and the mini-app wallet story is mainnet-first.

### D.1 Spike (Mon, ≤ 4 h, stop-the-clock is the point)
Answer these three, in order — each can kill the track:
1. **RPC reachability.** `backend/app/chain.py` needs an HTTP JSON-RPC (`getTransactionByHash` + `sendRawTransaction`); the sidecar uses `@nimiq/core` RPC client. Candidates: (a) any public Nimiq HTTP RPC endpoint the community runs (check docs.nimiq.com / nimiq.com/ecosystem for current node list — verify a method actually responds before believing an endpoint exists); (b) run `nimiq-client` (Rust) or the `nimiq/node` docker on this PC or a cheap 1-week VPS — **history sync can take hours; VPS preferred if available**; (c) browser `wss://` relay — only works for reads via the JS client, not our server-side code. **GO requires a reachable HTTP RPC from this PC AND from a Vercel function's egress** (if D ends prod-readiness, not just dev-proof).
2. **NIM acquisition.** Buy/bridge 5–10 NIM (cheapest route from where you are: exchange with NIM listing or a community swap). If acquisition > 2 h of friction, NO-GO.
3. **Wallet + mini-app.** Nimiq Pay app on your phone; can it open `nimpay://miniapp?url=<prod URL>` (or `https://nimpay.app/miniapps/open/…`) for an *unlisted* dev URL? If mini-app registration/allowlisting is required and can't be done this week, the fallback is still a valid proof: manual send from the wallet to escrow with the memo + `POST /commitments/verify` by tx hash (the UI already supports the manual-hash path). **The commitment can be verified on-chain without the SDK working.**

### D.2 Gate (Tue 12:00) — binary, no third option
- **GO** = RPC reachable + NIM in hand → spend Tue afternoon on D.3.
- **NO-GO** → freeze D: mark `DEPLOY.md` real-payments checklist items with their true state (what's proven via FakeChain vs what needs a node), write the blocked-on list into `SPRINT_PLAN` D.5, and the submission says "real-mode implemented + tested against a simulated chain; mainnet verification pending node access." That's an honest, still-strong story. **Zero further time spent.**

### D.3 Execution (Tue, ≤ 3 h, dev instance only)
- [ ] `cd settlement && npm run new-key` → escrow address + private key (key: password manager, never repo).
- [ ] Fund escrow address with the few NIM.
- [ ] Local backend: `PAYMENTS_MODE=real`, `ESCROW_ADDRESS`, `NIMIQ_RPC_URL`, `SETTLEMENT_TOKEN=x`, `DISPUTE_WINDOW_SECONDS=20`; run 2 extra "challenger" accounts yourself (two browsers + the phone wallet = 3 committed players → quorum).
- [ ] Stake 1 NIM. Complete one **real commitment**: memo flow → wallet/manual send → verification → JOINED (tx hash on the participant row).
- [ ] Play it out; start the sidecar (`DRY_RUN=false`, `@nimiq/core` node config) → **real payouts** leave the escrow with `QS-PAYOUT` memos; hashes recorded via `/api/settlement/complete`.
- [ ] Evidence pack: explorer links + screenshots for all txs (commitment, N payouts, refund demo via a 2-player under-quorum cancel → refund tx) → feeds G (one 15 s video scene) + a `REALMODE_PROOF.md` with hashes (committed to the repo — immutable receipts).

### D.4 RPC parameter-shape caveat (DEPLOY.md:66)
Expect real-node fussiness (`getTransactionByHash` positional-vs-named). The clients already try both; if both fail, the fix goes in `settlement/index.mjs rpc()` + `backend/app/chain.py RpcChainClient` and gets a `test_real_mode`-style unit against the real captured response shape. Budget 30 min for this — if it exceeds it, NO-GO retroactively.

**Acceptance (on GO):** ≥ 1 real inbound + ≥ 1 real outbound tx, hash-visible, in `REALMODE_PROOF.md`.

---

## 8. Track F — Disconnect/reconnect hardening, minimal (Tue, ~4 h) — closes the 6.2 deferral

**Objective:** survive a refresh / flaky phone network / tab-kill mid-LIVE-quiz with zero lost answers and visible room state. **Deliberately NOT timer-pause** (pausing on disconnect changes fairness semantics for everyone and needs product thought — deferred, §12).

Already true (from 3.4/6.x): answers stored server-side one-shot; deadline = `quiz.started_at + duration` regardless of presence; auto-`TIMED_OUT`; sessionStorage resume blob. What's missing is *server-visible presence* and *clean re-entry*.

### F.1 `last_seen_at` heartbeat
- Column shipped in E.6. Update path: `GET /api/quizzes/{id}/state?user_id=` (already polled by Lobby/Submitted/Results) → if participant JOINED/ACTIVE, stamp `last_seen_at = utcnow()`. During LIVE, `QuizPlayScreen` adds the existing usePolling (6 s, room-level state for the deadline) — verify and wire it if absent. No new endpoint, no client interval, one `UPDATE` per poll.

### F.2 Resume semantics — "first unanswered"
- On mount, `QuizPlayScreen` (real-mode path): fetch questions + own answers via `/state` (extend the response with `answeredQuestionIds: []`); the session's current index = first question **not** in that list, regardless of sessionStorage. This makes the server authoritative and sessionStorage a pure perf cache — a refresh, a different device (same user id), or a cleared tab all resume correctly.
- One answer per question is already enforced server-side, so re-answering is a no-op 409 → treated as "already locked in, advance" instead of an error toast.

### F.3 Room presence
- `GET /api/quizzes/{id}/participants` gains `lastSeenAt`; LobbyScreen (while quiz is LIVE) renders an amber **"away"** dot for ACTIVE participants with `now - lastSeenAt > 20 s`, green "present" otherwise. `ParticipantRow` already has a status-dot system to reuse.
- Creator's early-start button note: starting a quiz is still creator-only; presence info is informational only.

### F.4 "Welcome back" banner
- If the play screen re-mounted mid-quiz, show a one-time `StaleBanner`-style strip: "Reconnected — X:XX left, N questions answered." Reduced-motion safe (existing banner component).

### F.5 Tests
- Backend (`test_api.py` addition): heartbeat — `/state?user_id` bumps `last_seen_at`; `answeredQuestionIds` correct after 2 of 5 answers; re-submitting an answered question → same 409 behavior asserted.
- Mock (`flow.test.ts` addition): mid-quiz refresh resume — new client instance with only user id returns first-unanswered position (mock mirrors the `/state` field).

### F.6 Cut line
If F runs long: F.1 + F.2 are the track (presence banner cut). `disconnect_count` column exists but is **not** wired for strikes — deferred per §12; device-ID enforcement likewise.

**Acceptance:** live manual test on prod after deploy — start a quiz, force-reload mid-question ×3, lose nothing; a phone that went to background shows "away" then returns; all tests green.

---

## 9. Track G — Demo video (Wed, ~4 h: 2 h prep/assets + 1 h record + 1 h edit)

Recording is yours; everything else is ours.

### G.1 Update `DEMO_SCRIPT.md` first (the script predates AI + PDF + prod URL)
New beats (~2:45 total):
1. Hook: "What if your notes paid you for showing up?" (5 s, title card)
2. Problem: online studying = solo + no skin in the game (10 s)
3. **Create:** upload a real lecture **PDF** → **AI generates** the Qest → review/edit one question → publish with stake + start time (40 s) — *the sprint's two new features are the headline*
4. **Commit:** second browser joins, mock stake confirmed (15 s) — one-line caption: "Nimiq commitments verified on-chain in real mode; demo runs in sandbox" *(if D went GO: swap in the 15 s REALMODE_PROOF scene — explorer links)*
5. **Compete:** 3-player LIVE round, timer pressure, answers sealed (35 s)
6. **Settle:** results podium → stepper walks to SETTLED → review with explanations (30 s)
7. Close: economics card — 50/30/10, 80% back for finishing, auto-refund under quorum (15 s)
8. CTA: live URL + repo (10 s)

Recording setup block (write into the script): prod URL (not localhost), `DISPUTE_WINDOW_SECONDS=20` on a **staging copy or local instance** so the stepper walks on camera, browser window 420×900 (mobile frame), mock mode, notifications off, OS dark-mode-free, `scripts/seed.mjs` quiz pre-staged, dry run once with timestamps.

### G.2 Agent-produced assets (prep while you set up)
- [ ] Title/section caption slides + the closing **economics diagram** as HTML pages sized for capture.
- [ ] Narration script (word-for-word teleprompter file derived from G.1, 140 wpm budgeted).
- [ ] YouTube title + description (links: repo, prod URL, `REALMODE_PROOF.md` if GO, DESCRIPTION.md text) + 3 chapter stamps.
- [ ] Thumbnail: single HTML mock (podium + "Know it. Prove it." + NIM badge) you screenshot.
- [ ] Test the exact demo scenario end-to-end on prod beforehand; produce a one-page "if a take fails, retry steps" card.

### G.3 Recording/edit checklist (you)
OBS Studio (or Xbox Game Bar): 1080p, 60 fps, mic test pass. One beat per take — beats are the edit unit; never re-record the whole thing for one stumble. Export → upload → paste link into `LAUNCH.md` §1.

**Acceptance:** video linked in `LAUNCH.md`; final cut ≤ 3 min; PDF + AI scenes present; no localhost/`LK-`/jargon visible on any frame.

---

## 10. Track H — Launch & submission (Thu dry-run → Fri execution) — closes 8.4/8.5

`LAUNCH.md` is already the checklist — this track fixes its stale URLs (done in C.6/E.3) and sequences it:

### H.1 Thu: dry run
- [ ] Full `LAUNCH.md` §2 sanity against prod (health, smoke, seed, homepage, phone pass through Welcome → Commit → Lobby).
- [ ] Competition dashboard: draft submission entries (repo link ✓ public ✓ MIT ✓; DESCRIPTION.md paste; video link; prod URL) — save as draft if the dashboard allows.
- [ ] Incognito pass: every link from the dashboard opens correctly; phone (real device) walkthrough; Nimiq Pay deep-link probe either way (D evidence if GO).
- [ ] Buffer: Thu evening is for the surprises H.1 finds. **No new features after Thu noon** — bug fixes only, regression test per rule.

### H.2 Fri: submit + launch night
- [ ] Final submission on the dashboard (per BUILD_PLAN process rules, tag first: `v1.0.0`).
- [ ] Seed opening quiz **with AI-generated questions from real lecture material** (dogfooding shot for the cohort message): `node scripts/seed.mjs [PROD_URL] --min 3 --entry 25 --in-minutes 90` — but seed.mjs carries its 6 hardcoded general-knowledge questions; acceptable for launch-night volume. Optional (only if the day is calm): create one showcase Qest via the real Create screen from an actual PDF — that's the WhatsApp story anyway ("I turned today's lecture into tonight's Qest").
- [ ] WhatsApp broadcast per LAUNCH.md §4 (T-60 + T-15); second device ready for quorum top-up.
- [ ] During session: watch Vercel function logs (not Render — LAUNCH.md §5 wording fixed in E.3).
- [ ] Post: podium screenshot to cohort; log every bug same-night in ERROR.md with the regression-test rule; tick BUILD_PLAN Phase 9 boxes.

---

## 11. Schedule + gates

| Day | Tracks | End-of-day gate (must pass to move on) |
|---|---|---|
| **Sun 13** | E fully, C through C.4 | e2e smoke PASS **against prod URL**; CI green; tag v0.9.0 |
| **Mon 14** | A fully, B.1–B.2, D.1 spike | AI + fallback demo on prod; model decision logged; D spike verdict recorded |
| **Tue 15** | B finish, **D gate 12:00**, D exec or freeze, F | PDF→AI→publish works on prod; F manual refresh test passes; D status binary-locked by 12:30 |
| **Wed 16** | G, bug-fix float | Video recorded + uploaded |
| **Thu 17** | H.1 dry run, buffer | Draft submission exists, incognito + phone checks pass; **feature freeze 12:00** |
| **Fri 18** | H.2 | Submitted. Launched. Tagged v1.0.0 |

**Slip rules:** if Sun slips, C eats D's spike (D has the hard gate anyway). If Mon slips, B.2 (frontend polish strings) is the sacrificial lamb — B.1 endpoint + paste still delivers the feature. Never slip C or E — everything else tests through them.

---

## 12. Explicit non-goals (this sprint)

| Item | Why | Where it lives |
|---|---|---|
| I: wiring `quiz_settings`, `quiz_materials`, `question_versions`, `quiz_sessions`, `question_flags`, `disputes`, `payout_plans`, `payouts` to models | Forward-looking schema for post-launch features; invisible to users/judges; touching it near a deadline = pure risk | `sql/001_initial_schema.sql` keeps them as the baseline for migration work later |
| Timer pause on disconnect / 60 s window / 3-strike enforcement | Fairness semantics need design (what does "paused" mean for 29 other players?); `disconnect_count` column exists for later | post-launch |
| Device-ID (anti-cheat) enforcement logic | collected, not enforced — enforce needs policy | post-launch |
| OCR for scanned PDFs | pypdf text-layer only; scanned → friendly 422 | post-launch |
| LLM rate limiting / abuse guards / blob storage for materials | cohort-scale MVP; env key is per-deployment | post-launch if public |
| Real payments in **production** | DEPLOY.md checklist + D.3 dev verification is the honest bar; prod stays mock for launch (LAUNCH.md §2 rule) | D.3 evidence + this checklist as the runbook |
| Hosted CI runners | self-hosted works; E-013 payment path still blocked | whenever GitHub lifts it |
| File persistence / re-upload history for materials | text flows through, nothing stored | post-launch (pairs with `quiz_materials` table) |

---

## 13. Risk register

| Risk | L×I | Mitigation / owner |
|---|---|---|
| b.ai API isn't OpenAI-compatible / key friction | M×M | A.0 spike at start of Mon; A.1 keeps one swap point (`llm.py`); worst case = fallback-only (product still ships with the generator + honest README) |
| LLM output quality/latency on Vercel 10 s | M×H | A.2 timeout arithmetic (8 s cap, ≤ 2 calls, fast 503 → local fallback); model choice from A.0 bake-off |
| No public Nimiq HTTP RPC / node sync eats the week | M×H | D's Tue-12:00 hard gate; VPS option; manual-send fallback path already in UI |
| NIM acquisition impossible this week | M×M | D NO-GO branch ships the FakeChain-tested story instead |
| Vercel Python build breaks on new deps (`pypdf`, `python-multipart`) | L×M | Added in C.2 *before* first deploy, not after; smoke C.4 catches it Sun, not Thu |
| Prod DB schema drift after first deploy | M×H | E.6 schema freeze before C; append-only rule through launch |
| CI runner offline (E-018 boot problem) | M×L | runner-start snippet is step 0 of every session (process rules); local gates remain mandatory |
| Demo-day flake (Neon cold start mid-demo) | M×M | warm `GET /api/health` 5 min before recording/launch beats; DISPUTE_WINDOW demo note (G.1) |
| Cohort no-shows | M×M | auto-refund under quorum is the product's own safety net (announce, don't force — LAUNCH.md §5); second device for quorum top-up |
| Video re-record churn | M×M | G is scheduled AFTER feature freeze; beat-per-take editing |
| Disk-full CI regression (E-027 repeat) | M×M | check `C:` free space at start of every session (runner runs here) |

---

## 14. Execution protocol (per working session)

1. Read §11 for the day's gate; run that track's steps **in order**; don't interleave tracks.
2. Each track ends with: local gates (`npm run lint && npm run build && npm run test && python -m pytest backend/tests -q`) → commit + push (runner up first) → CI green → tick this file + `BUILD_PLAN.md` Phase 9 → short phase summary.
3. Every new error → `ERROR.md` (search first, log second). Any late-caught bug → regression test before fix (rule 6).
4. Prod deploys ride `main`; verify via C.4 checklist after each (health + smoke at minimum).
5. If a track hits its time-box and isn't done: apply its cut line, log what shipped, move to the gate decision — the gate protects the deadline, not the track.

---

## 15. Track-D disposition (fill at Tue 12:00 gate)

- [ ] GO (mainnet micro-proof on dev instance) — evidence: __________
- [ ] NO-GO — blocked on: __________

*After launch (Sep 19+): migration discipline for anything E.6 froze, disputes/flags feature work against the existing SQL tables, and — if D went GO — real mode in production behind the DEPLOY.md checklist with a funded escrow + uptime-monitored sidecar.*

---

## 16. Execution log

### E — done Sun (memo fix + hygiene + schema freeze)
- **E.1** — `scripts/e2e-smoke.mjs:83` now asserts `startsWith('QS-')`. Verified PASS end-to-end.
- **E.2** — `settlement/index.mjs` payout memo renamed `LK-PAYOUT` → `QS-PAYOUT` (code + comment).
- **E.3/E.4** — `LAUNCH.md` nivora/onrender URLs → `[PROD_URL]` (single Vercel origin); `BUILD_PLAN.md` render.yaml note + `LK-XXXX`/`LK-memo`/`LK-PAYOUT` bracket notes appended (historical honesty). `rg` over `frontend/ backend/ settlement/ scripts/` for `LK-` → zero hits.
- **E.6** — `Participant.last_seen_at` added to `backend/app/models.py` + mirrored in `sql/001_initial_schema.sql`; dev `qestia.db` deleted so `init_db()` recreates with the frozen schema.
- **Smoke-run gotcha (solution):** `e2e-smoke.mjs` cannot reach `SETTLED` within its 14 s poll window when `DISPUTE_WINDOW_SECONDS=300` (the VALIDATING→FINALIZED step waits the full window). Run locally with `DISPUTE_WINDOW_SECONDS=0` — matches the pytest harness (`conftest.py`) and the lifecycle completes in seconds. **Track C.4 note:** the prod smoke uses the default 300 s window, so `waitForStatus` (20 polls × 700 ms) will time out at SETTLED — either lower the deployed `DISPUTE_WINDOW_SECONDS` for the smoke or bump the poll cap before C.4.
- **Gates:** `npm run lint` ✓, `npm run build` ✓, `npm run test` (18 ✓), `python -m pytest backend/tests -q` (14 ✓). CI green pending push.

### C — Production deploy (Sun, done through C.6)
- C.2: added `pypdf>=5.0` + `python-multipart>=0.0.9` to root + `backend/requirements.txt`.
- C.4 blockers found & fixed:
  1. **Root `/health` unreachable on Vercel** — only `/api/*` is routed to the Python function, so `/health` returned the SPA fallback. Added `/api/health` alias in `backend/app/main.py` and pointed `e2e-smoke.mjs` at it (matches plan C.4 + LAUNCH.md which already referenced `/api/health`).
  2. **Schema drift → 500 on publish.** Prod Neon DB was first initialized by the *pre-E.6* deploy, so `participants.last_seen_at` (added in E.6) did not exist; `create_all` never alters existing tables. `e2e-smoke` surfaced `UndefinedColumnError: column participants.last_seen_at does not exist`. **Fix:** `ALTER TABLE participants ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;` run directly against Neon (DB persists, so no code change needed). **Lesson (E.6 risk realized):** any future column must be added to the live DB manually — `init_db()` won't. Track F's `answeredQuestionIds` etc. will need the same treatment.
- **C.4 verified:** `GET /api/health` → 200, `/api/config` → mock, deep link `/quiz/nonexistent` → 200 (SPA), and **full `e2e-smoke` PASSES against `https://qestia.vercel.app`** (lifecycle reaches SETTLED, payout conserved 150 NIM).
- C.6: prod URL pinned in `LAUNCH.md`; tag `v0.9.0`.

### A — AI question generation (Sun/Mon, done through A.6)
- **A.0 provider spike (done with real key):** b.ai is OpenAI-compatible (`POST {base}/chat/completions`). `qwen3.8-flash` returns standard `choices[].message.content` (a C2PA `_manifest` is also present — ignored). `hy3` is a *reasoning* model (thinking in `reasoning_content`, empty `content` unless `max_tokens` is large). Both produce valid JSON questions. **Decision: `qwen3.8-flash`** (plan default; standard client). `gpt-5.x` is locked (premium). `response_format: json_object` supported.
- **Latency caveat (real):** qwen3.8-flash ~9–16s/call — exceeds Vercel Hobby's 10s `maxDuration`. Default `LLM_TIMEOUT_SECONDS=8` → endpoint 503s fast → frontend falls back to local generator (by design, A.2). **For reliable prod AI gen, raise Vercel `maxDuration` (Pro = 60s) and `LLM_TIMEOUT_SECONDS` together.** Flagged to user.
- **A.1** `backend/app/llm.py`: `HttpLlmClient` (injectable `client`), `LlmError`, 2-call retry with error appended, strict output validation.
- **A.2** `POST /api/generate`: returns `{source:"ai", questions:[...]}`; 503 when disabled/failed; 400 on material <200 or >40000 chars.
- **A.4** frontend wiring in `api/types.ts`+`client.ts`+`mock.ts` + `CreateScreen` (API-first, local fallback w/ note) + `lib/generator.ts` mapper.
- **A.5** `.env.example` (root + backend) document `LLM_*`; `vercel.json` keeps `maxDuration:10`. **User action:** set real `LLM_*` in Vercel env + redeploy (consider raising `maxDuration`).
- **A.6** `backend/tests/test_generate.py` — 9 tests. Full suite: 23 passed.

### B — PDF upload (Sun/Mon, done through B.3)
- **B.1** `POST /api/materials`: `UploadFile` (multipart, `python-multipart` added in C.2), `.pdf` only → 400, >5MB → 413, `pypdf.PdfReader` extract, text capped at 40k, 422 on no-extractable-text / encrypted / corrupt. Returns `{text, pages, chars, truncated}`.
- **B.2** frontend `CreateScreen` step 1: `.pdf` routes to `api.uploadMaterial(file)`; on success text lands in the paste area + "Extracted N pages" note (amber when truncated); removed the two "PDF coming soon" strings. `api/types|client|mock` get `uploadMaterial` (mock rejects with "PDF needs the backend").
- **B.3** `backend/tests/test_materials.py` — 4 tests (success/non-pdf/oversized/scanned) using committed fixtures `backend/tests/fixtures/sample.pdf` (2pg text) + `scanned.pdf` (no text). Full backend suite: **27 passed**. Frontend lint/build/test green (18). Local note: `python-multipart` had to be `pip install`ed into the test venv (already in requirements).
- **Deploy note:** the new endpoint is server-side only; it works on prod once the deploy picks up `requirements.txt` (already has `pypdf`+`python-multipart`). No new Vercel env var needed.

### F — reconnect / resume hardening (done)
- **F.1** `GET /api/quizzes/{id}/state` now stamps `last_seen_at = utcnow()` for any JOINED/ACTIVE participant that polls. Already polled every 5s by `QuizPlayScreen`, so presence heartbeats automatically.
- **F.2** `/state` returns `answeredQuestionIds` (from `Answer` rows). `QuizPlayScreen` boot computes the first unanswered index via `lib/resume.ts::firstUnansweredIndex` and jumps there on rejoin.
- **F.3** `GET /api/quizzes/{id}/participants` returns `lastSeenAt`. `LobbyScreen` marks an ACTIVE participant "away" (amber dot + "away" label) when `now - lastSeenAt > 20s` during LIVE. `ParticipantRow` gained an `away` prop.
- **F.4** "Welcome back — we picked up where you left off." banner in `QuizPlayScreen` when a returning participant has prior answers (dismissible).
- **F.5 tests:** `backend/tests/test_heartbeat.py` (heartbeat stamp + answeredQuestionIds tracking); `frontend/src/lib/resume.test.ts` (resume index). Full suite: backend **28 passed**, frontend **22 passed**, lint + build clean.
- **F.6 cut line:** F.1 + F.2 shipped; the presence "away" dot (F.3) + welcome-back banner (F.4) included as polish.

### G — Demo video (agent assets done; recording is yours)
- **G.1** `DEMO_SCRIPT.md` refreshed: 8 beats with PDF→AI as the headline, prod URL `https://qestia.vercel.app` (no localhost), mock stakes, dispute window on staging/local.
- **G.2** Agent-produced, screenshot-ready assets in `video/`: `title-card.html`, `captions.html` (Problem/Create/Commit/Compete/Settle), `economics.html` (80% back · 50/30/10 · full refund under quorum), `thumbnail.html` (1280×720 YouTube mock), `narration.md` (word-for-word, ~140 wpm, ~2:45), `youtube.md` (title/description/chapters/tags), `README.md` index. Brand palette matches the app (paper/ink/volt oklch).
- **G.3 (yours):** record + edit per `DEMO_SCRIPT.md`; link final cut in `LAUNCH.md` §1. Acceptance: ≤3 min, PDF+AI scenes present, no localhost/`LK-`/jargon on any frame.
