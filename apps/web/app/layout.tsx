import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'PlayArena — Play Word Games Together',
  description:
    'A cozy place to play Wordle and more with friends. No sign-up needed.',
  keywords: ['wordle', 'multiplayer games', 'word games', 'play with friends'],
  openGraph: {
    title: 'PlayArena — Play Word Games Together',
    description: 'A cozy place to play Wordle and more with friends.',
    type: 'website',
    siteName: 'PlayArena',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${nunito.variable}`}>
      <body className={`min-h-screen antialiased ${nunito.className}`}>
        {children}
      </body>
    </html>
  );
}
