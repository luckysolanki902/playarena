import jwt from 'jsonwebtoken';
import type { SessionToken } from '@playarena/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-replace-me';
const JWT_EXPIRY = '24h';

export function signToken(sessionId: string, username: string): string {
  return jwt.sign({ sub: sessionId, username } satisfies Omit<SessionToken, 'iat' | 'exp'>, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
  });
}

export function verifyToken(token: string): SessionToken | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionToken;
  } catch {
    return null;
  }
}
