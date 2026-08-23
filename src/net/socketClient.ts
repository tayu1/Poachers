import { io, Socket } from 'socket.io-client';

import { GameAction } from '../core/engine';
import { PlayerSeat } from '../core/types';
import { store } from '../store/store';
import { ClientToServerEvents, PublicRoomSummary, RoomState, ServerToClientEvents } from './events';

function getStorageItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
}

function removeStorageItem(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {}
}

class SocketClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private serverUrl: string = 'http://localhost:3001';
  public publicRooms: PublicRoomSummary[] = [];
  private publicRoomSubscribers: Set<(rooms: PublicRoomSummary[]) => void> = new Set();

  constructor() {
    const storedId = getStorageItem('poachers_player_id');
    if (storedId) {
      store.setMyPlayerId(storedId);
    }
  }

  public subscribePublicRooms(callback: (rooms: PublicRoomSummary[]) => void): () => void {
    this.publicRoomSubscribers.add(callback);
    callback(this.publicRooms);
    return () => this.publicRoomSubscribers.delete(callback);
  }

  public fetchPublicRooms(): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('get_public_rooms', (rooms) => {
        if (rooms) {
          this.publicRooms = rooms;
          for (const sub of this.publicRoomSubscribers) sub(rooms);
        }
      });
    }
  }

  public connect(): void {
    if (this.socket && this.socket.connected) return;

    if (!this.socket) {
      const isOtherDevPort = typeof window !== 'undefined' && window.location.port !== '3001' && window.location.port !== '';
      const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      this.serverUrl = isOtherDevPort
        ? `${protocol}//${hostname}:3001`
        : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

      this.socket = io(this.serverUrl, {
        autoConnect: true,
        transports: ['websocket', 'polling'],
        timeout: 5000
      });

      this.socket.on('connect', () => {
        console.log('[Net] Connected to server socket:', this.socket?.id);
        store.setNetError(null);
        this.fetchPublicRooms();
        this.attemptAutoReconnect();
      });

      this.socket.on('connect_error', (err) => {
        console.warn('[Net] Socket connection error:', err.message);
        store.setNetError('Cannot connect to game server. Please ensure the server is running.');
      });

      this.socket.on('session_assigned', ({ playerId }) => {
        setStorageItem('poachers_player_id', playerId);
        store.setMyPlayerId(playerId);
      });

      this.socket.on('room_state_update', (roomState: RoomState) => {
        store.setRoomState(roomState);
      });

      this.socket.on('game_state_update', ({ gameState, logs }) => {
        store.applyServerGameState(gameState, logs);
      });

      this.socket.on('timer_tick', ({ remainingSeconds, activeSeat }) => {
        store.updateTimerState(remainingSeconds, activeSeat);
      });

      this.socket.on('rematch_offer_update', (offer) => {
        store.setRematchOffer(offer);
      });

      this.socket.on('public_rooms_update', (rooms: PublicRoomSummary[]) => {
        this.publicRooms = rooms;
        for (const sub of this.publicRoomSubscribers) {
          sub(rooms);
        }
      });

      this.socket.on('error_message', ({ message }) => {
        store.setNetError(message);
      });

      this.socket.on('disconnect', () => {
        console.log('[Net] Disconnected from server');
      });
    } else if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  private attemptAutoReconnect(): void {
    const savedRoom = getStorageItem('poachers_room_code');
    const savedId = getStorageItem('poachers_player_id');

    if (savedRoom && savedId && this.socket) {
      this.socket.emit('reconnect_session', { roomCode: savedRoom, playerId: savedId }, (res) => {
        if (res.success && res.roomState) {
          store.setRoomState(res.roomState);
          if (res.gameState) {
            store.applyServerGameState(res.gameState, res.logs || []);
          }
        } else {
          removeStorageItem('poachers_room_code');
        }
      });
    }
  }

  public createRoom(playerName: string, isPublic: boolean = true): Promise<{ success: boolean; roomCode?: string; error?: string }> {
    return new Promise((resolve) => {
      this.connect();
      if (!this.socket) {
        store.setNetError('Socket client unavailable.');
        return resolve({ success: false, error: 'Socket unavailable' });
      }

      const timeout = setTimeout(() => {
        if (!store.roomState) {
          store.setNetError('Connection timed out. Ensure multiplayer server is running (npm run server).');
          resolve({ success: false, error: 'Timeout' });
        }
      }, 4000);

      this.socket.emit('create_room', { playerName, isPublic }, (res) => {
        clearTimeout(timeout);
        if (res && res.success && res.roomCode) {
          setStorageItem('poachers_room_code', res.roomCode);
        } else if (res && res.error) {
          store.setNetError(res.error);
        }
        resolve(res || { success: false, error: 'No response' });
      });
    });
  }

  public togglePublic(): void {
    const roomCode = store.roomState?.roomCode;
    const playerId = store.myPlayerId;
    if (this.socket && roomCode && playerId) {
      this.socket.emit('toggle_public', { roomCode, playerId });
    }
  }

  public toggleTurnTimeLimit(): void {
    const roomCode = store.roomState?.roomCode;
    const playerId = store.myPlayerId;
    if (this.socket && roomCode && playerId) {
      this.socket.emit('toggle_turn_time_limit', { roomCode, playerId });
    }
  }

  public joinRoom(roomCode: string, playerName: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.connect();
      if (!this.socket) {
        store.setNetError('Socket client unavailable.');
        return resolve({ success: false, error: 'Socket unavailable' });
      }

      const playerId = getStorageItem('poachers_player_id') || undefined;

      const timeout = setTimeout(() => {
        if (!store.roomState) {
          store.setNetError('Connection timed out. Ensure multiplayer server is running (npm run server).');
          resolve({ success: false, error: 'Timeout' });
        }
      }, 4000);

      this.socket.emit('join_room', { roomCode, playerName, playerId }, (res) => {
        clearTimeout(timeout);
        if (res && res.success && res.roomState) {
          setStorageItem('poachers_room_code', roomCode);
          if (res.playerId) {
            setStorageItem('poachers_player_id', res.playerId);
            store.setMyPlayerId(res.playerId);
          }
          store.setRoomState(res.roomState);
        } else if (res && res.error) {
          store.setNetError(res.error);
        }
        resolve(res || { success: false, error: 'No response' });
      });
    });
  }

  public selectSeat(seat: PlayerSeat | null): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const roomCode = store.roomState?.roomCode;
      const playerId = store.myPlayerId;
      if (!this.socket || !roomCode || !playerId) return resolve({ success: false, error: 'Not in a room' });

      this.socket.emit('select_seat', { roomCode, playerId, seat }, (res) => {
        if (!res.success && res.error) {
          store.setNetError(res.error);
        }
        resolve(res);
      });
    });
  }

  public toggleBotSeat(seat: PlayerSeat): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const roomCode = store.roomState?.roomCode;
      const playerId = store.myPlayerId;
      if (!this.socket || !roomCode || !playerId) return resolve({ success: false, error: 'Not in a room' });

      this.socket.emit('toggle_bot_seat', { roomCode, playerId, seat }, resolve);
    });
  }

  public toggleReady(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const roomCode = store.roomState?.roomCode;
      const playerId = store.myPlayerId;
      if (!this.socket || !roomCode || !playerId) return resolve({ success: false, error: 'Not in a room' });

      this.socket.emit('toggle_ready', { roomCode, playerId }, resolve);
    });
  }

  public startGame(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const roomCode = store.roomState?.roomCode;
      const playerId = store.myPlayerId;
      if (!this.socket || !roomCode || !playerId) return resolve({ success: false, error: 'Not in a room' });

      this.socket.emit('start_game', { roomCode, playerId }, resolve);
    });
  }

  public sendGameAction(action: GameAction): void {
    const roomCode = store.roomState?.roomCode;
    const playerId = store.myPlayerId;
    if (!this.socket || !roomCode || !playerId) return;

    this.socket.emit('game_action', { roomCode, playerId, action });
  }

  public toggleAutoCardPick(): void {
    const roomCode = store.roomState?.roomCode;
    const playerId = store.myPlayerId;
    if (this.socket && roomCode && playerId) {
      this.socket.emit('toggle_auto_card_pick', { roomCode, playerId });
    }
  }

  public resetMatch(): void {
    const roomCode = store.roomState?.roomCode;
    const playerId = store.myPlayerId;
    if (this.socket && roomCode && playerId) {
      this.socket.emit('reset_match', { roomCode, playerId });
    }
  }

  public requestRematch(): void {
    const roomCode = store.roomState?.roomCode;
    const playerId = store.myPlayerId;
    if (this.socket && roomCode && playerId) {
      this.socket.emit('request_rematch', { roomCode, playerId });
    }
  }

  public acceptRematch(): void {
    const roomCode = store.roomState?.roomCode;
    const playerId = store.myPlayerId;
    if (this.socket && roomCode && playerId) {
      this.socket.emit('accept_rematch', { roomCode, playerId });
    }
  }

  public leaveRoom(): void {
    const roomCode = store.roomState?.roomCode;
    const playerId = store.myPlayerId;
    if (this.socket && roomCode && playerId) {
      this.socket.emit('leave_room', { roomCode, playerId });
    }
    removeStorageItem('poachers_room_code');
    store.leaveMultiplayerRoom();
  }
}

export const socketClient = new SocketClient();
