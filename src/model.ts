/// an ML model that scores posts based on the likelihood that the user will like it.
import { CreateOp } from './util/subscription'
import { Record as PostRecord } from './lexicon/types/app/bsky/feed/post'
import { randomInt } from 'crypto';
import { Database } from './db';

export default class Model {
    db: Database
    constructor(db) { 
        this.db = db
    }

    async train() {
        const likes = await this.db.selectFrom('like').selectAll().where('trainedOn', '=', false).execute()
        const trainingData = likes.map(like => ({
            input: this._generateInput(like),
            output: 1.0
        }))
        
        await this.db.updateTable('like').set({'trainedOn': true}).where('trainedOn', '=', false).execute()
    }

    score(post: CreateOp<PostRecord>): number {
        return randomInt(10000) / 10000;
    }

    _generateInput(like): number[] {
        return [
            ...this._generateContentEmbeddings(like.post),
        ]
    }

    _generateContentEmbeddings(post): number[] {
        /// should return an array of embeddings for a given post's content
        return []
    }
}

export function loadModel(db): Model {
    return new Model(db)
}

export type NewScoredPost = {
    post: CreateOp<PostRecord>
    score: number 
}