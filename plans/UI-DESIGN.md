# UI Design System — PlayArena

## Design Philosophy
Modern, playful, premium. Every interaction should feel alive — smooth transitions, satisfying animations, responsive feedback. Think "gaming meets SaaS" — dark theme, vibrant accents, micro-interactions everywhere.

---

## 1. Color System

### Core Palette
```
Background (Dark):
  --bg-primary:    #0A0A0F    (deep dark — main bg)
  --bg-secondary:  #12121A    (cards, panels)
  --bg-tertiary:   #1A1A28    (elevated surfaces)
  --bg-hover:      #22223A    (hover states)

Text:
  --text-primary:  #F5F5F7    (headings, primary)
  --text-secondary:#A0A0B8    (body, descriptions)
  --text-muted:    #6B6B80    (placeholders, hints)

Borders:
  --border-default:#2A2A3E    (subtle borders)
  --border-focus:  #7C3AED    (focused elements)
```

### Accent Colors (Vibrant)
```
  --accent-purple: #7C3AED    (primary action — buttons, links)
  --accent-blue:   #3B82F6    (info, secondary actions)
  --accent-green:  #22C55E    (success, correct)
  --accent-yellow: #EAB308    (warning, hints)
  --accent-red:    #EF4444    (error, wrong)
  --accent-orange: #F97316    (streaks, hot)
  --accent-pink:   #EC4899    (love, reactions)
  --accent-cyan:   #06B6D4    (special, rare)
```

### Game-Specific Colors
```
Wordle:
  --wordle-correct:  #22C55E   (green — right letter, right spot)
  --wordle-present:  #EAB308   (yellow — right letter, wrong spot)
  --wordle-absent:   #3A3A4E   (gray — not in word)
  --wordle-empty:    #1A1A28   (unfilled tile)

Scribble:
  --canvas-bg:      #FFFFFF   (white canvas always)
  Drawing palette:  16 predefined colors (see Scribble plan)
```

### Gradients
```
  --gradient-hero:     linear-gradient(135deg, #7C3AED 0%, #3B82F6 100%)
  --gradient-success:  linear-gradient(135deg, #22C55E 0%, #06B6D4 100%)
  --gradient-danger:   linear-gradient(135deg, #EF4444 0%, #F97316 100%)
  --gradient-gold:     linear-gradient(135deg, #EAB308 0%, #F97316 100%)
  --gradient-card:     linear-gradient(180deg, #1A1A28 0%, #12121A 100%)
```

---

## 2. Typography

### Font Stack
```css
--font-heading: 'Space Grotesk', system-ui, sans-serif;
--font-body:    'Geist', 'Inter', system-ui, sans-serif;
--font-mono:    'Geist Mono', 'JetBrains Mono', monospace;
```

### Scale
| Token | Size | Weight | Use |
|-------|------|--------|-----|
| display | 48px / 3rem | 700 | Hero headings |
| h1 | 36px / 2.25rem | 700 | Page titles |
| h2 | 28px / 1.75rem | 600 | Section headers |
| h3 | 22px / 1.375rem | 600 | Card titles |
| h4 | 18px / 1.125rem | 600 | Sub-headings |
| body-lg | 18px / 1.125rem | 400 | Large body text |
| body | 16px / 1rem | 400 | Default body |
| body-sm | 14px / 0.875rem | 400 | Small text, labels |
| caption | 12px / 0.75rem | 400 | Captions, timestamps |

### Letter Spacing
- Headings: `-0.02em` (tighter)
- Body: `0` (default)
- Captions / uppercase labels: `0.05em` (wider)

---

## 3. Spacing & Layout

### Spacing Scale (Tailwind default + custom)
```
4px  (1)   — tight gaps
8px  (2)   — inline spacing
12px (3)   — compact padding
16px (4)   — default padding
20px (5)   — comfortable
24px (6)   — section padding
32px (8)   — card padding
40px (10)  — section gaps
48px (12)  — page sections
64px (16)  — major sections
```

### Breakpoints
| Name | Width | Target |
|------|-------|--------|
| `sm` | 640px | Large phones (landscape) |
| `md` | 768px | Tablets |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large desktops |

