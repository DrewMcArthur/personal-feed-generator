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
  tensor2d
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
      maxval: 0.05
    }

    let model = sequential({
      layers: [
        layers.dense({
          inputShape: [1536],
          units: 192,
          activation: 'sigmoid',
          kernelInitializer: initializers.randomUniform(initializerConfig),
          biasInitializer: initializers.randomUniform(initializerConfig)
        }),
        layers.dense({
          units: 12,
          activation: 'sigmoid',
          kernelInitializer: initializers.randomUniform(initializerConfig),
          biasInitializer: initializers.randomUniform(initializerConfig)
        }),
        layers.dense({
          units: 1,
          activation: 'linear',
          kernelInitializer: initializers.randomUniform(initializerConfig),
          biasInitializer: initializers.randomUniform(initializerConfig)
        })
      ]
    })

    model.compile({
      loss: 'meanSquaredError',
      optimizer: 'adam',
      metrics: ['mae']
    })

    return model
  }

  async score(embedding: number[]): Promise<number> {
    const inpt = tensor2d(embedding, [1, 1536])
    const out = this.nn.predict(inpt) as Tensor
    const score = out.dataSync()[0]
    return score
  }

  async train() {
    console.debug('Training model...')

    const likes: DbLike[] = await this.db
      .selectFrom('like')
      .selectAll()
      .where('trainedOn', '=', 0)
      .execute()

    const likedPostUris = likes.map(like => like.postUri)
    const likedPostEmbeddings = await this._getLikedPostsEmbeddings(
      likedPostUris
    )
    if (likedPostEmbeddings.length < 1) return

    const trainingLosses = await Promise.all(
      likedPostEmbeddings.map(e => {
        return this.nn.trainOnBatch(tensor(e), tensor([1.0]))
      })
    )

    // TODO: save nn to disk

    await this.db
      .updateTable('like')
      .set({ trainedOn: 1 })
      .where(
        'postUri',
        'in',
        likedPostEmbeddings.map(e => e.uri)
      )
      .where('trainedOn', '=', 0)
      .execute()

    console.log(`Model trained on ${likedPostEmbeddings.length} liked posts.`)
    return trainingLosses
  }

  private async _getLikedPostsEmbeddings(
    postUris: string[]
  ): Promise<EmbeddedPostUri[]> {
    return await new Promise((resolve, reject) =>
      this.db
        .selectFrom('post')
        .select(['uri', 'embedding'])
        .where('uri', 'in', postUris)
        .where('embedding', '!=', null)
        .execute()
        .then(res =>
          resolve(
            res
              .filter(p => p.embedding !== null)
              .map(
                p =>
                  ({
                    uri: p.uri,
                    embedding: JSON.parse(p.embedding as string) as number[]
                  } as EmbeddedPostUri)
              )
          )
        )
        .catch(e => reject(new Error(`_getLikedPostsEmbeddings: ${e}`)))
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
