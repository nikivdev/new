// Generated from SQL schema by @jazz/schema
// DO NOT EDIT MANUALLY

import type { SchemaMeta } from "@jazz/schema/runtime";

export const schemaMeta: SchemaMeta = {
  tables: {
    Summaries: {
      name: "Summaries",
      columns: [
        { name: "repoPath", type: {"kind":"string"}, nullable: false },
        { name: "startedAt", type: {"kind":"i64"}, nullable: false },
        { name: "finishedAt", type: {"kind":"i64"}, nullable: false },
        { name: "prompt", type: {"kind":"string"}, nullable: false },
        { name: "summary", type: {"kind":"string"}, nullable: false },
      ],
      refs: [
      ],
      reverseRefs: [
      ],
    },
    AgentMessages: {
      name: "AgentMessages",
      columns: [
        { name: "repoPath", type: {"kind":"string"}, nullable: false },
        { name: "requestId", type: {"kind":"string"}, nullable: false },
        { name: "role", type: {"kind":"string"}, nullable: false },
        { name: "content", type: {"kind":"string"}, nullable: false },
        { name: "createdAt", type: {"kind":"i64"}, nullable: false },
      ],
      refs: [
      ],
      reverseRefs: [
      ],
    },
  },
};

// Individual table metadata exports
export const summaryMeta = schemaMeta.tables.Summaries;
export const agentmessageMeta = schemaMeta.tables.AgentMessages;
