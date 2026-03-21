import type { Room, RoomPlayer, RoomStatus } from '@playarena/shared';
import { generateId, generateRoomCode } from '@playarena/shared';

export class RoomStore {
  private rooms = new Map<string, Room>();
  private codeIndex = new Map<string, string>(); // code → roomId
  private pendingDeletion = new Map<string, ReturnType<typeof setTimeout>>();

  create(opts: {
    game: Room['game'];
    name: string;
    visibility: Room['visibility'];
    maxPlayers: number;
    hostSessionId: string;
    hostUsername: string;
  }): Room {
    const id = generateId('room');
    const code = opts.visibility === 'private' ? generateRoomCode() : null;

    const room: Room = {
      id,
      game: opts.game,
      name: opts.name,
      visibility: opts.visibility,
      status: 'waiting',
      code,
      hostSessionId: opts.hostSessionId,
      maxPlayers: opts.maxPlayers,
      players: [
        {
          sessionId: opts.hostSessionId,
          username: opts.hostUsername,
          isHost: true,
          joinedAt: Date.now(),
        },
      ],
      createdAt: Date.now(),
    };

    this.rooms.set(id, room);
    if (code) this.codeIndex.set(code, id);
    return room;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getByCode(code: string): Room | undefined {
    const roomId = this.codeIndex.get(code.toUpperCase());
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  listPublic(game?: string): Room[] {
    const rooms: Room[] = [];
    for (const room of this.rooms.values()) {
      if (room.visibility !== 'public') continue;
      if (game && room.game !== game) continue;
      if (room.status === 'finished') continue;
      rooms.push(room);
    }
    return rooms;
  }

  addPlayer(roomId: string, player: RoomPlayer): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.players.length >= room.maxPlayers) return false;
    if (room.status !== 'waiting') return false;
    if (room.players.some((p) => p.sessionId === player.sessionId)) return false;
    // Cancel any scheduled deletion when a player joins
    const pending = this.pendingDeletion.get(roomId);
    if (pending) { clearTimeout(pending); this.pendingDeletion.delete(roomId); }
    room.players.push(player);
    return true;
  }

  removePlayer(roomId: string, sessionId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const idx = room.players.findIndex((p) => p.sessionId === sessionId);
    if (idx === -1) return false;
    room.players.splice(idx, 1);

    // If room is empty, schedule deletion after 30s (grace period for reconnects)
    if (room.players.length === 0) {
      const timer = setTimeout(() => {
        const r = this.rooms.get(roomId);
        if (r && r.players.length === 0) {
          if (r.code) this.codeIndex.delete(r.code);
          this.rooms.delete(roomId);
        }
        this.pendingDeletion.delete(roomId);
      }, 30_000);
      this.pendingDeletion.set(roomId, timer);
      return true;
    }

    // If host left, promote next player
    if (sessionId === room.hostSessionId) {
      room.hostSessionId = room.players[0].sessionId;
      room.players[0].isHost = true;
    }
    return true;
  }

  setStatus(roomId: string, status: RoomStatus): void {
    const room = this.rooms.get(roomId);
    if (room) room.status = status;
  }

  delete(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      const pending = this.pendingDeletion.get(roomId);
      if (pending) { clearTimeout(pending); this.pendingDeletion.delete(roomId); }
      if (room.code) this.codeIndex.delete(room.code);
      this.rooms.delete(roomId);
    }
  }

  get activeCount(): number {
    return this.rooms.size;
  }
}
