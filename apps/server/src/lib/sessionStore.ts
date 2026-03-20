import type { Session } from '@playarena/shared';

const ONE_HOUR = 60 * 60 * 1000;

export class SessionStore {
  private sessions = new Map<string, Session>();
  private usernameIndex = new Map<string, string>(); // lowercased username → sessionId

  create(session: Session): void {
    this.sessions.set(session.sessionId, session);
    this.usernameIndex.set(session.username.toLowerCase(), session.sessionId);
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  isUsernameTaken(username: string): boolean {
    return this.usernameIndex.has(username.toLowerCase());
  }

  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastSeenAt = Date.now();
    }
  }

  delete(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.usernameIndex.delete(session.username.toLowerCase());
      this.sessions.delete(sessionId);
    }
  }

  cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastSeenAt > ONE_HOUR) {
        this.usernameIndex.delete(session.username.toLowerCase());
        this.sessions.delete(id);
      }
    }
  }

  get activeCount(): number {
    return this.sessions.size;
  }
}