### Container
- Max width: `1280px`
- Padding: `16px` (sm), `24px` (md), `32px` (lg+)
- Centered with auto margins

---

## 4. Component Library

### Buttons
```
Primary:   bg-accent-purple, text-white, hover:brightness-110, active:scale-98
Secondary: bg-bg-tertiary, text-text-primary, border border-default, hover:bg-hover
Ghost:     bg-transparent, text-text-secondary, hover:text-primary hover:bg-hover
Danger:    bg-accent-red, text-white
Success:   bg-accent-green, text-white

Sizes:     sm (32px h), md (40px h), lg (48px h), xl (56px h)
Radius:    12px (all buttons)
Transition: all 150ms ease
```

### Cards
```
Background:  bg-secondary
Border:      1px solid border-default
Radius:      16px
Shadow:      0 4px 24px rgba(0,0,0,0.2)
Hover:       border-color transitions to accent-purple, shadow grows
Padding:     24px (desktop), 16px (mobile)
```

### Inputs
```
Background:  bg-tertiary
Border:      1px solid border-default
Radius:      12px
Focus:       border-accent-purple, ring (0 0 0 3px rgba(124,58,237,0.2))
Height:      44px (default), 40px (sm)
Font:        body (16px) — prevents iOS zoom
Padding:     12px 16px
```

### Badges / Tags
```
Style:       bg-accent/15 (15% opacity bg) + text-accent
Radius:      8px
Padding:     4px 10px
Font:        body-sm, weight 500
Examples:    "LIVE" (green), "2/4 Players" (blue), "Ranked" (purple)
```

### Tooltips
```
Background:  bg-tertiary
Border:      1px solid border-default
Radius:      8px
Shadow:      0 8px 24px rgba(0,0,0,0.3)
Arrow:       6px CSS triangle
Animation:   fade + shift-away (150ms)
```

### Avatars
```
Shape:       Circle
Sizes:       24px (xs), 32px (sm), 40px (md), 56px (lg)
Default:     Generated gradient bg + first letter of username
Border:      2px solid bg-primary (for overlapping groups)
Online dot:  8px green circle, bottom-right
```

---

## 5. Animation Philosophy

### Principles
1. **Purposeful** — animations communicate state changes, never decorative-only
2. **Fast** — 150-300ms for UI transitions, up to 600ms for celebrations
3. **Springy** — use spring easing (`spring(1, 80, 10)`) for interactive elements
4. **Layered** — stagger children animations for visual hierarchy

### Motion Tokens (Framer Motion)
```typescript
const transitions = {
  fast:    { duration: 0.15, ease: 'easeOut' },
  default: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
  spring:  { type: 'spring', stiffness: 300, damping: 25 },
  bounce:  { type: 'spring', stiffness: 400, damping: 15 },
  slow:    { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
};
```

### Key Animations
| Element | Animation | Duration |
|---------|-----------|----------|
| Page transitions | Fade + slide up 20px | 300ms |
| Card hover | Scale 1.02 + shadow grow | 200ms |
| Button press | Scale 0.97 | 100ms |
| Modal open | Fade bg + scale from 0.95 | 250ms |
| Tile flip (Wordle) | 3D rotateX 180° per tile | 400ms, stagger 100ms |
| Tile pop (correct) | Scale 1.1 → 1.0 | 200ms |
| Score counter | Number count-up animation | 1s |
| Toast notification | Slide in from top + fade | 300ms |
| Confetti | Particle burst (canvas) | 3s |
| Player join | Slide in + fade from right | 300ms |
| Timer (last 10s) | Pulse red + scale | 500ms loop |
| Keyboard key press | Brief highlight + scale | 150ms |

---

## 6. Page Layouts

