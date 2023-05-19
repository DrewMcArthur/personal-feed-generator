import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import Model, { loadModel } from './model';
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

export class PersonalizedFirehoseSubscription extends FirehoseSubscriptionBase {
  model: Model
  userDid: string
  cacheTtlMin: number
  cacheClearedAt: Date;

  constructor(db, endpoint: string, userDid: string, cacheTtlMin: number = 10) {
    super(db, endpoint)
    this.model = loadModel(db)
    this.userDid = userDid
    this.cacheTtlMin = cacheTtlMin
    this.cacheClearedAt = new Date();
  }

  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    const likesToTrainOn = ops.likes.creates.filter((like) => like.author === this.userDid)
    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .map((create) => {
        return {
          post: create,
          score: this.model.score(create)
        }
      })
      .filter((create) => {
        // only index 10% of posts randomly for now
        return create.score > 0.8
      })
      .map((create) => {
        return {
          uri: create.post.uri,
          cid: create.post.cid,
          replyParent: create.post.record?.reply?.parent.uri ?? null,
          replyRoot: create.post.record?.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
          score: create.score
        }
      })

    if (likesToTrainOn.length > 0) {
      await this.db
        .insertInto('like')
        .values(likesToTrainOn.map(like => ({
          ...like,
          indexedAt: new Date().toISOString(),
          trainedOn: false
        })))
        .onConflict((oc) => oc.doNothing())
        .execute()
    }

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }

    if (postsToCreate.length > 0) {
      console.log("indexing post with score: ", postsToCreate.map((p) => p.score))
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }

    if (new Date().getMinutes() - this.cacheClearedAt.getMinutes() > this.cacheTtlMin)
      this._clearCache();
  }

  _clearCache()
  {
    let threshold = new Date()
    const newMinutes = threshold.getMinutes() - this.cacheTtlMin
    console.log("clearing cache", newMinutes)
    threshold.setMinutes(newMinutes)

    this.db.deleteFrom('post')
        .where('indexedAt', '<', threshold.toISOString())
        .execute()
    this.db.deleteFrom('like')
        .where('indexedAt', '<', threshold.toISOString())
        .execute()

    this.cacheClearedAt = new Date();
  }
}
