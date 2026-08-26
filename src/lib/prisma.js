"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismaClientOptions = void 0;
exports.createPrismaClient = createPrismaClient;
var adapter_pg_1 = require("@prisma/adapter-pg");
var client_js_1 = require("../generated/prisma/client.js");
require("dotenv/config.js");
var rawDatabaseUrl = process.env.DATABASE_URL;
var databaseUrl = (rawDatabaseUrl !== null && rawDatabaseUrl !== void 0 ? rawDatabaseUrl : '').trim();
if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
}
var adapter = new adapter_pg_1.PrismaPg({
    connectionString: databaseUrl,
});
exports.prismaClientOptions = { adapter: adapter };
function createPrismaClient() {
    return new client_js_1.PrismaClient(exports.prismaClientOptions);
}
