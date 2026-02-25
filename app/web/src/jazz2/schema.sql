CREATE TABLE Summaries (
    repoPath STRING NOT NULL,
    startedAt I64 NOT NULL,
    finishedAt I64 NOT NULL,
    prompt STRING NOT NULL,
    summary STRING NOT NULL
);

CREATE TABLE AgentMessages (
    repoPath STRING NOT NULL,
    requestId STRING NOT NULL,
    role STRING NOT NULL,
    content STRING NOT NULL,
    createdAt I64 NOT NULL
);
