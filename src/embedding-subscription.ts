import { Subscription } from '@atproto/xrpc-server'
import { Database } from './db'
import { ids, lexicons } from './lexicon/lexicons'
import Model from './model'

/// subscription to the embedding-firehose
export default class EmbeddingFirehoseSubscription {
  public sub: Subscription<EmbeddingFirehoseEvent>

  constructor(
    public db: Database,
    public service: string,
    public model: Model,
  ) {
    this.sub = new Subscription({
      service: service,
      method: ids.ComAtprotoSyncSubscribeRepos,
      validate: (value: unknown) => {
        try {
          return lexicons.assertValidXrpcMessage<EmbeddingFirehoseEvent>(
            ids.ComAtprotoSyncSubscribeRepos,
            value,
          )
        } catch (err) {
          console.error('repo subscription skipped invalid message', err)
        }
      },
    })
  }

  async run() {
    for await (const evt of this.sub) {
      try {
        await this.handleEvent(evt)
      } catch (err) {
        console.error('repo subscription could not handle message', err)
      }
    }
  }

  async handleEvent(evt: EmbeddingFirehoseEvent): Promise<void> {
    const { uri, embedding } = evt
    console.log(`received embedding-firehose event for ${uri}`)

    const score = await this.model.score(embedding)
    await this.db
      .updateTable('post')
      .set({ embedding: JSON.stringify(embedding), score })
      .where('uri', '=', uri)
      .execute()
  }
}

type EmbeddingFirehoseEvent = {
  uri: string
  embedding: number[]
}
