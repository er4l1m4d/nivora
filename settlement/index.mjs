// Lokkin settlement sidecar.
//
// Polls the backend for FINALIZED quizzes, pays every payout from the escrow
// wallet on Nimiq (feeless basic transactions with an "QS-PAYOUT" memo),
// then reports the transaction hashes back so the quiz flips to SETTLED.
//
// Environment:
//   API_URL             backend base url        (default http://localhost:8000)
//   SETTLEMENT_TOKEN    shared secret           (default dev-settlement-token)
//   ESCROW_PRIVATE_KEY  hex private key         (required unless DRY_RUN)
//   NIMIQ_RPC_URL       Nimiq JSON-RPC endpoint (required unless DRY_RUN)
//   NIMIQ_NETWORK_ID    network id              (default 1 = main)
//   POLL_MS             queue poll interval     (default 15000)
//   DRY_RUN             true = no broadcast, fake hashes (default false)

import { Address, KeyPair, PrivateKey, TransactionBuilder } from '@nimiq/core'

const API_URL = process.env.API_URL ?? 'http://localhost:8000'
const TOKEN = process.env.SETTLEMENT_TOKEN ?? 'dev-settlement-token'
const RPC_URL = process.env.NIMIQ_RPC_URL ?? null
const NETWORK_ID = Number(process.env.NIMIQ_NETWORK_ID ?? 1)
const POLL_MS = Number(process.env.POLL_MS ?? 15_000)
const DRY_RUN = process.env.DRY_RUN === 'true'
const LUNAS_PER_NIM = 100_000
const PAYOUT_MEMO = new TextEncoder().encode('QS-PAYOUT')

const log = (...a) => console.log(new Date().toISOString(), ...a)

let escrow = null
if (!DRY_RUN) {
  const keyHex = process.env.ESCROW_PRIVATE_KEY
  if (!keyHex) {
    console.error('ESCROW_PRIVATE_KEY is required (run `npm run new-key`) or set DRY_RUN=true')
    process.exit(1)
  }
  if (!RPC_URL) {
    console.error('NIMIQ_RPC_URL is required (or set DRY_RUN=true)')
    process.exit(1)
  }
  const kp = KeyPair.derive(PrivateKey.fromHex(keyHex))
  escrow = { keyPair: kp, address: kp.toAddress() }
  log(`escrow ${escrow.address.toUserFriendlyAddress()} · rpc ${RPC_URL} · network ${NETWORK_ID}`)
} else {
  log('DRY_RUN mode — no chain access, hashes are simulated')
}

async function api(path, init) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', 'x-settlement-token': TOKEN },
    ...init,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(body)}`)
  return body
}

async function rpc(method, params) {
  // Nimiq nodes accept positional or named params depending on version — try both.
  const attempts = Array.isArray(params) ? [params, { ...params[0] }] : [params]
  for (const p of attempts) {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: p }),
    })
    const data = await res.json().catch(() => null)
    if (data && data.result !== undefined) return data.result
    if (data && data.error && String(data.error.message || '').toLowerCase().includes('not found')) return null
  }
  return null
}

async function headHeight() {
  const block = (await rpc('getBlockByNumber', ['latest'])) ?? (await rpc('getLatestBlock', []))
  if (!block) throw new Error('could not fetch head height')
  return typeof block === 'number' ? block : block.number ?? block.height
}

async function broadcast(payout) {
  if (DRY_RUN) {
    const fake = `dryrun${payout.participantId.replaceAll('-', '')}`.slice(0, 64)
    log(`  [dry] ${payout.displayName} -> ${payout.walletAddress} ${payout.amountNim} NIM`)
    return fake
  }
  const recipient = Address.fromUserFriendlyAddress(payout.walletAddress)
  const height = await headHeight()
  const tx = TransactionBuilder.newBasicWithData(
    escrow.address,
    recipient,
    PAYOUT_MEMO,
    BigInt(payout.amountLuna),
    null, // fee: basic transfers are feeless
    height,
    NETWORK_ID,
  )
  escrow.keyPair.signTransaction(tx)
  const serialized = tx.toHex()
  const hash = tx.hash()
  await rpc('sendRawTransaction', [serialized])
  log(`  sent ${payout.amountNim} NIM -> ${payout.walletAddress} (tx ${hash.slice(0, 12)}…)`)
  return hash
}

async function settleQuiz(quiz) {
  log(`settling "${quiz.title}" (${quiz.payouts.length} payouts, pool ${quiz.prizePool} NIM)`)
  const sent = []
  for (const payout of quiz.payouts) {
    if (!payout.walletAddress) {
      log(`  SKIP ${payout.displayName}: no wallet linked — payout held in escrow`)
      continue
    }
    if (payout.amountLuna <= 0) continue
    const txHash = await broadcast(payout)
    sent.push({ participantId: payout.participantId, txHash })
  }
  const result = await api('/api/settlement/complete', {
    method: 'POST',
    body: JSON.stringify({ quizId: quiz.quizId, payouts: sent }),
  })
  log(`  quiz ${result.status} — ${result.recorded} payout transactions recorded`)
}

async function tick() {
  const queue = await api('/api/settlement/queue')
  if (queue.paymentsMode !== 'real') return // mock mode settles itself
  if (queue.escrowAddress && escrow && queue.escrowAddress.replace(/ /g, '') !== escrow.address.toUserFriendlyAddress().replace(/ /g, '')) {
    log('WARNING: backend ESCROW_ADDRESS does not match this sidecar wallet!')
  }
  for (const quiz of queue.quizzes) {
    await settleQuiz(quiz)
  }
}

log(`Lokkin settlement sidecar — backend ${API_URL}`)
async function main() {
  for (;;) {
    try {
      await tick()
    } catch (err) {
      log('error:', err.message)
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}
main()
