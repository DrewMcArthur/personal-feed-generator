import dotenv from 'dotenv'
import FeedGenerator from './server'

const run = async () => {
  dotenv.config()
  const hostname = maybeStr(process.env.FEEDGEN_HOSTNAME) ?? 'example.com'
  const serviceDid =
    maybeStr(process.env.FEEDGEN_SERVICE_DID) ?? `did:web:${hostname}`
  const config = {
    port: maybeInt(process.env.FEEDGEN_PORT) ?? 3000,
    sqliteLocation: maybeStr(process.env.FEEDGEN_SQLITE_LOCATION) ?? ':memory:',
    subscriptionEndpoint:
      maybeStr(process.env.FEEDGEN_SUBSCRIPTION_ENDPOINT) ??
      'wss://bsky.social',
    embeddingSubscriptionEndpoint:
      maybeStr(process.env.EMBEDDING_SUBSCRIPTION_ENDPOINT) ??
      'wss://embedding-firehose.drewmca.dev',
    hostname,
    serviceDid,
    requesterDid: maybeStr(process.env.MY_DID) ?? 'did:example:alice',
    cacheTtlMin: maybeInt(process.env.CACHE_TTL_MIN) ?? 30
  }
  const server = FeedGenerator.create(config)
  await server.start()
  console.log(
    `🤖 running feed generator at http://localhost:${server.cfg.port}`
  )
}

const maybeStr = (val?: string) => {
  if (!val) return undefined
  return val
}

const maybeInt = (val?: string) => {
  if (!val) return undefined
  const int = parseInt(val, 10)
  if (isNaN(int)) return undefined
  return int
}

run()
