import { CreateOp } from './util/subscription'
import { Record as PostRecord } from './lexicon/types/app/bsky/feed/post'
import { Like as DbLike } from './db/schema'
import { Database } from './db';
import ContentEmbedder from './content-embedder';
import { Sequential, Tensor, initializers, layers, sequential, tensor, tensor2d } from '@tensorflow/tfjs-node';

/// an ML model that scores posts based on the likelihood that the user will like it.
export default class Model {
    db: Database
    nn: Sequential
    embedder: ContentEmbedder

    constructor(db) {
        this.nn = this._setupModel()

        this.embedder = new ContentEmbedder()
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
                    inputShape: [1536], units: 192, activation: 'sigmoid',
                    kernelInitializer: initializers.randomUniform(initializerConfig),
                    biasInitializer: initializers.randomUniform(initializerConfig)
                }),
                layers.dense({
                    units: 12, activation: 'sigmoid',
                    kernelInitializer: initializers.randomUniform(initializerConfig),
                    biasInitializer: initializers.randomUniform(initializerConfig)
                }),
                layers.dense({
                    units: 1, activation: 'linear',
                    kernelInitializer: initializers.randomUniform(initializerConfig),
                    biasInitializer: initializers.randomUniform(initializerConfig)
                }),
            ]

        })

        model.compile({
            loss: 'meanSquaredError',
            optimizer: 'adam',
            metrics: ['mae']
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

        const trainingInput = likes.map(async (like): Promise<number[]> => {
            const content = await this._getLikedPost(like)
            return await this.embedder.embed(content)
        })

        trainingInput.forEach(async (inpt) => {
            await this.nn.fit(tensor(await inpt), tensor([1.0]))
        })

        await this.db.updateTable('like').set({ 'trainedOn': true }).where('trainedOn', '=', false).execute()
    }

    async score(post: CreateOp<PostRecord>): Promise<number> {
        const embedding = await this.embedder.embed(post.record.text)
        const inpt = tensor2d(embedding, [1, 1536])
        const out = this.nn.predict(inpt) as Tensor
        const score = out.dataSync()[0]
        return score
    }

    async embed(post: CreateOp<PostRecord>): Promise<number[]> {
        return await this.embedder.embed(post.record.text)
    }

    private async _getLikedPost(like: DbLike): Promise<string> {
        // TODO: we should fetch the content from the uri, rather than hoping we have it cached
        const uri = like.postUri
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