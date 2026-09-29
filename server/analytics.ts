import { Socket } from 'socket.io';
import { PlayerSeat } from '../src/core/types';
import { ServerRoom } from './types';

const DEFAULT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzs_JdNdJdVtuo8Ua5IyGm63Mzoaiy80aZZcIuw9kiRFl6Wwg6KWDvGpM95WIrZRKH35w/exec';

export function getSocketIp(socket: Socket): string {
  try {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      const firstIp = forwarded.split(',')[0].trim();
      if (firstIp) return cleanIp(firstIp);
    }
    const cfIp = socket.handshake.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.length > 0) {
      return cleanIp(cfIp.trim());
    }
    if (socket.handshake.address) {
      return cleanIp(socket.handshake.address);
    }
  } catch (err) {
    console.warn('[Analytics] Failed to extract socket IP:', err);
  }
  return 'Unknown';
}

function cleanIp(ip: string): string {
  // Strip IPv6 mapped IPv4 prefix (e.g., ::ffff:192.168.1.1 -> 192.168.1.1)
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  if (ip === '::1') {
    return '127.0.0.1';
  }
  return ip;
}

export function getSeatLabel(room: ServerRoom, seat: PlayerSeat): string {
  const slot = room.seats[seat];
  if (!slot) return 'Empty';
  if (slot.isBot) return 'Bot';
  if (slot.playerId) {
    const player = room.players.get(slot.playerId);
    if (player && player.ip) {
      return player.ip;
    }
    return 'Human';
  }
  return 'Empty';
}

export async function logMatchCompletion(room: ServerRoom, winMethod: string): Promise<void> {
  if (room.hasLoggedMatch) {
    return;
  }
  room.hasLoggedMatch = true;

  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  const winner = room.gameState?.winnerTeam
    ? `Team ${room.gameState.winnerTeam}`
    : 'None';

  const movesCount = room.gameState?.turnCount ?? room.logs.length;

  const payload = {
    matchId: room.roomCode,
    startTime: room.matchStartTime || new Date().toISOString(),
    endTime: new Date().toISOString(),
    seatN: getSeatLabel(room, PlayerSeat.NORTH),
    seatE: getSeatLabel(room, PlayerSeat.EAST),
    seatS: getSeatLabel(room, PlayerSeat.SOUTH),
    seatW: getSeatLabel(room, PlayerSeat.WEST),
    winner,
    winMethod,
    movesCount
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      console.log(`[Analytics] Successfully logged match ${room.roomCode} to Google Sheets (${winMethod})`);
    } else {
      console.warn(`[Analytics] Webhook returned status ${res.status} for match ${room.roomCode}`);
    }
  } catch (err: any) {
    console.error(`[Analytics] Error logging match ${room.roomCode} to Google Sheets:`, err?.message || err);
  }
}
