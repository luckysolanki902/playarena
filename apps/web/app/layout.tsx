import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PlayArena — Real-time Multiplayer Games',
  description:
    'Play Wordle, Scribble, and more with friends in real-time. No sign-up required. Just pick a name and play.',
  keywords: ['multiplayer games', 'wordle', 'scribble', 'online games', 'play with friends'],
  openGraph: {
    title: 'PlayArena — Real-time Multiplayer Games',
    description: 'Play Wordle, Scribble, and more with friends. No sign-up. Just play.',
    type: 'website',
    siteName: 'PlayArena',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PlayArena — Real-time Multiplayer Games',
    description: 'Play Wordle, Scribble, and more with friends. No sign-up. Just play.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
