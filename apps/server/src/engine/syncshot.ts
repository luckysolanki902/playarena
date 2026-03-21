import {
  SyncShotGameState,
  SyncShotRoundState,
  SyncShotPlayer,
  SyncShotTarget,
  SyncShotPosition,
  SyncShotRoundResult,
  SyncShotFinalResult,
  SyncShotSettings,
  DEFAULT_SYNCSHOT_SETTINGS,
  SYNCSHOT_COLORS,
} from '@playarena/shared';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

interface PlayerInfo {
  oddsId: string;
  oddsName: string;
}

export class SyncShotEngine {
  private games: Map<string, SyncShotGameState> = new Map();
  private rounds: Map<string, SyncShotRoundState> = new Map();
  private tickIntervals: Map<string, NodeJS.Timeout> = new Map();
  private spawnIntervals: Map<string, NodeJS.Timeout> = new Map();
  private accumulatedScores: Map<string, Map<string, number>> = new Map();

  createGame(roomId: string, players: PlayerInfo[]): SyncShotGameState {
    const gamePlayers: Record<string, SyncShotPlayer> = {};

    players.forEach((player, index) => {
      gamePlayers[player.oddsId] = {
        oddsId: player.oddsId,
        oddsColor: SYNCSHOT_COLORS[index % SYNCSHOT_COLORS.length],
        oddsScore: 0,
        cursorPosition: { x: DEFAULT_SYNCSHOT_SETTINGS.arenaWidth / 2, y: DEFAULT_SYNCSHOT_SETTINGS.arenaHeight / 2 },
        shotCooldown: 0,
        hits: 0,
        misses: 0,
        eliminated: false,
      };
    });

    const gameState: SyncShotGameState = {
      roomId,
      players: gamePlayers,
      currentRound: 0,
      totalRounds: DEFAULT_SYNCSHOT_SETTINGS.totalRounds,
      settings: { ...DEFAULT_SYNCSHOT_SETTINGS },
    };

    this.games.set(roomId, gameState);
    this.accumulatedScores.set(roomId, new Map());

    // Initialize accumulated scores
    const scoreMap = this.accumulatedScores.get(roomId)!;
    players.forEach((p) => scoreMap.set(p.oddsId, 0));

    return gameState;
  }

  startRound(roomId: string): SyncShotRoundState | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    game.currentRound++;

    // Reset player stats for new round
    const roundPlayers: Record<string, SyncShotPlayer> = {};
    Object.values(game.players).forEach((player) => {
      roundPlayers[player.oddsId] = {
        ...player,
        oddsScore: 0,
        cursorPosition: { x: game.settings.arenaWidth / 2, y: game.settings.arenaHeight / 2 },
        shotCooldown: 0,
        hits: 0,
        misses: 0,
        eliminated: false,
      };
    });

    const roundState: SyncShotRoundState = {
      roomId,
      players: roundPlayers,
      targets: [],
      activeTarget: null,
      targetsSpawned: 0,
      targetsHit: 0,
      roundStartTime: Date.now(),
      isActive: false,
      tickCount: 0,
    };

