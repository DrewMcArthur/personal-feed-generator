import { CreateOp } from './util/subscription'
import { Record as PostRecord } from './lexicon/types/app/bsky/feed/post'
import { Like as DbLike } from './db/schema'
import { Database } from './db'
import {
  Sequential,
  Tensor,
  initializers,
  layers,
  sequential,
  tensor,
  tensor2d,
} from '@tensorflow/tfjs-node'

/// an ML model that scores posts based on the likelihood that the user will like it.
export default class Model {
  db: Database
  nn: Sequential

  constructor(db) {
    this.nn = this._setupModel()
    this.db = db
  }

  _setupModel(): Sequential {
    const initializerConfig = {
      minval: -0.05,
      maxval: 0.05,
    }

    let model = sequential({
      layers: [
        layers.dense({
          inputShape: [1536],
          units: 192,
          activation: 'sigmoid',
          kernelInitializer: initializers.randomUniform(initializerConfig),
          biasInitializer: initializers.randomUniform(initializerConfig),
        }),
        layers.dense({
          units: 12,
          activation: 'sigmoid',
          kernelInitializer: initializers.randomUniform(initializerConfig),
          biasInitializer: initializers.randomUniform(initializerConfig),
        }),
        layers.dense({
          units: 1,
          activation: 'linear',
          kernelInitializer: initializers.randomUniform(initializerConfig),
          biasInitializer: initializers.randomUniform(initializerConfig),
        }),
      ],
    })

    model.compile({
      loss: 'meanSquaredError',
      optimizer: 'adam',
      metrics: ['mae'],
    })

    return model
  }

  async train() {
    console.debug('Training model...')

    const likes: DbLike[] = await this.db
      .selectFrom('like')
      .selectAll()
      .where('trainedOn', '=', false)
      .execute()

    const likedPostUris = likes.map((like) => like.postUri)
    const likedPostEmbeddings = await this._getLikedPostsEmbeddings(
      likedPostUris,
    )
    const trainingLosses = await Promise.all(
      likedPostEmbeddings.map((e) => {
        return this.nn.trainOnBatch(tensor(e), tensor([1.0]))
      }),
    )

    await this.db
      .updateTable('like')
      .set({ trainedOn: true })
      .where(
        'postUri',
        'in',
        likedPostEmbeddings.map((e) => e.uri),
      )
      .where('trainedOn', '=', false)
      .execute()

    console.log(`Model trained on ${likedPostEmbeddings.length} liked posts.`)
    return trainingLosses
  }

  async score(embedding: number[]): Promise<number> {
    const inpt = tensor2d(embedding, [1, 1536])
    const out = this.nn.predict(inpt) as Tensor
    const score = out.dataSync()[0]
    return score
  }

  private async _getLikedPostsEmbeddings(
    postUris: string[],
  ): Promise<EmbeddedPostUri[]> {
    const res = await this.db
      .selectFrom('post')
      .select(['uri', 'embedding'])
      .where('uri', 'in', postUris)
      .execute()

    if (res.length < 1) {
      throw new Error(
        `Expected at least 1 post but got ${
          res.length
        } for uris ${postUris.join(', ')}`,
      )
    }

    return res
      .map((r) => ({ uri: r.uri, embedding: r.embedding }))
      .filter((p) => p.embedding !== null)
      .map(
        (p) =>
          ({
            uri: p.uri,
            embedding: JSON.parse(p.embedding as string) as number[],
          } as EmbeddedPostUri),
      )
  }
}

export type NewScoredPost = {
  post: CreateOp<PostRecord>
  score: number
  embedding: number[]
}

export type EmbeddedPost = {
  post: CreateOp<PostRecord>
  embedding: number[]
}

type EmbeddedPostUri = {
  uri: string
  embedding: number[]
}
