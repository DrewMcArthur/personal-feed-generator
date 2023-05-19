// a class handling embedding post contents
export default class ContentEmbedder {
    model: null
    constructor() {
        this.model = null // word2vec or glove-js
    }

    async embed(content: string): Promise<number[]> {
        const processed = this.preprocess(content)
        const tokens = this.tokenize(processed)
        return this.embedTokens(tokens)
    }

    preprocess(content: string): string {
        // TODO: strip punctuation, stop words, urls, etc
        //       e.g. tweet-preprocessor
        return content
    }

    tokenize(s: string): string[] {
        // TODO: tokenize the text
        //  e.g. library tokenizer or natural
        return []
    }

    embedTokens(tokens: string[]): number[] {
        // TODO: embed the tokens
        //  e.g. word2vec or glove-js
        return []
    }
}