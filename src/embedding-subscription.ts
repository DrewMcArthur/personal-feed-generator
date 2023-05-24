import { Subscription } from '@atproto/xrpc-server'
import { Database } from './db'
import Model from './model'
import { WebSocket } from 'ws'

/// subscription to the embedding-firehose
export default class EmbeddingFirehoseSubscription {
  public sub: Subscription<EmbeddingFirehoseEvent>
  private socket: WebSocket

  constructor(
    public db: Database,
    public subscriptionUrl: string,
    public model: Model
  ) {
    this._initSocket(subscriptionUrl)
  }

  private _initSocket(subscriptionUrl: string) {
    this.socket = new WebSocket(subscriptionUrl)
    this.socket.onopen = e => console.debug('socket opened')
    this.socket.onmessage = event =>
      this.handleEvent(JSON.parse(event.data.toString()))
    this.socket.onclose = e => console.debug('socket closed')
  }

  async handleEvent(evt: EmbeddingFirehoseEvent): Promise<void> {
    const { uri, embedding, numTokens } = evt
    if (embedding === null || embedding.length !== 1536) return
    console.debug(`received valid embedding-firehose event for ${uri}`)
    const score = await this.model.score(embedding)
    console.debug(`score: ${score}`)
    await this.db
      .updateTable('post')
      .set({ embedding: JSON.stringify(embedding), score })
      .where('uri', '=', uri)
      .execute()
  }
}

type EmbeddingFirehoseEvent = {
  uri: string
  embedding: number[] | null
  numTokens: number
}
