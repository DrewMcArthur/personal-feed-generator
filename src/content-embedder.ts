import { WordTokenizer } from 'natural'
import { Configuration, OpenAIApi } from 'openai'
import dotenv from 'dotenv'

// a class handling embedding post contents
export default class ContentEmbedder {
    tokenizer: WordTokenizer
    openai: OpenAIApi

    constructor() {
        this.tokenizer = new WordTokenizer()
        this._initOpenAI()
    }

    private _initOpenAI() {
        dotenv.config()
        const key = process.env.OPENAI_API_KEY
        if (!key) {
            throw new Error('OPENAI_API_KEY not set')
        }
        this.openai = new OpenAIApi(
            new Configuration({
                apiKey: key,
                organization: process.env.OPENAI_ORG
            })
        );
    }

    async embed(content: string): Promise<number[]> {
        const processed = this.preprocess(content)
        const response = await this.openai.createEmbedding({
            model: "text-embedding-ada-002",
            input: processed,
        });

        const embedding: number[] = response.data.data[0].embedding;
        return embedding
    }

    private preprocess(content: string): string {
        content = content.replace(/https?:\/\/[^\s]+/g, '')
        content = this.tokenize(content).join(" ")
        return content.toLowerCase()
    }

    private tokenize(s: string): string[] {
        const tokens = this.tokenizer.tokenize(s)
        if (tokens === null) {
            throw new Error(`Tokenizer failed on string: ${s}`)
        }

        return tokens.filter(t => !/^[@#]|^(rt|fv)$/i.test(t))
    }
}