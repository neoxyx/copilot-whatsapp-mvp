import { PrismaClient } from '@prisma/client';

declare global {
	// allow global reuse across module reloads in development
	// eslint-disable-next-line no-var
	var __prismaClient: PrismaClient | undefined;
}

export const db = globalThis.__prismaClient ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalThis.__prismaClient = db;