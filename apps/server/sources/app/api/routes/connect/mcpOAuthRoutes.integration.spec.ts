import Fastify, { type FastifyRequest } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/storage/db';
import { createLightSqliteHarness, type LightSqliteHarness } from '@/testkit/lightSqliteHarness';
import { mcpOAuthRoutes } from './mcpOAuthRoutes';

describe('MCP OAuth code relay', () => {
    let harness: LightSqliteHarness;
    const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    beforeAll(async () => {
        harness = await createLightSqliteHarness({ tempDirPrefix: 'mcp-oauth-relay-' });
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        app.decorate('authenticate', async (request: FastifyRequest) => { request.userId = String(request.headers['x-test-account'] ?? 'owner'); });
        mcpOAuthRoutes(app);
        await app.ready();
    }, 120_000);
    afterAll(async () => { await app.close(); await harness?.close(); });
    it('delivers a callback only to its owner and consumes it once', async () => {
        const started = await app.inject({ method: 'POST', url: '/v1/mcp/oauth/flows' });
        expect(started.statusCode).toBe(200);
        const { flowId } = started.json<{ flowId: string }>();
        const consume = `/v1/mcp/oauth/flows/${flowId}/consume`;
        expect((await app.inject({ method: 'POST', url: consume })).json()).toEqual({ status: 'pending' });
        const callback = await app.inject({ url: `/v1/mcp/oauth/callback?state=${flowId}&code=test-code&iss=https%3A%2F%2Fissuer.example` });
        expect(callback.statusCode).toBe(200);
        expect(callback.body).not.toContain('test-code');
        expect((await app.inject({ method: 'POST', url: consume, headers: { 'x-test-account': 'other' } })).statusCode).toBe(404);
        expect((await app.inject({ method: 'POST', url: consume })).json()).toEqual({ status: 'returned', code: 'test-code', issuer: 'https://issuer.example' });
        expect((await app.inject({ method: 'POST', url: consume })).statusCode).toBe(404);
    });
    it('rejects unknown and expired state and returns denied consent without tokens', async () => {
        const unknown = 'a'.repeat(64);
        expect((await app.inject({ url: `/v1/mcp/oauth/callback?state=${unknown}&code=unused` })).statusCode).toBe(400);
        const { flowId } = (await app.inject({ method: 'POST', url: '/v1/mcp/oauth/flows' })).json<{ flowId: string }>();
        await db.repeatKey.update({ where: { key: `mcp_oauth_${flowId}` }, data: { expiresAt: new Date(0) } });
        expect((await app.inject({ url: `/v1/mcp/oauth/callback?state=${flowId}&code=unused` })).statusCode).toBe(400);
        const denied = (await app.inject({ method: 'POST', url: '/v1/mcp/oauth/flows' })).json<{ flowId: string }>();
        await app.inject({ url: `/v1/mcp/oauth/callback?state=${denied.flowId}&error=access_denied` });
        expect((await app.inject({ method: 'POST', url: `/v1/mcp/oauth/flows/${denied.flowId}/consume` })).json()).toEqual({ status: 'returned', error: 'access_denied' });
    });
});
