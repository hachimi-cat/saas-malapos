-- Admin-portal standard: operator feature flags + their audit trail.
-- See forjio/documentation/2. Technical/13-Admin-Portal-Standard.md

CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "feature_flag_audits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actor" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,

    CONSTRAINT "feature_flag_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feature_flag_audits_key_at_idx" ON "feature_flag_audits"("key", "at");
