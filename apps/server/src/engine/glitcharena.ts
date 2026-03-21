import {
  GlitchArenaGameState,
  GlitchArenaRoundState,
  GlitchArenaPlayer,
  GlitchButton,
  GlitchEffect,
  GlitchArenaRoundResult,
  GlitchArenaFinalResult,
  DEFAULT_GLITCH_ARENA_SETTINGS,
  GLITCH_ARENA_COLORS,
  BUTTON_TYPES,
} from '@playarena/shared';

interface PlayerInfo {
  oddsId: string;
  oddsName: string;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export class GlitchArenaEngine {
  private games: Map<string, GlitchArenaGameState> = new Map();
  private rounds: Map<string, GlitchArenaRoundState> = new Map();
  private tickIntervals: Map<string, NodeJS.Timeout> = new Map();
  private spawnIntervals: Map<string, NodeJS.Timeout> = new Map();
  private accumulatedScores: Map<string, Map<string, number>> = new Map();
  private maxCombos: Map<string, Map<string, number>> = new Map();

  createGame(roomId: string, players: PlayerInfo[]): GlitchArenaGameState {
    const gamePlayers: Record<string, GlitchArenaPlayer> = {};

    players.forEach((player, index) => {
      gamePlayers[player.oddsId] = {
        oddsId: player.oddsId,
        oddsColor: GLITCH_ARENA_COLORS[index % GLITCH_ARENA_COLORS.length],
        oddsScore: 0,
        cursorPosition: { x: DEFAULT_GLITCH_ARENA_SETTINGS.arenaWidth / 2, y: DEFAULT_GLITCH_ARENA_SETTINGS.arenaHeight / 2 },
        hits: 0,
        misses: 0,
        trapsHit: 0,
        comboCount: 0,
        lastHitTime: 0,
        controlsReversed: false,
      };
    });

    const gameState: GlitchArenaGameState = {
      roomId,
      players: gamePlayers,
      currentRound: 0,
      totalRounds: DEFAULT_GLITCH_ARENA_SETTINGS.totalRounds,
      settings: { ...DEFAULT_GLITCH_ARENA_SETTINGS },
    };

    this.games.set(roomId, gameState);
    this.accumulatedScores.set(roomId, new Map());
    this.maxCombos.set(roomId, new Map());

    // Initialize accumulated scores
    const scoreMap = this.accumulatedScores.get(roomId)!;
    const comboMap = this.maxCombos.get(roomId)!;
    players.forEach((p) => {
      scoreMap.set(p.oddsId, 0);
      comboMap.set(p.oddsId, 0);
    });

    return gameState;
  }

  startRound(roomId: string): GlitchArenaRoundState | null {
    const game = this.games.get(roomId);
    if (!game) return null;

    game.currentRound++;

    // Reset player stats for new round
    const roundPlayers: Record<string, GlitchArenaPlayer> = {};
    Object.values(game.players).forEach((player) => {
      roundPlayers[player.oddsId] = {
        ...player,
        oddsScore: 0,
        cursorPosition: { x: game.settings.arenaWidth / 2, y: game.settings.arenaHeight / 2 },
        hits: 0,
        misses: 0,
        trapsHit: 0,
        comboCount: 0,
        lastHitTime: 0,
        controlsReversed: false,
      };
    });

    const now = Date.now();
    const roundState: GlitchArenaRoundState = {
      roomId,
      players: roundPlayers,
      buttons: [],
      activeEffects: [],
      roundStartTime: now,
      roundEndTime: now + game.settings.roundDuration * 1000,
      isActive: false,
      tickCount: 0,
      buttonsSpawned: 0,
    };

    this.rounds.set(roomId, roundState);
    return roundState;
  }

  markRoundActive(roomId: string): void {
    const round = this.rounds.get(roomId);
    if (round) {
      round.isActive = true;
      round.roundStartTime = Date.now();
      const game = this.games.get(roomId);
      round.roundEndTime = round.roundStartTime + (game?.settings.roundDuration ?? 45) * 1000;
    }
  }

  spawnButton(roomId: string): GlitchButton | null {
    const round = this.rounds.get(roomId);
    const game = this.games.get(roomId);
    if (!round || !game || !round.isActive) return null;

    // Check max active buttons
    const activeButtons = round.buttons.filter((b) => !b.hitBy);
    if (activeButtons.length >= game.settings.maxActiveButtons) return null;

    // Determine button type
    const roll = Math.random();
    let cumulative = 0;
    let type: 'normal' | 'bonus' | 'trap' | 'chaos' = 'normal';
    for (const [t, config] of Object.entries(BUTTON_TYPES)) {
      cumulative += config.chance;
      if (roll < cumulative) {
        type = t as 'normal' | 'bonus' | 'trap' | 'chaos';
        break;
      }
    }

    // Calculate points
    let points = game.settings.normalPoints;
    if (type === 'bonus') points = game.settings.bonusPoints;
    else if (type === 'trap') points = -game.settings.trapPenalty;
    else if (type === 'chaos') points = game.settings.bonusPoints;

    // Random position avoiding edges
    const padding = game.settings.buttonBaseRadius + 20;
    const x = padding + Math.random() * (game.settings.arenaWidth - 2 * padding);
    const y = padding + Math.random() * (game.settings.arenaHeight - 2 * padding);

    // Vary size slightly
    const sizeMod = 0.8 + Math.random() * 0.4; // 80% to 120%
    const size = Math.floor(game.settings.buttonBaseRadius * sizeMod);

    const button: GlitchButton = {
      id: generateId(),
      position: { x, y },
      type,
      points,
      spawnTime: Date.now(),
      lifetime: game.settings.buttonLifetime,
      hitBy: null,
      hitTime: null,
      size,
      color: BUTTON_TYPES[type].color,
      symbol: BUTTON_TYPES[type].symbol,
    };

    round.buttons.push(button);
    round.buttonsSpawned++;

    return button;
  }

  clickButton(
    roomId: string,
    playerId: string,
    buttonId: string
  ): { hit: boolean; button?: GlitchButton; points?: number; comboBonus?: number; newCombo?: number; glitchEffect?: GlitchEffect } | null {
    const round = this.rounds.get(roomId);
    const game = this.games.get(roomId);
    if (!round || !game || !round.isActive) return null;

    const player = round.players[playerId];
    if (!player) return null;

    const button = round.buttons.find((b) => b.id === buttonId && !b.hitBy);
    if (!button) return null;

    // Mark as hit
    button.hitBy = playerId;
    button.hitTime = Date.now();

    const now = Date.now();

    // Check combo
    if (now - player.lastHitTime < game.settings.comboTimeout && button.type !== 'trap') {
      player.comboCount++;
    } else if (button.type !== 'trap') {
      player.comboCount = 1;
    }

    player.lastHitTime = now;

    // Track max combo
    const comboMap = this.maxCombos.get(roomId);
    if (comboMap) {
      const current = comboMap.get(playerId) || 0;
      if (player.comboCount > current) {
        comboMap.set(playerId, player.comboCount);
      }
    }

    // Calculate points with combo
    let comboBonus = 0;
    if (button.type !== 'trap' && player.comboCount > 1) {
      comboBonus = Math.floor(button.points * game.settings.comboMultiplier * (player.comboCount - 1));
    }

    const totalPoints = button.points + comboBonus;
    player.oddsScore = Math.max(0, player.oddsScore + totalPoints);

    // Update stats
    if (button.type === 'trap') {
      player.trapsHit++;
      player.comboCount = 0; // Break combo on trap
    } else {
      player.hits++;
    }

    // Maybe trigger glitch effect from chaos button
    let glitchEffect: GlitchEffect | undefined;
    if (button.type === 'chaos' && Math.random() < game.settings.glitchChance * 3) {
      glitchEffect = this.createGlitchEffect(roomId);
      if (glitchEffect) {
        round.activeEffects.push(glitchEffect);
      }
    }

    return {
      hit: true,
      button,
      points: button.points,
      comboBonus,
      newCombo: player.comboCount,
      glitchEffect,
    };
  }

  createGlitchEffect(roomId: string): GlitchEffect | undefined {
    const effects: GlitchEffect['type'][] = ['shake', 'invert', 'blur', 'flash'];
    const type = effects[Math.floor(Math.random() * effects.length)];

    const durations: Record<GlitchEffect['type'], number> = {
      shake: 1000,
      invert: 2000,
      blur: 1500,
      teleport: 0,
      reverse: 3000,
      flash: 300,
    };

    return {
      type,
      duration: durations[type],
      startTime: Date.now(),
      affectsAll: true,
    };
  }

  tick(roomId: string): { 
    state: GlitchArenaRoundState; 
    timeRemaining: number; 
    expiredButtons: string[];
    roundOver: boolean;
    randomGlitch?: GlitchEffect;
  } | null {
    const round = this.rounds.get(roomId);
    const game = this.games.get(roomId);
    if (!round || !game || !round.isActive) return null;

    round.tickCount++;
    const now = Date.now();

    // Check for expired buttons
    const expiredButtons: string[] = [];
    round.buttons = round.buttons.filter((button) => {
      if (button.hitBy) return true; // Keep hit buttons for reference
      if (now - button.spawnTime > button.lifetime) {
        expiredButtons.push(button.id);
        return false;
      }
      return true;
    });

    // Clean up expired effects
    round.activeEffects = round.activeEffects.filter(
      (effect) => now - effect.startTime < effect.duration
    );

    // Random glitch chance
    let randomGlitch: GlitchEffect | undefined;
    if (Math.random() < game.settings.glitchChance / 20) { // Low chance per tick
      randomGlitch = this.createGlitchEffect(roomId);
      if (randomGlitch) {
        round.activeEffects.push(randomGlitch);
      }
    }

    const timeRemaining = Math.max(0, Math.floor((round.roundEndTime - now) / 1000));
    const roundOver = now >= round.roundEndTime;

    return {
      state: round,
      timeRemaining,
      expiredButtons,
      roundOver,
      randomGlitch,
    };
  }

  updateCursorPosition(roomId: string, playerId: string, position: { x: number; y: number }): void {
    const round = this.rounds.get(roomId);
    if (!round || !round.players[playerId]) return;
    round.players[playerId].cursorPosition = position;
  }

  startTick(roomId: string, callback: (result: ReturnType<GlitchArenaEngine['tick']>) => void): void {
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

  startSpawning(roomId: string, onSpawn: (button: GlitchButton) => void): void {
    const game = this.games.get(roomId);
    if (!game) return;

    this.stopSpawning(roomId);

    // Spawn first button immediately
    const firstButton = this.spawnButton(roomId);
    if (firstButton) {
      onSpawn(firstButton);
    }

    const interval = setInterval(() => {
      const round = this.rounds.get(roomId);
      if (!round || !round.isActive) {
        this.stopSpawning(roomId);
        return;
      }

      const button = this.spawnButton(roomId);
      if (button) {
        onSpawn(button);
      }
    }, game.settings.buttonSpawnInterval);

    this.spawnIntervals.set(roomId, interval);
  }

  stopSpawning(roomId: string): void {
    const interval = this.spawnIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.spawnIntervals.delete(roomId);
    }
  }

  endRound(roomId: string): GlitchArenaRoundResult[] | null {
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

    // Get max combos
    const comboMap = this.maxCombos.get(roomId)!;

    // Calculate results
    const results: GlitchArenaRoundResult[] = Object.values(round.players)
      .map((player) => ({
        oddsId: player.oddsId,
        oddsScore: player.oddsScore,
        hits: player.hits,
        misses: player.misses,
        trapsHit: player.trapsHit,
        maxCombo: comboMap.get(player.oddsId) || 0,
      }))
      .sort((a, b) => b.oddsScore - a.oddsScore);

    return results;
  }

  isGameOver(roomId: string): boolean {
    const game = this.games.get(roomId);
    if (!game) return true;
    return game.currentRound >= game.totalRounds;
  }

  getFinalRankings(roomId: string): GlitchArenaFinalResult[] | null {
    const game = this.games.get(roomId);
    const scoreMap = this.accumulatedScores.get(roomId);
    const comboMap = this.maxCombos.get(roomId);
    if (!game || !scoreMap || !comboMap) return null;

    const results: GlitchArenaFinalResult[] = Object.values(game.players)
      .map((player) => ({
        oddsId: player.oddsId,
        oddsColor: player.oddsColor,
        totalScore: scoreMap.get(player.oddsId) || 0,
        totalHits: player.hits,
        totalTraps: player.trapsHit,
        bestCombo: comboMap.get(player.oddsId) || 0,
        rank: 0,
      }))
      .sort((a, b) => b.totalScore - a.totalScore);

    results.forEach((r, i) => (r.rank = i + 1));

    return results;
  }

  getGameState(roomId: string): GlitchArenaGameState | null {
    return this.games.get(roomId) || null;
  }

  getRoundState(roomId: string): GlitchArenaRoundState | null {
    return this.rounds.get(roomId) || null;
  }

  cleanup(roomId: string): void {
    this.stopTick(roomId);
    this.stopSpawning(roomId);
    this.games.delete(roomId);
    this.rounds.delete(roomId);
    this.accumulatedScores.delete(roomId);
    this.maxCombos.delete(roomId);
  }
}
