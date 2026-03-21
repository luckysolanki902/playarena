import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'Spyllio — Fun Multiplayer Games with Friends',
  description:
    'Play Wordle, Scribble, and more party games with friends instantly. No sign-up needed. Draw, guess, type, and compete in real-time multiplayer games.',
  keywords: [
    'spyllio', 'multiplayer games', 'party games', 'wordle multiplayer', 'scribble game',
    'draw and guess', 'typing games', 'play with friends', 'online games', 'browser games',
    'word games', 'fun games', 'casual games', 'real-time games', 'no signup games'
  ],
  openGraph: {
    title: 'Spyllio — Fun Multiplayer Games with Friends',
    description: 'Play Wordle, Scribble, and more party games with friends. No sign-up needed!',
    type: 'website',
    siteName: 'Spyllio',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Spyllio — Fun Multiplayer Games',
    description: 'Play Wordle, Scribble, and more with friends instantly!',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://spyllio.vercel.app',
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
