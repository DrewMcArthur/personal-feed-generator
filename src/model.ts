import { CreateOp } from './util/subscription'
import { Record as PostRecord } from './lexicon/types/app/bsky/feed/post'
import { Like as DbLike } from './db/schema'
import { Database } from './db';
import { NeuralNetwork } from 'brain.js';
import ContentEmbedder from './content-embedder';

/// an ML model that scores posts based on the likelihood that the user will like it.
export default class Model {
    db: Database
    nn: NeuralNetwork<number[], number[]>
    embedder: ContentEmbedder

    constructor(db) {
        this.nn = new NeuralNetwork({
            activation: 'sigmoid',
            hiddenLayers: [192, 12],
        })
        this.embedder = new ContentEmbedder()
        this.db = db
    }

    async train() {
        const likes: DbLike[] = await this.db
            .selectFrom('like')
            .selectAll()
            .where('trainedOn', '=', false)
            .execute()

        const trainingData = await Promise.all(
            likes.map(async (like): Promise<TrainData> => {
                const content = await this._getLikedPost(like)

                return {
                    input: await this.embedder.embed(content),
                    output: [1.0],
                }
            })
        )

        this.nn.train(trainingData)

        await this.db.updateTable('like').set({ 'trainedOn': true }).where('trainedOn', '=', false).execute()
    }

    async score(post: CreateOp<PostRecord>): Promise<number> {
        return this.nn.run(await this.embedder.embed(post.record.text))[0];
    }

    async _getLikedPost(like: DbLike): Promise<string> {
        // TODO: we should fetch the content from the uri, rather than hoping we have it cached
        const uri = like.record.subject.uri
        const res = await this.db
            .selectFrom('post')
            .select('text')
            .where('uri', '=', uri)
            .execute()
        if (res.length !== 1) {
            throw new Error(`Expected 1 post but got ${res.length} for uri ${uri}`)
        }
        const text = res.map(r => r.text).at(0)
        if (text === undefined) {
            throw new Error(`Got undefined text for uri ${uri}`)
        }
        return text
    }
}

export function loadModel(db: Database): Model {
    return new Model(db)
}

export type NewScoredPost = {
    post: CreateOp<PostRecord>
    score: number
}

type TrainData = {
    input: number[],
    output: number[],
}