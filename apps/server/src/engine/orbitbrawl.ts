import {
  OrbitBrawlGameState,
  OrbitBrawlRoundState,
  OrbitPlayer,
  OrbitPosition,
  OrbitBrawlRoundResult,
  OrbitBrawlFinalResult,
  DEFAULT_ORBIT_BRAWL_SETTINGS,
  ORBIT_BRAWL_COLORS,
} from '@playarena/shared';

interface PlayerInfo {
  oddsId: string;
  oddsName: string;
}

export class OrbitBrawlEngine {
  private games: Map<string, OrbitBrawlGameState> = new Map();
  private rounds: Map<string, OrbitBrawlRoundState> = new Map();
  private tickIntervals: Map<string, NodeJS.Timeout> = new Map();
  private accumulatedScores: Map<string, Map<string, number>> = new Map();
  private totalEliminations: Map<string, Map<string, number>> = new Map();
  private wins: Map<string, Map<string, number>> = new Map();
  private lastPusher: Map<string, Map<string, string>> = new Map(); // Track who last pushed each player

  createGame(roomId: string, players: PlayerInfo[]): OrbitBrawlGameState {
    const gamePlayers: Record<string, OrbitPlayer> = {};
    const settings = DEFAULT_ORBIT_BRAWL_SETTINGS;

    // Spawn players in a circle around the center
    const angleStep = (2 * Math.PI) / players.length;
    const spawnRadius = settings.arenaRadius * 0.6;

    players.forEach((player, index) => {
      const angle = angleStep * index;
      const x = settings.arenaCenter.x + Math.cos(angle) * spawnRadius;
      const y = settings.arenaCenter.y + Math.sin(angle) * spawnRadius;

      gamePlayers[player.oddsId] = {
        oddsId: player.oddsId,
        oddsColor: ORBIT_BRAWL_COLORS[index % ORBIT_BRAWL_COLORS.length],
        oddsScore: 0,
        position: { x, y },
        velocity: { vx: 0, vy: 0 },
        radius: settings.playerRadius,
        mass: settings.playerMass,
        isCharging: false,
        chargeStartTime: 0,
        chargePower: 0,
        chargeType: null,
        cooldown: 0,
        alive: true,
        eliminatedAt: null,
        eliminations: 0,
      };
    });

    const gameState: OrbitBrawlGameState = {
      roomId,
      players: gamePlayers,
      currentRound: 0,
      totalRounds: settings.totalRounds,
      settings,
    };

    this.games.set(roomId, gameState);
    this.accumulatedScores.set(roomId, new Map());
    this.totalEliminations.set(roomId, new Map());
    this.wins.set(roomId, new Map());
    this.lastPusher.set(roomId, new Map());

    const scoreMap = this.accumulatedScores.get(roomId)!;
    const elimMap = this.totalEliminations.get(roomId)!;
    const winMap = this.wins.get(roomId)!;
    players.forEach((p) => {
      scoreMap.set(p.oddsId, 0);
      elimMap.set(p.oddsId, 0);
      winMap.set(p.oddsId, 0);
    });

    return gameState;
  }

  startRound(roomId: string): OrbitBrawlRoundState | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    game.currentRound++;

    // Reset player positions in a circle
    const angleStep = (2 * Math.PI) / Object.keys(game.players).length;
    const spawnRadius = game.settings.arenaRadius * 0.6;

    const roundPlayers: Record<string, OrbitPlayer> = {};
    Object.values(game.players).forEach((player, index) => {
      const angle = angleStep * index;
      const x = game.settings.arenaCenter.x + Math.cos(angle) * spawnRadius;
      const y = game.settings.arenaCenter.y + Math.sin(angle) * spawnRadius;

      roundPlayers[player.oddsId] = {
        ...player,
        oddsScore: 0,
        position: { x, y },
        velocity: { vx: 0, vy: 0 },
        isCharging: false,
        chargeStartTime: 0,
        chargePower: 0,
        chargeType: null,
        cooldown: 0,
        alive: true,
        eliminatedAt: null,
        eliminations: 0,
      };
    });

    const roundState: OrbitBrawlRoundState = {
      roomId,
      players: roundPlayers,
      roundStartTime: Date.now(),
      isActive: false,
      tickCount: 0,
      alivePlayers: Object.keys(roundPlayers).length,
    };

    this.rounds.set(roomId, roundState);
    
    // Reset last pusher tracking
    const pusherMap = this.lastPusher.get(roomId);
    if (pusherMap) pusherMap.clear();

