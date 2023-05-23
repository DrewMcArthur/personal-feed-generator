import {
  OutputSchema as RepoEvent,
  isCommit
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import Model from './model'
import { Record as PostRecord } from './lexicon/types/app/bsky/feed/post'
import { Record as LikeRecord } from './lexicon/types/app/bsky/feed/like'
import {
  CreateOp,
  DeleteOp,
  FirehoseSubscriptionBase,
  Operations,
  OperationsByType,
  getOpsByType
} from './util/subscription'
import { uri } from './algos/whats-alf'

export class PersonalizedFirehoseSubscription extends FirehoseSubscriptionBase {
  model: Model
  userDid: string
  cacheTtlMin: number
  cacheClearedAt: Date

  constructor(db, endpoint: string, model: Model, cacheTtlMin: number = 15) {
    super(db, endpoint)
    this.model = model
    this.cacheTtlMin = cacheTtlMin
    this.cacheClearedAt = new Date()
  }

  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops: OperationsByType = await getOpsByType(evt)

    await this._handleCreatedPosts(ops.posts.creates)
    await this._handleLikes(ops.likes)
    await Promise.all([
      this._handleDeletedRecords(ops.posts.deletes, 'post'),
      this._handleDeletedRecords(ops.likes.deletes, 'like'),
      this._cleanup()
    ])
  }

  async _handleCreatedPosts(creates: CreateOp<PostRecord>[]) {
    const values = creates.map(post => {
      return {
        uri: post.uri,
        cid: post.cid,
        text: post.record.text,
        replyParent: post.record?.reply?.parent.uri ?? null,
        replyRoot: post.record?.reply?.root.uri ?? null,
        indexedAt: new Date().toISOString()
        // embedding: JSON.stringify(embedding),
        // score: score,
      }
    })

    if (values.length > 0)
      await new Promise((resolve, reject) =>
        this.db
          .insertInto('post')
          .values(values)
          .onConflict(oc => oc.doNothing())
          .execute()
          .then(resolve)
          .catch(e =>
            reject(new Error(`error inserting ${values.length} posts`, e))
          )
      )
  }

  async _handleLikes(likes: Operations<LikeRecord>) {
    const newLikes = likes.creates
      // currently, saves all likes, but could filter by like author
      // .filter((like) => like.author === this.userDid)
      .map(like => ({
        uri: like.uri,
        cid: like.cid,
        postUri: like.record.subject.uri,
        postCid: like.record.subject.cid,
        author: like.author,
        indexedAt: new Date().toISOString(),
        trainedOn: 0
      }))

    const existingPostUris: string[] = await new Promise((resolve, reject) =>
      this.db
        .selectFrom('post')
        .select('uri')
        .where(
          'uri',
          'in',
          newLikes.map(l => l.postUri)
        )
        .where(
          'cid',
          'in',
          newLikes.map(l => l.postCid)
        )
        .execute()
        .then(rows => resolve(rows.map(row => row.uri) as string[]))
        .catch(e => reject(new Error(`error selecting existing posts`, e)))
    )

    const likesToTrainOn = newLikes.filter(like =>
      existingPostUris.includes(like.postUri)
    )

    if (likesToTrainOn.length > 0) {
      await new Promise((resolve, reject) =>
        this.db
          .insertInto('like')
          .values(likesToTrainOn)
          .onConflict(oc => oc.doNothing())
          .execute()
          .then(resolve)
          .catch(e =>
            reject(
              new Error(
                `error inserting ${
                  likesToTrainOn.length
                } likes (${JSON.stringify(likesToTrainOn)}): ${e}`
              )
            )
          )
      )
    }
  }

  async _handleDeletedRecords(deletes: DeleteOp[], table: 'post' | 'like') {
    const existingRecords = await new Promise<string[]>((resolve, reject) =>
      this.db
        .selectFrom(table)
        .select('uri')
        .where(
          'uri',
          'in',
          deletes.map(del => del.uri)
        )
        .execute()
        .then(rows => resolve(rows.map(row => row.uri) as string[]))
        .catch(e => reject(new Error(`error selecting existing records`, e)))
    )

    const deletedRecordUris = deletes
      .map(del => del.uri)
      .filter(uri => existingRecords.includes(uri))

    if (deletedRecordUris.length > 0) {
      await new Promise((resolve, reject) =>
        this.db
          .deleteFrom(table)
          .where('uri', 'in', deletedRecordUris)
          .execute()
          .then(resolve)
          .catch(e =>
            reject(
              new Error(
                `_handleDeletedRecords Error: deleting ${deletedRecordUris.length} ${table} records (uri=${deletedRecordUris}): ${e}`
              )
            )
          )
      )
    }
  }

  async _cleanup(): Promise<void> {
    const minutesSinceCacheCleared =
      new Date().getMinutes() - this.cacheClearedAt.getMinutes()
    if (minutesSinceCacheCleared < this.cacheTtlMin) return
    console.log('running cleanup, clearing cache and training model')

    const tasks = [
      this._deleteOldPosts(),
      this._deleteTrainedLikes(),
      this.model.train()
    ]

    await Promise.all(tasks)
    this.cacheClearedAt = new Date()
  }

  async _deleteOldPosts(): Promise<void> {
    let threshold = new Date()
    const newHours = threshold.getHours() - this.cacheTtlMin / 60
    console.debug('clearing cache', newHours)
    threshold.setHours(newHours)

    // delete posts older than `cacheTtlMin` minutes old
    await new Promise((resolve, reject) =>
      this.db
        .deleteFrom('post')
        .where('indexedAt', '<', threshold.toISOString())
        .execute()
        .then(resolve)
        .catch(
          e => new Error(`_deleteOldPosts: error deleting old posts: ${e}`)
        )
    )
  }

  async _deleteTrainedLikes(): Promise<void> {
    await new Promise((resolve, reject) =>
      this.db
        .deleteFrom('like')
        .where('trainedOn', '>', 0)
        .execute()
        .then(resolve)
        .catch(e =>
          reject(
            new Error(`_deleteTrainedLikes: error deleting trained likes: ${e}`)
          )
        )
    )
  }
}
