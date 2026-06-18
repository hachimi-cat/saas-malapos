import { PrismaClient } from '@prisma/client';

/** Singleton Prisma client. Same pattern as Storlaunch. */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
