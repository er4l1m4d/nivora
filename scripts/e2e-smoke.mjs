// Live 3-user smoke run against a running backend (DEPLOY.md critical flows).
// Usage: node scripts/e2e-smoke.mjs [baseUrl]
const BASE = process.argv[2] ?? 'http://localhost:8000'

const api = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(body)}`)
  return body
}

const log = (...a) => console.log('  ', ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForStatus(quizId, target, maxPolls = 500) {
  for (let i = 0; i < maxPolls; i++) {
    const state = await api(`/api/quizzes/${quizId}/state`)
    if (state.status === target) return state
    await sleep(700)
  }
  throw new Error(`never reached ${target}`)
}

async function main() {
  console.log(`Lokkin e2e smoke against ${BASE}`)

  // health + config
  const health = await api('/api/health')
  if (!health.ok) throw new Error('health check failed')
  const config = await api('/api/config')
  if (!['mock', 'real'].includes(config.paymentsMode)) throw new Error('bad paymentsMode')
  log(`health ok · payments mode: ${config.paymentsMode}`)

  // 3 profiles
  const [ada, bode, chidi] = await Promise.all(
    ['Ada', 'Bode', 'Chidi'].map((n) => api('/api/users', { method: 'POST', body: JSON.stringify({ displayName: n }) })),
  )
  log('3 users created')

  // creator builds the quiz
  const { quizId } = await api('/api/quizzes', {
    method: 'POST',
    body: JSON.stringify({
      creatorId: ada.id,
      title: 'Smoke: Nervous System Sprint',
      description: 'e2e smoke quiz',
      currency: 'NIM',
      entryAmount: 50,
      durationSeconds: 120,
      startsAt: new Date(Date.now() + 60_000).toISOString(),
      minParticipants: 3,
    }),
  })
  const correctByPos = { 1: 'C', 2: 'A', 3: 'C' }
  for (let pos = 1; pos <= 3; pos++) {
    await api(`/api/quizzes/${quizId}/questions`, {
      method: 'POST',
      body: JSON.stringify({
        position: pos,
        questionText: `Q${pos}: the blank is ______?`,
        optionA: 'Alpha', optionB: 'Beta', optionC: 'Gamma', optionD: 'Delta',
        correctOption: correctByPos[pos],
        explanation: 'Smoke explanation.',
      }),
    })
  }
  await api(`/api/quizzes/${quizId}/publish`, { method: 'POST' })
  await api(`/api/quizzes/${quizId}/open`, { method: 'POST' })
  log('quiz published + open (creator auto-joined)')

  // list shows it
  const list = await api('/api/quizzes')
  const entry = list.find((q) => q.id === quizId)
  if (!entry || entry.participantCount !== 1) throw new Error('list/participantCount mismatch')
  log('public list ok, creator counted')

  // two more commit -> quorum (join now returns memo + escrow info)
  for (const u of [bode, chidi]) {
    const joined = await api(`/api/quizzes/${quizId}/join`, { method: 'POST', body: JSON.stringify({ userId: u.id }) })
    if (!joined.memoCode || !joined.memoCode.startsWith('QS-')) throw new Error('join missing memoCode')
    const status = await api(`/api/quizzes/${quizId}/commitments/${joined.participantId}`)
    if (status.status !== 'JOINED') throw new Error('mock commitment not confirmed')
  }
  log('3 commitments confirmed (mock payments)')

  // creator starts the room
  await api(`/api/quizzes/${quizId}/start`, { method: 'POST' })
  log('room LIVE')

  // play: Ada 3/3, Bode 2/3, Chidi 1/3
  const plans = [
    { user: ada, correct: 3 },
    { user: bode, correct: 2 },
    { user: chidi, correct: 1 },
  ]
  for (const plan of plans) {
    const questions = await api(`/api/quizzes/${quizId}/questions?user_id=${plan.user.id}`)
    const joinRes = await api(`/api/quizzes/${quizId}/demo-start?user_id=${plan.user.id}`, { method: 'POST' })
    for (const q of questions) {
      const pick = q.position <= plan.correct ? correctByPos[q.position] : 'B'
      await api(`/api/quizzes/${quizId}/answers`, {
        method: 'POST',
        body: JSON.stringify({
          participantId: joinRes.participantId,
          questionId: q.id,
          selectedOption: pick,
        }),
      })
    }
  }
  log('all players answered')

  // lifecycle walks to SETTLED
  const settled = await waitForStatus(quizId, 'SETTLED')
  if (!settled.deadline === null) { /* deadline only exists while LIVE */ }
  log('lifecycle reached SETTLED')

  // results: conservation
  const results = await api(`/api/quizzes/${quizId}/results`)
  const total = results.rows.reduce((s, r) => s + r.payout, 0)
  const staked = 3 * 50
  if (Math.abs(total - staked) > 0.01) throw new Error(`payout not conserved: ${total} vs ${staked}`)
  const adaRow = results.rows.find((r) => r.displayName === 'Ada')
  if (adaRow.rank !== 1) throw new Error('Ada should be rank 1')
  log(`results conserved: ${total.toFixed(2)} NIM paid of ${staked} staked; Ada #1`)

  // review + history
  const review = await api(`/api/quizzes/${quizId}/review?user_id=${bode.id}`)
  if (review.length !== 3 || review[0].correctOption !== 'C') throw new Error('review mismatch')
  const history = await api(`/api/users/${bode.id}/history`)
  if (history.length !== 1 || history[0].rank !== 2) throw new Error('history mismatch')
  log('review + history ok')

  console.log('SMOKE PASSED')
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err.message)
  process.exit(1)
})
