import assert from "assert";
import ContentEmbedder from "../src/content-embedder";
import { describe } from "node:test";
import { OpenAIApi } from "openai";
import { anyOfClass, anything, mock, when } from "ts-mockito";

describe("ContentEmbedder", () => {
    it("should embed(test)", async () => {
        // const e = mock(ContentEmbedder)
        // when(e.embed("test")).thenResolve([0])
        // const res = await e.embed("test")
        // assert.deepStrictEqual(res.length, [0]);
    })
})
