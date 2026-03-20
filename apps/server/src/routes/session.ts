import type { FastifyInstance } from 'fastify';
import { validateUsername, generateId } from '@playarena/shared';
import { signToken } from '../lib/auth';

export async function sessionRoutes(app: FastifyInstance) {
  app.post<{ Body: { username: string } }>('/session', async (request, reply) => {
    const { username } = request.body ?? {};

    if (!username || typeof username !== 'string') {
      return reply.status(400).send({ error: 'INVALID_INPUT', message: 'Username is required' });
    }

    const validation = validateUsername(username);
    if (!validation.ok) {
      return reply.status(400).send({ error: 'USERNAME_INVALID', message: validation.error });
    }

    const trimmed = username.trim();

    if (app.sessionStore.isUsernameTaken(trimmed)) {
      return reply.status(400).send({ error: 'USERNAME_TAKEN', message: 'Username is already in use' });
    }

    const sessionId = generateId('sess');
    const token = signToken(sessionId, trimmed);
    const now = Date.now();

    app.sessionStore.create({
      sessionId,
      username: trimmed,
      createdAt: now,
      lastSeenAt: now,
    });

    return reply.status(201).send({
      sessionId,
      username: trimmed,
      token,
      expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    });
  });

  app.delete('/session', async (request, reply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'AUTH_REQUIRED' });
    }
    // Simple session delete — in real impl, verify token
    return reply.status(204).send();
  });
}