    return roundState;
  }

  markRoundActive(roomId: string): void {
    const round = this.rounds.get(roomId);
    if (round) {
      round.isActive = true;
      round.roundStartTime = Date.now();
    }
  }

  startCharge(roomId: string, playerId: string, chargeType: 'push' | 'pull'): boolean {
    const round = this.rounds.get(roomId);
    if (!round || !round.isActive) return false;

    const player = round.players[playerId];
    if (!player || !player.alive || player.cooldown > 0 || player.isCharging) return false;

    player.isCharging = true;
    player.chargeStartTime = Date.now();
    player.chargePower = 0;
    player.chargeType = chargeType;

    return true;
  }

  releaseCharge(roomId: string, playerId: string): { power: number; radius: number; affectedPlayers: string[] } | null {
    const round = this.rounds.get(roomId);
    const game = this.games.get(roomId);
    if (!round || !game || !round.isActive) return null;

    const player = round.players[playerId];
    if (!player || !player.alive || !player.isCharging) return null;

    const power = player.chargePower;
    const chargeType = player.chargeType;

    // Reset charge state
    player.isCharging = false;
    player.chargeStartTime = 0;
    player.chargePower = 0;
    player.chargeType = null;
    player.cooldown = game.settings.cooldownTicks;

    if (power < 0.1 || !chargeType) return null;

    // Calculate effect radius based on power
    const baseRadius = chargeType === 'push' ? game.settings.pushRadius : game.settings.pullRadius;
    const radius = baseRadius * power;
    const force = chargeType === 'push' ? game.settings.pushForce : game.settings.pullForce;

    // Apply force to nearby players
    const affectedPlayers: string[] = [];
    const pusherMap = this.lastPusher.get(roomId);

    Object.values(round.players).forEach((target) => {
      if (target.oddsId === playerId || !target.alive) return;

      const dx = target.position.x - player.position.x;
      const dy = target.position.y - player.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius && dist > 0) {
        // Calculate force direction
        const nx = dx / dist;
        const ny = dy / dist;

        // Force falloff based on distance
        const falloff = 1 - (dist / radius);
        const appliedForce = force * power * falloff;

        if (chargeType === 'push') {
          target.velocity.vx += nx * appliedForce;
          target.velocity.vy += ny * appliedForce;
          // Track who pushed this player (for elimination credit)
          if (pusherMap) pusherMap.set(target.oddsId, playerId);
        } else {
          target.velocity.vx -= nx * appliedForce * 0.6; // Pull is weaker
          target.velocity.vy -= ny * appliedForce * 0.6;
        }

        affectedPlayers.push(target.oddsId);
      }
    });

    return { power, radius, affectedPlayers };
  }

  tick(roomId: string): { 
    state: OrbitBrawlRoundState; 
    eliminated: { playerId: string; eliminatedBy: string | null; position: OrbitPosition }[];
    roundOver: boolean;
  } | null {
    const round = this.rounds.get(roomId);
    const game = this.games.get(roomId);
    if (!round || !game || !round.isActive) return null;

    round.tickCount++;
    const eliminated: { playerId: string; eliminatedBy: string | null; position: OrbitPosition }[] = [];
    const pusherMap = this.lastPusher.get(roomId);

    Object.values(round.players).forEach((player) => {
      if (!player.alive) return;

      // Update charge power if charging
      if (player.isCharging) {
        player.chargePower = Math.min(
          game.settings.maxChargePower,
          player.chargePower + game.settings.chargeRate
        );
      }

      // Decrease cooldown
      if (player.cooldown > 0) {
        player.cooldown--;
      }

      // Apply friction
      player.velocity.vx *= game.settings.friction;
      player.velocity.vy *= game.settings.friction;

      // Clamp speed
      const speed = Math.sqrt(player.velocity.vx ** 2 + player.velocity.vy ** 2);
      if (speed > game.settings.maxSpeed) {
        const scale = game.settings.maxSpeed / speed;
        player.velocity.vx *= scale;
        player.velocity.vy *= scale;
      }

      // Update position
      player.position.x += player.velocity.vx;
      player.position.y += player.velocity.vy;

      // Check if out of arena
      const dx = player.position.x - game.settings.arenaCenter.x;
      const dy = player.position.y - game.settings.arenaCenter.y;
      const distFromCenter = Math.sqrt(dx * dx + dy * dy);

      if (distFromCenter > game.settings.arenaRadius - player.radius) {
        // Eliminated!
        player.alive = false;
        player.eliminatedAt = Date.now();
        round.alivePlayers--;

        // Credit elimination to last pusher
        const lastPusherOfThis = pusherMap?.get(player.oddsId);
        if (lastPusherOfThis && round.players[lastPusherOfThis]) {
          round.players[lastPusherOfThis].eliminations++;
        }

        eliminated.push({
          playerId: player.oddsId,
          eliminatedBy: lastPusherOfThis || null,
          position: { ...player.position },
        });
      }
    });

    // Check for round over (1 or 0 players left)
    const roundOver = round.alivePlayers <= 1;

    return { state: round, eliminated, roundOver };
  }

  startTick(roomId: string, callback: (result: ReturnType<OrbitBrawlEngine['tick']>) => void): void {
    const game = this.games.get(roomId);
    if (!game) return;

    this.stopTick(roomId);

    const interval = setInterval(() => {
      const result = this.tick(roomId);
      if (result) {
        callback(result);
      }
    }, game.settings.tickRate);

    this.tickIntervals.set(roomId, interval);
  }

  stopTick(roomId: string): void {
    const interval = this.tickIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.tickIntervals.delete(roomId);
    }
  }

  endRound(roomId: string): OrbitBrawlRoundResult[] | null {
    const round = this.rounds.get(roomId);
    const game = this.games.get(roomId);
    if (!round || !game) return null;

    this.stopTick(roomId);
    round.isActive = false;

    // Calculate rankings and scores
    const scoreMap = this.accumulatedScores.get(roomId)!;
    const elimMap = this.totalEliminations.get(roomId)!;
    const winMap = this.wins.get(roomId)!;

    // Sort by survival (alive first, then by elimination time desc)
    const sortedPlayers = Object.values(round.players).sort((a, b) => {
      if (a.alive && !b.alive) return -1;
      if (!a.alive && b.alive) return 1;
      if (!a.alive && !b.alive) {
        return (b.eliminatedAt || 0) - (a.eliminatedAt || 0);
      }
      return 0;
    });

    const results: OrbitBrawlRoundResult[] = sortedPlayers.map((player, index) => {
      const position = index + 1;
      let score = 0;

      // Survival points (winner gets most, scales down)
      if (player.alive) {
        score = game.settings.survivalPoints;
        // Credit a win
        winMap.set(player.oddsId, (winMap.get(player.oddsId) || 0) + 1);
      } else {
        // Points based on position
        const maxPlayers = Object.keys(round.players).length;
        score = Math.floor(game.settings.survivalPoints * (maxPlayers - position) / maxPlayers);
      }

      // Elimination bonus
      score += player.eliminations * game.settings.eliminationPoints;

      // Accumulate
      scoreMap.set(player.oddsId, (scoreMap.get(player.oddsId) || 0) + score);
      elimMap.set(player.oddsId, (elimMap.get(player.oddsId) || 0) + player.eliminations);

      return {
        oddsId: player.oddsId,
        oddsScore: score,
        position,
        eliminations: player.eliminations,
        survived: player.alive,
      };
    });

    return results;
  }

  isGameOver(roomId: string): boolean {
    const game = this.games.get(roomId);
    if (!game) return true;
    return game.currentRound >= game.totalRounds;
  }

  getFinalRankings(roomId: string): OrbitBrawlFinalResult[] | null {
    const game = this.games.get(roomId);
    const scoreMap = this.accumulatedScores.get(roomId);
    const elimMap = this.totalEliminations.get(roomId);
    const winMap = this.wins.get(roomId);
    if (!game || !scoreMap || !elimMap || !winMap) return null;

    const results: OrbitBrawlFinalResult[] = Object.values(game.players)
      .map((player) => ({
        oddsId: player.oddsId,
        oddsColor: player.oddsColor,
        totalScore: scoreMap.get(player.oddsId) || 0,
        totalEliminations: elimMap.get(player.oddsId) || 0,
        wins: winMap.get(player.oddsId) || 0,
        rank: 0,
      }))
      .sort((a, b) => b.totalScore - a.totalScore);

    results.forEach((r, i) => (r.rank = i + 1));

    return results;
  }

  getGameState(roomId: string): OrbitBrawlGameState | null {
    return this.games.get(roomId) || null;
  }

  getRoundState(roomId: string): OrbitBrawlRoundState | null {
    return this.rounds.get(roomId) || null;
  }

  cleanup(roomId: string): void {
    this.stopTick(roomId);
    this.games.delete(roomId);
    this.rounds.delete(roomId);
    this.accumulatedScores.delete(roomId);
    this.totalEliminations.delete(roomId);
    this.wins.delete(roomId);
    this.lastPusher.delete(roomId);
  }
}
