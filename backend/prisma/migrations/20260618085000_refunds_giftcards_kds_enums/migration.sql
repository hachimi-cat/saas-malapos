-- Enum value additions, isolated in their own migration.
-- Postgres cannot use a newly-added enum value in the same transaction it was
-- added in; keeping these ALTERs separate from the tables/columns that
-- reference the enum types guarantees a clean `migrate deploy`.

-- TransactionStatus gains PARTIALLY_REFUNDED (REFUNDED stays = fully refunded).
ALTER TYPE "TransactionStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

-- PaymentMethod gains GIFT_CARD (reference carries the gift-card code).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'GIFT_CARD';
