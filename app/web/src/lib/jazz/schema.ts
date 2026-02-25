import { co, z } from "jazz-tools"

export const UserProfile = co.profile({
  name: z.string(),
  email: z.optional(z.string()),
  image: z.optional(z.string()),
})

export const ChatMessage = co.map({
  role: z.union([z.literal("user"), z.literal("assistant")]),
  content: z.string(),
  createdAt: z.number(),
})

export const ChatMessageList = co.list(ChatMessage)

export const ContextItemIdList = co.list(z.string())
export const BlockIdList = co.list(z.string())

export const ChatThread = co.map({
  title: z.string(),
  messages: ChatMessageList,
  createdAt: z.number(),
  contextItemIds: ContextItemIdList,
  blockIds: BlockIdList,
})

export const ChatThreadList = co.list(ChatThread)

export const ContextItem = co.map({
  type: z.union([z.literal("url"), z.literal("file")]),
  url: z.optional(z.string()),
  name: z.string(),
  content: z.optional(z.string()),
  refreshing: z.boolean(),
  parentId: z.optional(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const ContextItemList = co.list(ContextItem)

export const BlockConfig = co.map({
  updateInterval: z.optional(z.string()),
  deepScanLevel: z.optional(z.number()),
  summarise: z.optional(z.boolean()),
  createSections: z.optional(z.boolean()),
})

export const BlockPage = co.map({
  path: z.string(),
  url: z.optional(z.string()),
  content: z.optional(z.string()),
  tokenCount: z.number(),
  included: z.boolean(),
  createdAt: z.number(),
})

export const BlockPageList = co.list(BlockPage)

export const Block = co.map({
  name: z.string(),
  type: z.union([z.literal("text"), z.literal("web")]),
  url: z.optional(z.string()),
  content: z.optional(z.string()),
  config: BlockConfig,
  status: z.union([
    z.literal("ready"),
    z.literal("scanning"),
    z.literal("error"),
  ]),
  errorMessage: z.optional(z.string()),
  tokenCount: z.number(),
  pageCount: z.number(),
  lastRefreshedAt: z.optional(z.number()),
  createdAt: z.number(),
  updatedAt: z.number(),
  pages: BlockPageList,
})

export const BlockList = co.list(Block)

export const CanvasImage = co.map({
  name: z.string(),
  prompt: z.string(),
  modelId: z.string(),
  modelUsed: z.optional(z.string()),
  styleId: z.string(),
  width: z.number(),
  height: z.number(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  rotation: z.number(),
  contentBase64: z.optional(z.string()),
  imageUrl: z.optional(z.string()),
  metadata: z.optional(z.object({})),
  branchParentId: z.optional(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const CanvasImageList = co.list(CanvasImage)

export const Canvas = co.map({
  name: z.string(),
  width: z.number(),
  height: z.number(),
  defaultModel: z.string(),
  defaultStyle: z.string(),
  backgroundPrompt: z.optional(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
  images: CanvasImageList,
})

export const CanvasList = co.list(Canvas)

export const ZergMessage = co.map({
  id: z.string(),
  clientId: z.string(),
  body: z.string(),
  createdAt: z.number(),
})

export const ZergMessageList = co.list(ZergMessage)

export const ZergWorkload = co.map({
  id: z.string(),
  name: z.string(),
  description: z.optional(z.string()),
  command: z.optional(z.array(z.string())),
  env: z.optional(z.record(z.string())),
  createdAt: z.number(),
})

export const ZergWorkloadList = co.list(ZergWorkload)

export const ZergRunEvent = co.map({
  id: z.string(),
  runId: z.string(),
  index: z.number(),
  agentId: z.optional(z.string()),
  eventType: z.string(),
  message: z.optional(z.string()),
  metadata: z.optional(z.record(z.string())),
  traceId: z.optional(z.string()),
  spanId: z.optional(z.string()),
  parentSpanId: z.optional(z.string()),
  timestamp: z.number(),
})

export const ZergRunEventList = co.list(ZergRunEvent)

export const ZergRun = co.map({
  id: z.string(),
  workloadId: z.string(),
  status: z.string(),
  agentCount: z.number(),
  traceId: z.string(),
  input: z.optional(z.record(z.string())),
  createdAt: z.number(),
  updatedAt: z.number(),
  events: ZergRunEventList,
})

export const ZergRunList = co.list(ZergRun)

export const ZergCommitSummary = co.map({
  id: z.string(),
  repo: z.string(),
  title: z.optional(z.string()),
  author: z.optional(z.string()),
  authoredAt: z.optional(z.number()),
  summary: z.string(),
  window: z.optional(z.string()),
  runId: z.optional(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const ZergCommitSummaryList = co.list(ZergCommitSummary)

export const ZergState = co.map({
  messages: ZergMessageList,
  workloads: ZergWorkloadList,
  runs: ZergRunList,
  commitSummaries: ZergCommitSummaryList,
  updatedAt: z.number(),
})

export const GenAccount = co
  .account({
    profile: UserProfile,
    root: co.map({
      chatThreads: ChatThreadList,
      contextItems: ContextItemList,
      blocks: BlockList,
      canvases: CanvasList,
    }),
  })
  .withMigration((account, creationProps?: { name?: string }) => {
    if (!account.$jazz.has("profile")) {
      const name = creationProps?.name?.trim() || "Anonymous"
      account.$jazz.set("profile", {
        name,
      })
    }
    if (!account.$jazz.has("root")) {
      account.$jazz.set("root", {
        chatThreads: ChatThreadList.create([]),
        contextItems: ContextItemList.create([]),
        blocks: BlockList.create([]),
        canvases: CanvasList.create([]),
      })
    }
  })

export const DirectoryUser = co.map({
  userId: z.string(),
  name: z.optional(z.string()),
  email: z.optional(z.string()),
  image: z.optional(z.string()),
  updatedAt: z.number(),
})

export const DirectoryUserList = co.list(DirectoryUser)

export const BillingUsageRecord = co.map({
  standardUsed: z.number(),
  standardLimit: z.number(),
  premiumUsed: z.number(),
  premiumLimit: z.number(),
  scrapesUsed: z.number(),
  scrapesLimit: z.number(),
  periodStart: z.number(),
  periodEnd: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const BillingUsageRecordList = co.list(BillingUsageRecord)

export const BillingUser = co.map({
  userId: z.string(),
  polarCustomerId: z.optional(z.string()),
  polarSubscriptionId: z.optional(z.string()),
  polarProductId: z.optional(z.string()),
  subscriptionStatus: z.optional(z.string()),
  currentPeriodStart: z.optional(z.number()),
  currentPeriodEnd: z.optional(z.number()),
  cancelAtPeriodEnd: z.optional(z.boolean()),
  usageRecords: BillingUsageRecordList,
  topupStandardCredits: z.number(),
  topupPremiumCredits: z.number(),
  topupScrapesCredits: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const BillingUserList = co.list(BillingUser)

export const ServerAccount = co
  .account({
    root: co.map({
      users: DirectoryUserList,
      billingUsers: BillingUserList,
      zerg: ZergState,
    }),
  })
  .withMigration((account) => {
    if (!account.$jazz.has("root")) {
      account.$jazz.set("root", {
        users: DirectoryUserList.create([]),
        billingUsers: BillingUserList.create([]),
        zerg: ZergState.create({
          messages: ZergMessageList.create([]),
          workloads: ZergWorkloadList.create([]),
          runs: ZergRunList.create([]),
          commitSummaries: ZergCommitSummaryList.create([]),
          updatedAt: Date.now(),
        }),
      })
      return
    }

    const root = account.root as any
    if (!root?.zerg) {
      account.root.$jazz.set(
        "zerg",
        ZergState.create({
          messages: ZergMessageList.create([]),
          workloads: ZergWorkloadList.create([]),
          runs: ZergRunList.create([]),
          commitSummaries: ZergCommitSummaryList.create([]),
          updatedAt: Date.now(),
        })
      )
      return
    }

    if (!root?.zerg?.commitSummaries) {
      account.root.zerg.$jazz.set(
        "commitSummaries",
        ZergCommitSummaryList.create([])
      )
    }
  })

export type LoadedChatThread = co.loaded<typeof ChatThread>
export type LoadedContextItem = co.loaded<typeof ContextItem>
export type LoadedBlock = co.loaded<typeof Block>
export type LoadedCanvas = co.loaded<typeof Canvas>
export type LoadedCanvasImage = co.loaded<typeof CanvasImage>
export type LoadedDirectoryUser = co.loaded<typeof DirectoryUser>
export type LoadedBillingUser = co.loaded<typeof BillingUser>
export type LoadedZergMessage = co.loaded<typeof ZergMessage>
export type LoadedZergWorkload = co.loaded<typeof ZergWorkload>
export type LoadedZergRun = co.loaded<typeof ZergRun>
export type LoadedZergRunEvent = co.loaded<typeof ZergRunEvent>
export type LoadedZergCommitSummary = co.loaded<typeof ZergCommitSummary>
