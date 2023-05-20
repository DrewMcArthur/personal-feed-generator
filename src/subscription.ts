import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import Model, { NewScoredPost, loadModel } from './model';
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
    const postsToCreate = await Promise.all(
      ops.posts.creates
        .map(async (create) => {
          return {
            post: create,
            score: await this.model.score(create)
          }
        })
        .filter(async (create) => {
          // only index top 20% of posts randomly for now
          let { score } = await create
          return score > 0.5
        })
    )

    if (likesToTrainOn.length > 0) {
      console.debug('found %d likes to train on', likesToTrainOn.length)
      await this.db
        .insertInto('like')
        .values(likesToTrainOn.map(like => ({
          postUri: like.record.subject.uri,
          postCid: like.record.subject.cid,
          author: like.author,
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
      const values = await Promise.all(
        postsToCreate.map(async (create) => {
          let { post, score } = await create
          return {
            uri: post.uri,
            cid: post.cid,
            text: post.record.text,
            embedding: JSON.stringify({ embeddings: await this.model.embed(post) }),
            replyParent: post.record?.reply?.parent.uri ?? null,
            replyRoot: post.record?.reply?.root.uri ?? null,
            indexedAt: new Date().toISOString(),
            score: score
          }
        })
      )

      await this.db
        .insertInto('post')
        .values(values)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }

    if (new Date().getMinutes() - this.cacheClearedAt.getMinutes() > this.cacheTtlMin)
      this._clearCache();
  }

  _clearCache() {
    let threshold = new Date()
    const newMinutes = threshold.getMinutes() - this.cacheTtlMin
    console.debug("clearing cache", newMinutes)
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
