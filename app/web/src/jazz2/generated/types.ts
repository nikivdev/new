// Generated from SQL schema by @jazz/schema
// DO NOT EDIT MANUALLY

import type { StringFilter, BigIntFilter, NumberFilter, BoolFilter, RelationFilter, BaseWhereInput } from "@jazz/schema/runtime";

/** ObjectId is a 128-bit unique identifier (UUIDv7) represented as a Base32 string */
export type ObjectId = string;

/** Base interface for all Groove rows */
export interface GrooveRow {
  id: ObjectId;
}

// === Includes types (specify which refs to load) ===

export type SummaryIncludes = {};

export type AgentMessageIncludes = {};

// === Filter types (Prisma-style filters) ===

export interface SummaryFilter extends BaseWhereInput {
  AND?: SummaryFilter | SummaryFilter[];
  OR?: SummaryFilter[];
  NOT?: SummaryFilter | SummaryFilter[];
  id?: string | StringFilter;
  repoPath?: string | StringFilter;
  startedAt?: bigint | BigIntFilter;
  finishedAt?: bigint | BigIntFilter;
  prompt?: string | StringFilter;
  summary?: string | StringFilter;
}

export interface AgentMessageFilter extends BaseWhereInput {
  AND?: AgentMessageFilter | AgentMessageFilter[];
  OR?: AgentMessageFilter[];
  NOT?: AgentMessageFilter | AgentMessageFilter[];
  id?: string | StringFilter;
  repoPath?: string | StringFilter;
  requestId?: string | StringFilter;
  role?: string | StringFilter;
  content?: string | StringFilter;
  createdAt?: bigint | BigIntFilter;
}

// === Row types ===

/** Summary row from the Summaries table */
export interface Summary extends GrooveRow {
  repoPath: string;
  startedAt: bigint;
  finishedAt: bigint;
  prompt: string;
  summary: string;
}

/** Data for inserting a new Summary */
export interface SummaryInsert {
  repoPath: string;
  startedAt: bigint;
  finishedAt: bigint;
  prompt: string;
  summary: string;
}

/** Summary has no refs, so With is the same as base type */
export type SummaryWith<I extends SummaryIncludes = {}> = Summary;

/** AgentMessage row from the AgentMessages table */
export interface AgentMessage extends GrooveRow {
  repoPath: string;
  requestId: string;
  role: string;
  content: string;
  createdAt: bigint;
}

/** Data for inserting a new AgentMessage */
export interface AgentMessageInsert {
  repoPath: string;
  requestId: string;
  role: string;
  content: string;
  createdAt: bigint;
}

/** AgentMessage has no refs, so With is the same as base type */
export type AgentMessageWith<I extends AgentMessageIncludes = {}> = AgentMessage;
