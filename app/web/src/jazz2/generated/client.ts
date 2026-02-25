// Stub implementation when local Jazz packages are not available
// This allows the app to work without the full jazz2 functionality

type NoopDb = Record<string, unknown>

const createNoopTable = () => ({
  create: (_db: NoopDb, _data: Record<string, unknown>) => {
    // No-op: jazz2 packages not available
  },
  subscribe: () => () => {},
  subscribeOne: () => () => {},
  findMany: () => Promise.resolve([]),
  findOne: () => Promise.resolve(null),
  update: () => Promise.resolve(),
  delete: () => Promise.resolve(),
})

export const app = {
  summaries: createNoopTable(),
  agentmessages: createNoopTable(),
}
