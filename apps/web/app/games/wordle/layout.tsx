import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wordle — PlayArena',
  description: 'Play Wordle in real-time against friends. 5 letters, 6 guesses, multiplayer duels.',
};

export default function WordleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
