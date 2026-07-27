"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const client_1 = require("@prisma/client");
exports.db = globalThis.__prismaClient ?? new client_1.PrismaClient();
if (process.env.NODE_ENV !== 'production')
    globalThis.__prismaClient = exports.db;
