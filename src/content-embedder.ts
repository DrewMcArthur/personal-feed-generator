import { WordTokenizer } from 'natural';
import Word2Vec from 'word2vec';

// a class handling embedding post contents
export default class ContentEmbedder {
    model: null
    tokenizer: WordTokenizer

    constructor() {
        this.model = null // word2vec or glove-js
        this.tokenizer = new WordTokenizer()
    }

    async embed(content: string): Promise<number[][]> {
        const processed = this.preprocess(content)
        const tokens = this.tokenize(processed)
        return await this.embedTokens(tokens)
    }

    preprocess(content: string): string {
        content = content.replace(/https?:\/\/[^\s]+/g, '');
        return content.toLowerCase();
    }

    tokenize(s: string): string[] {
        const tokens = this.tokenizer.tokenize(s)
        if (tokens === null) {
            throw new Error(`Tokenizer failed on string: ${s}`)
        }

        return tokens.filter(t => !/^[@#]|^(rt|fv)$/i.test(t))
    }

    async embedTokens(tokens: string[]): Promise<number[][]> {
        const model = await this._model()
        const embeddings: number[][] = [];

        // Iterate over tokens and get their embeddings
        for (const token of tokens) {
            const embedding = model.getVector(token);
            if (!embedding) {
                throw new Error(`embedding not found for token: ${token}`)
            }
            embeddings.push(embedding);
        }

        return embeddings;
    }

    async _model(): Promise<Word2Vec> {
        if (this.model === null) {
            this.model = await Word2Vec.load('./model/word2vec.bin');
        }
        return this.model
    }
}