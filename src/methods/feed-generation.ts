import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../lexicon'
import { AppContext } from '../config'
import algos from '../algos'
import { validateAuth } from '../auth'

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.getFeedSkeleton(async ({ params, req }) => {
    const algo = algos[params.feed]
    if (!algo) {
      throw new InvalidRequestError(
        'Unsupported algorithm',
        'UnsupportedAlgorithm'
      )
    }

    // todo this overwrites the did from the .env.
    // need to differentiate between requester and which DIDs the server is setup for
    ctx.cfg.requesterDid = await validateAuth(
      req,
      ctx.cfg.serviceDid,
      ctx.didResolver
    )

    const body = await algo(ctx, params)
    return {
      encoding: 'application/json',
      body: body
    }
  })
}
