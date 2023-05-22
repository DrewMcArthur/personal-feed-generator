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

  constructor(db, endpoint: string, userDid: string, cacheTtlMin: number = 15) {
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
      this._handleCreatedPosts(ops.posts.creates),
      this._handleDeletedRecords(ops.posts.deletes, 'post'),
      this._handleDeletedRecords(ops.likes.deletes, 'like'),
      this._cleanup(),
    ]
    await Promise.all(tasks)
  }

  async _handleCreatedPosts(creates: CreateOp<PostRecord>[]) {
    const values = await Promise.all(
      creates.map(async (post) => {
        return {
          uri: post.uri,
          cid: post.cid,
          text: post.record.text,
          replyParent: post.record?.reply?.parent.uri ?? null,
          replyRoot: post.record?.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
          // embedding: JSON.stringify(embedding),
          // score: score,
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
      // currently, saves all likes, but could filter by like author
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

  async _handleDeletedRecords(deletes: DeleteOp[], table: 'post' | 'like') {
    const deletedRecordUris = deletes.map((del) => del.uri)
    if (deletedRecordUris.length > 0) {
      await this.db
        .deleteFrom(table)
        .where('uri', 'in', deletedRecordUris)
        .execute()
    }
  }

  async _cleanup(): Promise<void> {
    const minutesSinceCacheCleared =
      new Date().getMinutes() - this.cacheClearedAt.getMinutes()
    if (minutesSinceCacheCleared < this.cacheTtlMin) return

    const tasks = [
      this._deleteOldPosts(),
      this.db.deleteFrom('like').where('trainedOn', 'is', true).execute(),
      this.model.train(),
    ]

    await Promise.all(tasks)
    this.cacheClearedAt = new Date()
  }

  async _deleteOldPosts(): Promise<void> {
    let threshold = new Date()
    const newHours = threshold.getHours() - this.cacheTtlMin * 60
    console.debug('clearing cache', newHours)
    threshold.setHours(newHours)

    // delete posts older than `cacheTtlMin` minutes old
    await this.db
      .deleteFrom('post')
      .where('indexedAt', '<', threshold.toISOString())
      .execute()
  }
}
