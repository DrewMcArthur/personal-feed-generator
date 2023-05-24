import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as whatsAlf from './whats-alf'
import * as personalizedScoring from './predicted-likes'

type AlgoHandler = (ctx: AppContext, params: QueryParams) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [whatsAlf.uri]: whatsAlf.handler,
  [personalizedScoring.uri]: personalizedScoring.handler
}

export default algos
