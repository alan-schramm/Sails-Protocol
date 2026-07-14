/**
 * Redis — cache/pub-sub client.
 * DATABASE.md §4 lists the key patterns this backs: trade:room:<id>,
 * users:online, offers:<asset>:<side>, reputation:<userId>,
 * escrow:state:<escrowId>. None of this is protocol-mandated — it's a
 * reference-implementation performance choice.
 */
import Redis from 'ioredis'
import { config } from '../../config'

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy: (attempts: number) => Math.min(attempts * 200, 2000),
})

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message)
})

export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready') return
  await new Promise<void>((resolve, reject) => {
    redis.once('ready', () => resolve())
    redis.once('error', reject)
  })
  console.log('[Redis] Connected')
}
