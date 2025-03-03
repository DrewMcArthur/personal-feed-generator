import http from 'http'
import events from 'events'
import express from 'express'
import { DidResolver, MemoryCache } from '@atproto/did-resolver'
import { createServer } from './lexicon'
import feedGeneration from './methods/feed-generation'
import describeGenerator from './methods/describe-generator'
import { createDb, Database, migrateToLatest } from './db'
import { PersonalizedFirehoseSubscription } from './subscription'
import { AppContext, Config } from './config'
import wellKnown from './well-known'
import EmbeddingFirehoseSubscription from './embedding-subscription'
import Model from './model'

export class FeedGenerator {
  public app: express.Application
  public server?: http.Server
  public db: Database
  public firehose: PersonalizedFirehoseSubscription
  public embeddingFirehose: EmbeddingFirehoseSubscription
  public cfg: Config

  constructor(
    app: express.Application,
    db: Database,
    firehose: PersonalizedFirehoseSubscription,
    embeddingFirehose: EmbeddingFirehoseSubscription,
    cfg: Config
  ) {
    this.app = app
    this.db = db
    this.firehose = firehose
    this.embeddingFirehose = embeddingFirehose
    this.cfg = cfg
  }

  static create(cfg: Config) {
    const app = express()
    const db = createDb(cfg.sqliteLocation)
    const model = new Model(db)
    const firehose = new PersonalizedFirehoseSubscription(
      db,
      cfg.subscriptionEndpoint,
      model,
      cfg.cacheTtlMin
    ) // TODO: will need to move to a CONST allowed_DIDs or something

    const embeddingFirehose = new EmbeddingFirehoseSubscription(
      db,
      cfg.embeddingSubscriptionEndpoint,
      model
    )

    const didCache = new MemoryCache()
    const didResolver = new DidResolver(
      { plcUrl: 'https://plc.directory' },
      didCache
    )

    const server = createServer({
      validateResponse: true,
      payload: {
        jsonLimit: 100 * 1024, // 100kb
        textLimit: 100 * 1024, // 100kb
        blobLimit: 5 * 1024 * 1024 // 5mb
      }
    })
    const ctx: AppContext = {
      db,
      didResolver,
      cfg
    }
    feedGeneration(server, ctx)
    describeGenerator(server, ctx)
    app.use(server.xrpc.router)
    app.use(wellKnown(ctx))

    return new FeedGenerator(app, db, firehose, embeddingFirehose, cfg)
  }

  async start(): Promise<http.Server> {
    await migrateToLatest(this.db)
    this.firehose.run()
    this.server = this.app.listen(this.cfg.port)
    await events.once(this.server, 'listening')
    return this.server
  }
}

export default FeedGenerator
