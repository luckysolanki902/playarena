import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Session } from '@playarena/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

interface SessionState {
  session: Session | null;
  token: string | null;
  createSession: (username: string) => Promise<void>;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      token: null,

      createSession: async (username: string) => {
        const res = await fetch(`${API_URL}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'Failed to create session');
        }

        const data = await res.json();
        set({
          session: {
            sessionId: data.sessionId,
            username: data.username,
            createdAt: Date.now(),
            lastSeenAt: Date.now(),
          },
          token: data.token,
        });
      },

      clearSession: () => set({ session: null, token: null }),
    }),
    {
      name: 'playarena-session',
      partialize: (state) => ({ session: state.session, token: state.token }),
      onRehydrateStorage: () => (state) => {
        // Clear session immediately if the stored JWT has expired
        if (state?.token && isTokenExpired(state.token)) {
          state.clearSession();
        }
      },
    }
  )
);
