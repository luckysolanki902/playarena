const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;
const RESERVED_NAMES = new Set([
  'admin', 'system', 'bot', 'playarena', 'spyllio', 'mod', 'moderator',
  'server', 'null', 'undefined',
]);

export function validateUsername(name: string): { ok: true } | { ok: false; error: string } {
  const trimmed = name.trim();
  if (!USERNAME_RE.test(trimmed)) {
    return { ok: false, error: 'Must be 3-16 alphanumeric characters or underscores' };
  }
  if (RESERVED_NAMES.has(trimmed.toLowerCase())) {
    return { ok: false, error: 'This username is reserved' };
  }
  return { ok: true };
}

export function validateRoomName(name: string): { ok: true } | { ok: false; error: string } {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 32) {
    return { ok: false, error: 'Room name must be 1-32 characters' };
  }
  return { ok: true };
}

export function validateChatMessage(text: string): { ok: true } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    return { ok: false, error: 'Message must be 1-200 characters' };
  }
  return { ok: true };
}

export function sanitizeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function generateId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 14);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}${rand}`;
}
