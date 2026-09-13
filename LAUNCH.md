# LAUNCH.md — Registration & First Users (Phase 8.5)

Launch night runbook: register on the competition dashboard, seed the first quiz, push to the cohort. Deadline: **Sep 18**.

## 1. Competition registration

- [ ] Create the competition dashboard submission:
  - [ ] Repo link: `https://github.com/er4l1m4d/qestia` (public ✓, MIT ✓)
  - [ ] Paste the 250-word description from [`DESCRIPTION.md`](DESCRIPTION.md)
  - [ ] Demo video (record per [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md)) — upload or link
  - [ ] Live demo URL (the Vercel URL from the 8.2 deploy)
- [ ] Confirm submission appears in the dashboard and links open in an incognito window

## 2. Pre-launch sanity (after the first deploy)

- [ ] `GET [PROD_URL]/api/health` → 200 (cold start ~1-3 s on Vercel Hobby is expected — warm it with a ping 5 min before the demo)
- [ ] `node scripts/e2e-smoke.mjs [PROD_URL]` — full 3-user loop against production
- [ ] Seed the opening quiz: `node scripts/seed.mjs [PROD_URL] --min 3 --entry 25 --in-minutes 90`
- [ ] Reload the Vercel homepage → seeded quiz visible as OPEN
- [ ] Join the seeded quiz yourself from a phone (real "first user" pass through Welcome → Commit → Lobby)
- [ ] `PAYMENTS_MODE=mock` for launch night unless the real-payments checklist in DEPLOY.md is fully done

## 3. Launch-night quiz plan

- [ ] Seed 1–2 more themed quizzes right before the cohort arrives (re-run `seed.mjs` with different `--in-minutes`, or create via the UI so you control titles/questions)
- [ ] Quiz timing: `--in-minutes 60–90` gives the cohort time to land; keep duration 5 min
- [ ] Entry 25 NIM (demo) — stakes big enough to care, small enough to be fun
- [ ] Have a second device/browser ready to fill quorum if the room stalls at 2 players

## 4. WhatsApp push to the university cohort

Message template (send as broadcast, not group — keep it personal):

> 🎓 **Study + win, tonight.**
> I built a quiz app called **Qestia** — it turns your notes into a live Qest where everyone puts in a stake, and the top 3 split the pot. Everyone else gets 80% back just for finishing, so it literally pays to show up.
> Opening room starts in **[time]** — 6 questions, [X] NIM to enter.
> 👉 [live demo link]
> Works in the browser, no install. If you've got 5 minutes tonight, come prove what you know.
> *(Demo mode — play money for tonight; real NIM lands once the wallet flow is verified.)*

- [ ] Send T-60 min, re-ping T-15 min
- [ ] Post the results (podium screenshot) in the cohort chat right after — social proof for round two
- [ ] Collect friction points in a note: anything that confused someone becomes a ticket

## 5. Post-launch

- [ ] Watch Render logs during the session (free plan: look for cold starts mid-session)
- [ ] If a quiz stalls under quorum: auto-refund is safe — announce it, don't force it
- [ ] Log any bug the same night in ERROR.md while the repro is fresh
- [ ] Tag the launch commit: `git tag v1.0.0 && git push origin v1.0.0`