### Landing Page (/)
```
┌─────────────────────────────────────────────────┐
│  Navbar: Logo (left) │ Games │ Rooms │ About    │
├─────────────────────────────────────────────────┤
│                                                 │
│          🎮 PlayArena                           │
│   "Real-time multiplayer games.                 │
│    No sign-up. Just play."                      │
│                                                 │
│   [Enter Username] [Play Now →]                 │
│                                                 │
├─────────────────────────────────────────────────┤
│  Game Cards (grid 2x2 on desktop, stack mobile) │
│  ┌──────────┐  ┌──────────┐                     │
│  │  Wordle   │  │ Scribble │                     │
│  │  👥 12    │  │  👥 34   │                     │
│  │  playing  │  │  playing │                     │
│  └──────────┘  └──────────┘                     │
│  ┌──────────┐  ┌──────────┐                     │
│  │ TypeRacer│  │  Trivia  │                     │
│  │  👥 8    │  │  👥 22   │                     │
│  │  playing │  │  playing │                     │
│  └──────────┘  └──────────┘                     │
├─────────────────────────────────────────────────┤
│  Stats: "5,234 games played today"              │
│  Features: Instant play │ Mobile │ Free forever │
├─────────────────────────────────────────────────┤
│  Footer: Credits ("Built by Dharaa Singh")      │
│  GitHub │ Twitter │ Privacy                     │
└─────────────────────────────────────────────────┘
```

### Game Lobby (/games/wordle)
```
┌─────────────────────────────────────────────────┐
│  Breadcrumb: Home > Games > Wordle              │
├─────────────────────────────────────────────────┤
│  Game Info Card:                                │
│  "Wordle" — 5 letters, 6 guesses, real-time     │
│                                                 │
│  [Quick Match]  [Create Room]  [Join Room]      │
│                                                 │
├─────────────────────────────────────────────────┤
│  Public Rooms:                                  │
│  ┌─────────────────────────────────────────┐    │
│  │  Room "chill vibes" │ 2/4 │ Starting.. │    │
│  │  Room "try hards"   │ 1/2 │ Waiting    │    │
│  │  Room "anyone?"     │ 3/8 │ In Game    │    │
│  └─────────────────────────────────────────┘    │
├─────────────────────────────────────────────────┤
│  Solo Play:                                     │
│  [Play vs Bot]  [Practice Mode]                 │
└─────────────────────────────────────────────────┘
```

### In-Game (Wordle Example)
```
Desktop:
┌──────────┬───────────────────────┬──────────────┐
│          │   Round 1 of 3        │              │
│ Players  │   ⏱ 2:34             │    Chat      │
│          │                       │              │
│ You ★    │  ┌─┬─┬─┬─┬─┐        │  Player1:    │
│ 1200pts  │  │S│T│A│R│E│ 🟩🟨⬛⬛🟩 │  "gl hf"     │
│          │  ├─┼─┼─┼─┼─┤        │              │
│ Player2  │  │ │ │ │ │ │        │  You:        │
│ 1100pts  │  └─┴─┴─┴─┴─┘        │  "you too!"  │
│          │                       │              │
│ Bot 🤖   │  [Keyboard Grid]      │  System:     │
│ 900pts   │  Q W E R T Y U I O P  │  "P2 solved!│
│          │   A S D F G H J K L   │   in 3 tries"│
│          │    Z X C V B N M      │              │
│          │                       │ [type msg...] │
│          │  [💡 Hint] [⚙ Settings]│              │
└──────────┴───────────────────────┴──────────────┘

Mobile:
┌─────────────────────┐
│  ⏱ 2:34  Round 1/3  │
│  You: 1200 │ P2: 1100│
├─────────────────────┤
│  ┌─┬─┬─┬─┬─┐       │
│  │S│T│A│R│E│ 🟩🟨⬛⬛🟩│
│  ├─┼─┼─┼─┼─┤       │
│  │ │ │ │ │ │       │
│  └─┴─┴─┴─┴─┘       │
│                     │
│  Q W E R T Y U I O P│
│   A S D F G H J K L │
│    Z X C V B N M    │
│  [💡] [ENTER] [⌫]   │
├─────────────────────┤
│  💬 Chat (tap to     │
│     expand)         │
└─────────────────────┘
```

---

## 7. Navbar Design

```
┌────────────────────────────────────────────────────────────┐
│ 🎮 PlayArena      Games ▾   Rooms   Leaderboard    [User] │
└────────────────────────────────────────────────────────────┘
```