    this.rounds.set(roomId, roundState);
    return roundState;
  }

  markRoundActive(roomId: string): void {
    const round = this.rounds.get(roomId);
    if (round) {
      round.isActive = true;
      round.roundStartTime = Date.now();
    }
  }

  spawnTarget(roomId: string): SyncShotTarget | null {
    const round = this.rounds.get(roomId);
    const game = this.games.get(roomId);
    if (!round || !game || !round.isActive) return null;

    if (round.targetsSpawned >= game.settings.targetsPerRound) {
      return null;
    }

    // Random radius within range
    const radius = game.settings.targetMinRadius + 
      Math.random() * (game.settings.targetMaxRadius - game.settings.targetMinRadius);

    // Random position avoiding edges
    const padding = radius + 10;
    const x = padding + Math.random() * (game.settings.arenaWidth - 2 * padding);
    const y = padding + Math.random() * (game.settings.arenaHeight - 2 * padding);

    const target: SyncShotTarget = {
      id: generateId(),
      position: { x, y },
      radius,
      spawnTime: Date.now(),
      hitBy: null,
      hitTime: null,
    };

    round.activeTarget = target;
    round.targets.push(target);
    round.targetsSpawned++;

    return target;
  }

  updateCursorPosition(roomId: string, playerId: string, position: SyncShotPosition): void {
    const round = this.rounds.get(roomId);
    if (!round || !round.players[playerId]) return;

    round.players[playerId].cursorPosition = position;
  }

  shoot(
    roomId: string,
    playerId: string,
    clickPosition: SyncShotPosition
  ): { hit: boolean; target?: SyncShotTarget; points?: number; speedBonus?: number; accuracyBonus?: number } | null {
    const round = this.rounds.get(roomId);
    const game = this.games.get(roomId);
    if (!round || !game || !round.isActive) return null;

    const player = round.players[playerId];
    if (!player || player.shotCooldown > 0) return null;

    // Apply cooldown
    player.shotCooldown = game.settings.shotCooldownTicks;

    // Check if there's an active target
    if (!round.activeTarget || round.activeTarget.hitBy) {
      // Miss - no target to hit
      player.misses++;
      player.oddsScore = Math.max(0, player.oddsScore - game.settings.missPenalty);
      return { hit: false };
    }

    const target = round.activeTarget;
    const dx = clickPosition.x - target.position.x;
    const dy = clickPosition.y - target.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= target.radius) {
      // Hit!
      const hitTime = Date.now();
      const reactionTime = hitTime - target.spawnTime;
      
      // Speed bonus: faster hits get more bonus (max bonus at 0ms, 0 bonus at 1000ms)
      const speedBonus = Math.max(0, Math.floor(game.settings.speedBonusMax * (1 - reactionTime / 1000)));
      
      // Accuracy bonus: closer to center = more points (100% at center, 0% at edge)
      const accuracyRatio = 1 - (distance / target.radius);
      const accuracyBonus = Math.floor(game.settings.accuracyBonusMax * accuracyRatio);
      
      const points = game.settings.hitPoints + speedBonus + accuracyBonus;

      target.hitBy = playerId;
      target.hitTime = hitTime;
      round.activeTarget = null;
      round.targetsHit++;

      player.hits++;
      player.oddsScore += points;

      return { hit: true, target, points: game.settings.hitPoints, speedBonus, accuracyBonus };
    } else {
      // Miss
      player.misses++;
      player.oddsScore = Math.max(0, player.oddsScore - game.settings.missPenalty);
      return { hit: false };
    }
  }

  tick(roomId: string): SyncShotRoundState | null {
    const round = this.rounds.get(roomId);
    const game = this.games.get(roomId);
    if (!round || !game || !round.isActive) return null;

    round.tickCount++;

    // Decrease cooldowns
    Object.values(round.players).forEach((player) => {
      if (player.shotCooldown > 0) {
        player.shotCooldown--;
      }
    });

    return round;
  }

  isRoundComplete(roomId: string): boolean {
    const round = this.rounds.get(roomId);
    const game = this.games.get(roomId);
    if (!round || !game) return false;

    return round.targetsHit >= game.settings.targetsPerRound || 
           round.targetsSpawned >= game.settings.targetsPerRound && !round.activeTarget;
  }

  startTick(roomId: string, callback: (state: SyncShotRoundState) => void): void {
    const game = this.games.get(roomId);
    if (!game) return;

    this.stopTick(roomId);

    const interval = setInterval(() => {
      const state = this.tick(roomId);
      if (state) {
        callback(state);
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

  startSpawning(
    roomId: string,
    onSpawn: (target: SyncShotTarget) => void,
    onRoundComplete: () => void
  ): void {
    const game = this.games.get(roomId);
    if (!game) return;

    this.stopSpawning(roomId);

    // Spawn first target immediately
    const firstTarget = this.spawnTarget(roomId);
    if (firstTarget) {
      onSpawn(firstTarget);
    }

    const interval = setInterval(() => {
      const round = this.rounds.get(roomId);
      if (!round || !round.isActive) {
        this.stopSpawning(roomId);
        return;
      }

      // Check if round is complete
      if (this.isRoundComplete(roomId)) {
        this.stopSpawning(roomId);
        onRoundComplete();
        return;
      }

      // Only spawn if no active target (previous was hit or we need new one)
      if (!round.activeTarget) {
        const target = this.spawnTarget(roomId);
        if (target) {
          onSpawn(target);
        } else {
          // No more targets to spawn
          this.stopSpawning(roomId);
          onRoundComplete();
        }
      }
    }, game.settings.targetSpawnInterval);

    this.spawnIntervals.set(roomId, interval);
  }

  stopSpawning(roomId: string): void {
    const interval = this.spawnIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.spawnIntervals.delete(roomId);
    }
  }

  endRound(roomId: string): SyncShotRoundResult[] | null {
    const round = this.rounds.get(roomId);
    const game = this.games.get(roomId);
    if (!round || !game) return null;

    this.stopTick(roomId);
    this.stopSpawning(roomId);
    round.isActive = false;

    // Accumulate scores
    const scoreMap = this.accumulatedScores.get(roomId)!;
    Object.values(round.players).forEach((player) => {
      const current = scoreMap.get(player.oddsId) || 0;
      scoreMap.set(player.oddsId, current + player.oddsScore);
    });

    // Calculate results
    const results: SyncShotRoundResult[] = Object.values(round.players)
      .map((player) => ({
        oddsId: player.oddsId,
        oddsScore: player.oddsScore,
        hits: player.hits,
        misses: player.misses,
        accuracy: player.hits + player.misses > 0 
          ? Math.round((player.hits / (player.hits + player.misses)) * 100) 
          : 0,
      }))
      .sort((a, b) => b.oddsScore - a.oddsScore);

    return results;
  }

  isGameOver(roomId: string): boolean {
    const game = this.games.get(roomId);
    if (!game) return true;
    return game.currentRound >= game.totalRounds;
  }

  getFinalRankings(roomId: string): SyncShotFinalResult[] | null {
    const game = this.games.get(roomId);
    const scoreMap = this.accumulatedScores.get(roomId);
    if (!game || !scoreMap) return null;

    // Calculate total stats across all rounds
    const playerStats: Record<string, { hits: number; misses: number }> = {};
    Object.keys(game.players).forEach((id) => {
      playerStats[id] = { hits: 0, misses: 0 };
    });

    // Sum up from all completed rounds
    const results: SyncShotFinalResult[] = Object.values(game.players)
      .map((player) => {
        const totalScore = scoreMap.get(player.oddsId) || 0;
        // We don't have historical stats, so just use current round's
        const round = this.rounds.get(roomId);
        const roundPlayer = round?.players[player.oddsId];
        const totalHits = roundPlayer?.hits || 0;
        const totalMisses = roundPlayer?.misses || 0;

        return {
          oddsId: player.oddsId,
          oddsColor: player.oddsColor,
          totalScore,
          totalHits,
          totalMisses,
          accuracy: totalHits + totalMisses > 0 
            ? Math.round((totalHits / (totalHits + totalMisses)) * 100) 
            : 0,
          rank: 0,
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);

    results.forEach((r, i) => (r.rank = i + 1));

    return results;
  }

  getGameState(roomId: string): SyncShotGameState | null {
    return this.games.get(roomId) || null;
  }

  getRoundState(roomId: string): SyncShotRoundState | null {
    return this.rounds.get(roomId) || null;
  }

  cleanup(roomId: string): void {
    this.stopTick(roomId);
    this.stopSpawning(roomId);
    this.games.delete(roomId);
    this.rounds.delete(roomId);
    this.accumulatedScores.delete(roomId);
  }
}
