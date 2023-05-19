import { InvalidRequestError } from "@atproto/xrpc-server"
import { AppContext } from "../config"
import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'

export const uri = 'at://did:example:alice/app.bsky.feed.generator/personalized'
export const handler = async (ctx: AppContext, params: QueryParams) => {
    /**
     * Example of how to check auth if giving user-specific results:
     */
    // const requesterDid = await validateAuth(
    //   req,
    //   ctx.cfg.serviceDid,
    //   ctx.didResolver,
    // )
    // console.log('request came from ', requesterDid)

    let builder = ctx.db
        .selectFrom('post')
        .selectAll()
        // .orderBy('cid', 'desc')
        .orderBy('score', 'desc')
        .limit(params.limit)
    // .orderBy('indexedAt', 'desc')

    if (params.cursor) {
        const [indexedAt, cid] = params.cursor.split('::')
        if (!indexedAt || !cid) {
            throw new InvalidRequestError('malformed cursor')
        }
        const timeStr = new Date(parseInt(indexedAt, 10)).toISOString()
        builder = builder
            .where('post.indexedAt', '<', timeStr)
            .orWhere((qb) => qb.where('post.indexedAt', '=', timeStr))
            .where('post.cid', '<', cid)
    }
    const res = await builder.execute()

    const feed = res.map((row) => ({
        id: row.cid,
        post: row.uri,
        score: row.score,
        indexTime: row.indexedAt
    }))

    let cursor: string | undefined
    const last = res.at(-1)
    if (last) {
        cursor = `${new Date(last.indexedAt).getTime()}::${last.cid}`
    }

    return {
        encoding: 'application/json',
        body: {
            cursor,
            feed,
        },
    }
}