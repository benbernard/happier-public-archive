import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Fastify } from '../../types';
import { db } from '@/storage/db';

const flowIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const flowSchema = z.object({ accountId: z.string(), code: z.string().optional(), error: z.string().optional(), issuer: z.string().optional() });
const keyFor = (id: string) => `mcp_oauth_${id}`;

/** Relay authorization codes only. PKCE verifiers and tokens stay on the selected machine. */
export function mcpOAuthRoutes(app: Fastify): void {
    app.post('/v1/mcp/oauth/flows', { preHandler: app.authenticate }, async (request) => {
        const flowId = randomBytes(32).toString('hex');
        await db.repeatKey.create({ data: { key: keyFor(flowId), value: JSON.stringify({ accountId: request.userId }),
            expiresAt: new Date(Date.now() + 10 * 60_000) } });
        return { flowId };
    });

    app.get('/v1/mcp/oauth/callback', { schema: { querystring: z.object({
        state: flowIdSchema, code: z.string().min(1).max(16_384).optional(),
        error: z.string().max(256).optional(), iss: z.string().max(2048).optional(),
    }) } }, async (request, reply) => {
        const { state, code, error, iss } = request.query;
        const row = await db.repeatKey.findUnique({ where: { key: keyFor(state) } });
        if (!row || row.expiresAt.getTime() <= Date.now() || (!code && !error)) {
            return reply.code(400).send('This sign-in has expired. Return to Happier and try again.');
        }
        const flow = flowSchema.parse(JSON.parse(row.value));
        if (flow.code || flow.error) return reply.code(400).send('This sign-in has already returned.');
        await db.repeatKey.updateMany({ where: { key: row.key, value: row.value }, data: {
            value: JSON.stringify({ accountId: flow.accountId, ...(code ? { code } : {}), ...(error ? { error } : {}), ...(iss ? { issuer: iss } : {}) }),
        } });
        return reply.header('Cache-Control', 'no-store').type('text/html').send(
            '<!doctype html><meta name="viewport" content="width=device-width"><title>Happier sign-in</title><h1>Return to Happier</h1><p>You can close this browser tab to finish signing in.</p>',
        );
    });

    app.post('/v1/mcp/oauth/flows/:flowId/consume', { preHandler: app.authenticate,
        schema: { params: z.object({ flowId: flowIdSchema }) },
    }, async (request, reply) => {
        const row = await db.repeatKey.findUnique({ where: { key: keyFor(request.params.flowId) } });
        if (!row || row.expiresAt.getTime() <= Date.now()) return reply.code(404).send({ error: 'expired' });
        const flow = flowSchema.parse(JSON.parse(row.value));
        if (flow.accountId !== request.userId) return reply.code(404).send({ error: 'not_found' });
        if (!flow.code && !flow.error) return { status: 'pending' };
        const consumed = await db.repeatKey.deleteMany({ where: { key: row.key, value: row.value } });
        if (consumed.count !== 1) return reply.code(404).send({ error: 'expired' });
        return reply.header('Cache-Control', 'no-store').send({ status: 'returned',
            ...(flow.code ? { code: flow.code } : {}), ...(flow.error ? { error: flow.error } : {}),
            ...(flow.issuer ? { issuer: flow.issuer } : {}),
        });
    });
}
