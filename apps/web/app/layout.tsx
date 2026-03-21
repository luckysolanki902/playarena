import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://spyllio.vercel.app'),
  title: 'Spyllio — Fun Multiplayer Games with Friends',
  description:
    'Play Wordle, Scribble, and more party games with friends instantly. No sign-up needed. Draw, guess, type, and compete in real-time multiplayer games.',
  keywords: [
    'spyllio', 'multiplayer games', 'party games', 'wordle multiplayer', 'scribble game',
    'draw and guess', 'typing games', 'play with friends', 'online games', 'browser games',
    'word games', 'fun games', 'casual games', 'real-time games', 'no signup games'
  ],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Spyllio — Fun Multiplayer Games with Friends',
    description: 'Play Wordle, Scribble, and more party games with friends. No sign-up needed!',
    type: 'website',
    siteName: 'Spyllio',
    locale: 'en_US',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Spyllio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Spyllio — Fun Multiplayer Games',
    description: 'Play Wordle, Scribble, and more with friends instantly!',
    images: ['/og.png'],
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
