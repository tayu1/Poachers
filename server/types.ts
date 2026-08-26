import { GameState, PlayerSeat, Team, TurnTimeLimit } from '../src/core/types';
import { NetworkLogEntry, RoomSeatSlot } from '../src/net/events';

export interface ServerPlayer {
  playerId: string;
  name: string;
  socketId: string | null;
  seat: PlayerSeat | null;
  team: Team | null;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
}

export interface ServerRoom {
  roomCode: string;
  hostPlayerId: string;
  seats: Record<PlayerSeat, RoomSeatSlot>;
  players: Map<string, ServerPlayer>;
  gameStarted: boolean;
  status: 'lobby' | 'playing' | 'ended';
  gameState: GameState | null;
  logs: NetworkLogEntry[];
  botTimer: NodeJS.Timeout | null;
  turnTimeout: NodeJS.Timeout | null;
  autoCardPick: boolean;
  isPublic: boolean;
  turnTimeLimit: TurnTimeLimit;
  timerRemainingSeconds?: number;
  timerActiveSeat?: PlayerSeat;
  rematchOffer: { requestedByPlayerId: string; requestedByName: string; acceptedPlayerIds: string[] } | null;
  matchScore: { teamA: number; teamB: number };
  startingSeatIndex: number;
  startingPlayerIds: string[];
}
