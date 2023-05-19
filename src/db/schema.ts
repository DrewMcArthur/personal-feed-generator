import { CreateOp } from "../util/subscription"
import { Record as LikeRecord } from '../lexicon/types/app/bsky/feed/like'

export type DatabaseSchema = {
  post: Post
  sub_state: SubState
  like: Like
}

export type Post = {
  uri: string
  cid: string
  text: string
  replyParent: string | null
  replyRoot: string | null
  indexedAt: string
  score: number
}

export type SubState = {
  service: string
  cursor: number
}

export type Like = CreateOp<LikeRecord> & {
  indexedAt: string
  trainedOn: boolean
}