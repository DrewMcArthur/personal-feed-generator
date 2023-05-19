import assert from "assert";
import ContentEmbedder from "../src/content-embedder";
import { describe } from "node:test";

describe("ContentEmbedder", () => {
    it("should embed(test)", async () => {
        const e = new ContentEmbedder()
        const res = await e.embed("test")
        console.log(`embed(test) = ${res}`)
        assert.deepStrictEqual(res.length, 1536);
    })
})