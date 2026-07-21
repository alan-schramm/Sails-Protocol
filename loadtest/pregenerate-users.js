/**
 * Pre-generates a pool of real, authenticated sessions for chat-ws.yml.
 *
 * Found while wiring chat-ws.yml: Artillery's ws engine
 * (@artilleryio/int-core/lib/engine_ws.js, getWsInstance) only reads
 * `connect` off scenarioSpec[0] — the FIRST flow step, unconditionally —
 * so a `function:` auth step before `connect` in the flow is silently
 * ignored and the connection falls back to the bare `config.target`
 * (observed as the server logging "no websocket handler" for path "/").
 * Pre-authenticating a pool up front and picking one per VU inside
 * `connect.function` (which IS honored — see that file's line 255-267)
 * works around it and is also a more realistic load-test shape: real
 * users don't re-run the full challenge-response handshake on every
 * WebSocket reconnect.
 *
 * Run: node loadtest/pregenerate-users.js [count]
 */
const fs = require('fs')
const path = require('path')
const nacl = require('tweetnacl')

const TARGET = 'http://localhost:3000'
const COUNT = parseInt(process.argv[2] || '50', 10)

function toHex(bytes) {
  return Buffer.from(bytes).toString('hex')
}

async function createAuthenticatedUser(i) {
  const keyPair = nacl.sign.keyPair()
  const publicKey = toHex(keyPair.publicKey)

  await fetch(`${TARGET}/v1/identity/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey, displayName: `loadtest-ws-${i}` }),
  })

  const challengeRes = await fetch(`${TARGET}/v1/identity/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey }),
  })
  const { data: challengeData } = await challengeRes.json()

  const signature = nacl.sign.detached(Buffer.from(challengeData.challenge, 'utf-8'), keyPair.secretKey)

  const authRes = await fetch(`${TARGET}/v1/identity/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey, signature: toHex(signature) }),
  })
  const { data: authData } = await authRes.json()

  return { publicKey, sessionToken: authData.sessionToken }
}

async function main() {
  const users = []
  for (let i = 0; i < COUNT; i++) {
    users.push(await createAuthenticatedUser(i))
  }
  const outPath = path.join(__dirname, 'users.json')
  fs.writeFileSync(outPath, JSON.stringify(users, null, 2))
  console.log(`Wrote ${users.length} authenticated sessions to ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
