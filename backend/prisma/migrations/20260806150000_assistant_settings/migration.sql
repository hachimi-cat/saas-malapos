-- The workspace's embedded-assistant preferences (catentio layer).
CREATE TABLE "assistant_settings" (
    "accountId" TEXT NOT NULL,
    "autoApply" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_settings_pkey" PRIMARY KEY ("accountId")
);
