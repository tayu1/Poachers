import { GameAction } from '../core/engine';
import { GameState, PlayerSeat, Team, TurnTimeLimit } from '../core/types';

export interface RoomSeatSlot {
  playerId: string | null;
  name: string | null;
  isBot: boolean;
  isReady: boolean;
}

export interface RoomPlayerInfo {
  playerId: string;
  name: string;
  seat: PlayerSeat | null;
  team: Team | null;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
}

export interface PublicRoomSummary {
  roomCode: string;
  hostName: string;
  seatsTaken: number;
}

export interface RoomState {
  roomCode: string;
  hostPlayerId: string;
  seats: Record<PlayerSeat, RoomSeatSlot>;
  players: Record<string, RoomPlayerInfo>;
  gameStarted: boolean;
  status: 'lobby' | 'playing' | 'ended';
  autoCardPick: boolean;
  isPublic: boolean;
  turnTimeLimit: TurnTimeLimit;
}

export interface NetworkLogEntry {
  turnNumber: number;
  seat: 'N' | 'E' | 'S' | 'W';
  text: string;
  pokerText?: string;
  historyIndex: number;
}

export interface RematchOfferState {
  requestedByPlayerId: string;
  requestedByName: string;
  acceptedPlayerIds: string[];
}

// Client to Server Events
export interface ClientToServerEvents {
  create_room: (data: { playerName: string; isPublic?: boolean }, callback?: (res: { success: boolean; roomCode?: string; error?: string }) => void) => void;
  join_room: (data: { roomCode: string; playerName: string; playerId?: string }, callback?: (res: { success: boolean; roomState?: RoomState; playerId?: string; error?: string }) => void) => void;
  leave_room: (data: { roomCode: string; playerId: string }) => void;
  select_seat: (data: { roomCode: string; playerId: string; seat: PlayerSeat | null }, callback?: (res: { success: boolean; error?: string }) => void) => void;
  toggle_bot_seat: (data: { roomCode: string; playerId: string; seat: PlayerSeat }, callback?: (res: { success: boolean; error?: string }) => void) => void;
  toggle_ready: (data: { roomCode: string; playerId: string }, callback?: (res: { success: boolean; error?: string }) => void) => void;
  toggle_public: (data: { roomCode: string; playerId: string }) => void;
  toggle_turn_time_limit: (data: { roomCode: string; playerId: string }) => void;
  toggle_auto_card_pick: (data: { roomCode: string; playerId: string }) => void;
  start_game: (data: { roomCode: string; playerId: string }, callback?: (res: { success: boolean; error?: string }) => void) => void;
  game_action: (data: { roomCode: string; playerId: string; action: GameAction }) => void;
  reconnect_session: (data: { roomCode: string; playerId: string }, callback?: (res: { success: boolean; roomState?: RoomState; gameState?: GameState; logs?: NetworkLogEntry[]; error?: string }) => void) => void;
  reset_match: (data: { roomCode: string; playerId: string }) => void;
  request_rematch: (data: { roomCode: string; playerId: string }) => void;
  accept_rematch: (data: { roomCode: string; playerId: string }) => void;
  get_public_rooms: (callback?: (rooms: PublicRoomSummary[]) => void) => void;
}

// Server to Client Events
export interface ServerToClientEvents {
  session_assigned: (data: { playerId: string }) => void;
  room_state_update: (data: RoomState) => void;
  game_state_update: (data: { gameState: GameState; logs: NetworkLogEntry[] }) => void;
  public_rooms_update: (data: PublicRoomSummary[]) => void;
  rematch_offer_update: (data: RematchOfferState | null) => void;
  timer_tick: (data: { remainingSeconds: number; activeSeat: PlayerSeat }) => void;
  error_message: (data: { message: string }) => void;
}