- Fixed top, `backdrop-blur-md` + `bg-primary/80`
- Height: 64px desktop, 56px mobile
- Mobile: hamburger menu → slide-in drawer from left
- User section: avatar + username, click for dropdown (Change name, Settings, Sign out of session)
- Games dropdown: grid of game icons + names + active player counts
- Active page: accent underline

---

## 8. Chat UI Design

### Desktop (Side Panel)
```
┌─ Chat ───────────────────────┐
│ ┌───────────────────────────┐│
│ │ 🟢 Player1: gl hf        ││
│ │ 🟢 You: let's go!        ││
│ │ 📢 System: Round started  ││
│ │ 🟢 Player2: 😂           ││
│ │ 🎉 Player1 guessed it!   ││
│ └───────────────────────────┘│
│ ┌─────────────────────┐ [→] │
│ │ Type a message...   │      │
│ └─────────────────────┘      │
│ 😀 Quick reactions: 👏🔥😂💀│
└──────────────────────────────┘
```

### Mobile (Bottom Sheet)
- Collapsed: shows last message + unread count badge
- Half-expanded: last 5 messages + input
- Full-expanded: full chat history (swipe up)
- Quick reaction bar always visible in half-expanded

### Message Types
| Type | Style |
|------|-------|
| Player message | Avatar + username (colored) + text |
| System message | Centered, muted text, italic |
| Guess correct | 🎉 confetti icon + green highlight |
| Close guess | ⚡ yellow "Almost!" (only to sender) |
| Emoji reaction | Floating emoji animation above chat |

---

## 9. Responsive Approach

### Strategy: Mobile-First
1. Design for 375px (iPhone SE) first
2. Progressively enhance for larger screens
3. Touch targets minimum 44x44px
4. No hover-only interactions — all touchable

### Game-Specific Responsive

#### Wordle
- **Mobile**: Tiles shrink to fit, keyboard keys 36x48px, tap-friendly
- **Tablet**: 2-column (game + chat side by side)
- **Desktop**: 3-column (players + game + chat)

#### Scribble
- **Mobile**: Canvas full-width, floating tool bar, chat as bottom sheet
- **Tablet**: Canvas top, tools middle, chat bottom
- **Desktop**: Canvas left (70%), players+chat right (30%)

### Touch Interactions
| Action | Desktop | Mobile |
|--------|---------|--------|
| Button click | click | tap (with 44px min) |
| Drag | mouse drag | touch drag |
| Hover preview | `:hover` | long-press |
| Context menu | right-click | long-press |
| Scroll | wheel | swipe |
| Dismiss | click outside | swipe down |

---

## 10. Loading & Empty States

### Loading
- Skeleton screens (pulsing gray blocks mimicking layout)
- Game boards: ghost tiles with shimmer animation
- Never show a white/blank screen

### Empty States
```
┌───────────────────────────────────┐
│                                   │
│          🎮                       │
│   No games in progress            │
│   Be the first to start one!     │
│                                   │
│   [Create a Room]                 │
│                                   │
└───────────────────────────────────┘
```

### Connection States
- Connected: green dot
- Reconnecting: yellow dot + "Reconnecting..." banner
- Disconnected: red dot + "Connection lost. Retrying..."
- Opponent disconnected: "Waiting for opponent... (30s timeout)"

---

## 11. Sound Design (Brief)

| Event | Sound |
|-------|-------|
| Button click | Soft "pop" (50ms) |
| Tile place | Mechanical "clack" |
| Correct guess | Ascending chime |
| Wrong guess | Low buzz |
| Game win | Victory fanfare (1s) |
| Game lose | Sad trombone (0.5s) |
| Timer warning | Ticking (last 10s) |
| Player join | Doorbell "ding" |
| Chat message | Subtle "blip" |
| Achievement | Sparkle + ding |

- All sounds toggleable (mute button in navbar)
- Volume control in settings
- Sounds loaded lazily, <50KB total

---

## 12. Credits & Branding

### Footer
```
Built with 💜 by Dharaa Singh
```

### About Page
- Brief description of the project
- Tech stack badges
- GitHub link
- Contact info

### Logo
- "PlayArena" with 🎮 icon
- Font: Space Grotesk Bold
- Colors: gradient purple→blue
- Minimal, scalable, works at 24px and 200px
