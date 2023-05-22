import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import Model, { loadModel } from './model'
import { Record as PostRecord } from './lexicon/types/app/bsky/feed/post'
import { Record as LikeRecord } from './lexicon/types/app/bsky/feed/like'
import {
  CreateOp,
  DeleteOp,
  FirehoseSubscriptionBase,
  Operations,
  OperationsByType,
  getOpsByType,
} from './util/subscription'

export class PersonalizedFirehoseSubscription extends FirehoseSubscriptionBase {
  model: Model
  userDid: string
  cacheTtlMin: number
  cacheClearedAt: Date

  constructor(db, endpoint: string, userDid: string, cacheTtlMin: number = 10) {
    super(db, endpoint)
    this.model = loadModel(db)
    this.userDid = userDid
    this.cacheTtlMin = cacheTtlMin
    this.cacheClearedAt = new Date()
  }

  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops: OperationsByType = await getOpsByType(evt)
    const tasks = [
      this._handleLikes(ops.likes),
      this._handleDeletedPosts(ops.posts.deletes),
      this._handleCreatedPosts(ops.posts.creates),
      this._clearCache(),
    ]
    await Promise.all(tasks)
  }

  async _handleCreatedPosts(creates: CreateOp<PostRecord>[]) {
    const values = await Promise.all(
      creates
        .map(async (row) => ({
          post: row,
          embedding: await this.model.embed(row.record.text),
        }))
        .map(async (row) => {
          const { post, embedding } = await row
          return {
            post,
            embedding,
            score: await this.model.score(embedding),
          }
        })
        .map(async (row) => {
          let { post, score, embedding } = await row
          return {
            uri: post.uri,
            cid: post.cid,
            text: post.record.text,
            embedding: JSON.stringify(embedding),
            replyParent: post.record?.reply?.parent.uri ?? null,
            replyRoot: post.record?.reply?.root.uri ?? null,
            indexedAt: new Date().toISOString(),
            score: score,
          }
        }),
    )

    if (values.length > 0)
      await this.db
        .insertInto('post')
        .values(values)
        .onConflict((oc) => oc.doNothing())
        .execute()
  }

  async _handleLikes(likes: Operations<LikeRecord>) {
    const likesToTrainOn = likes.creates
      // .filter((like) => like.author === this.userDid)
      .map((like) => ({
        postUri: like.record.subject.uri,
        postCid: like.record.subject.cid,
        author: like.author,
        indexedAt: new Date().toISOString(),
        trainedOn: false,
      }))

    if (likesToTrainOn.length > 0) {
      console.debug('found %d likes to train on', likesToTrainOn.length)
      await this.db
        .insertInto('like')
        .values(likesToTrainOn)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }

  async _handleDeletedPosts(deletes: DeleteOp[]) {
    const postsToDelete = deletes.map((del) => del.uri)
    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
  }

  async _clearCache(): Promise<void> {
    // TODO: update logic for how often to clear the cache
    if (
      new Date().getMinutes() - this.cacheClearedAt.getMinutes() <
      this.cacheTtlMin
    )
      return

    let threshold = new Date()
    const newHours = threshold.getHours() - this.cacheTtlMin * 60
    console.debug('clearing cache', newHours)
    threshold.setHours(newHours)

    await this.db
      .deleteFrom('post')
      .where('indexedAt', '<', threshold.toISOString())
      .execute()

    await this.db.deleteFrom('like').where('trainedOn', 'is', true).execute()

    this.cacheClearedAt = new Date()
  }
}
