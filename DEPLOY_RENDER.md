# Deploying the Qestia backend on Render (free)

**Why:** Vercel Hobby caps serverless functions at 10s. The AI question
generation (`POST /api/generate` → b.ai) routinely takes ~12s, so it can't
finish on Vercel. Render's free web service is a long-running process with **no
10s limit**, so AI generation works there. The Vite SPA stays free on Vercel.

**Cost:** $0. Same Neon Postgres DB as prod (free tier).

---

## 1. Create the Render service
1. Sign in to https://render.com → **New** → **Blueprint**.
2. Connect the `er4l1m4d/qestia` GitHub repo.
3. Render detects `render.yaml` and shows the `qestia-backend` web service.
4. Click **Apply** / **Deploy**.

## 2. Fill the secret env vars (first deploy pauses for these)
When prompted (or under the service → **Environment**), set:
- `DATABASE_URL` — your **Neon pooled** connection string (same one Vercel prod uses).
  Use the `pooler` (port 6543) URL. `db.py` rewrites `postgresql://` →
  `postgresql+asyncpg://` and strips `?sslmode=`.
- `LLM_API_KEY` — your b.ai key. **Without this, AI gen stays disabled** and the
  app falls back to the local generator (same as now).

Non-secrets are already set in `render.yaml`: `PAYMENTS_MODE=mock`,
`DISPUTE_WINDOW_SECONDS=300`, `CORS_ORIGINS` (Vercel + Render), `LLM_API_BASE`,
`LLM_MODEL=qwen3.8-flash`, `LLM_TIMEOUT_SECONDS=60`.

> Optional, only if you flip `PAYMENTS_MODE=real`: `SETTLEMENT_TOKEN`,
> `ESCROW_ADDRESS` (and update `CORS_ORIGINS` if the SPA URL differs).

## 3. Point the SPA at Render
1. In the Vercel dashboard → `qestia` project → **Settings → Environment Variables**.
2. Set `VITE_API_URL` = `https://qestia-backend.onrender.com`
   (the exact URL appears under Render service → **URL** after deploy).
3. **Redeploy** the Vercel project so `VITE_API_URL` is baked into the build.

The frontend now calls Render directly; the old Vercel `/api` function remains
as an unused fallback.

## 4. Verify
- Render: open `https://qestia-backend.onrender.com/api/health` → `{"status":"ok",...}`
  (first hit after idle may take ~30s — free tier spins down after 15 min).
- Vercel prod (`https://qestia.vercel.app`): create a Qest, upload a PDF,
  **Generate questions** → should now return AI-curated questions (no 503/timeout).
- `node scripts/e2e-smoke.mjs https://qestia.vercel.app` for the full loop.

## Notes / gotchas
- **Cold starts:** free web services sleep after 15 min; the first request is
  slow. Warm it with a health ping before a demo.
- **Shared DB:** both the (dormant) Vercel function and Render talk to the same
  Neon DB — fine, just don't run two settlement sidecars.
- If Neon rejects the connection (SSL), add `?sslmode=require` won't help
  asyncpg; instead the pooled `6543` URL is the supported path. If you still see
  SSL errors, open an issue — `db.py` may need `connect_args={"ssl": True}`.
