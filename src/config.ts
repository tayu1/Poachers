/**
 * Global Configuration & Game Options Source of Truth
 */

export const TURN_TIME_LIMIT_OPTIONS = [30, 60, 120, 0] as const;
export type TurnTimeLimit = (typeof TURN_TIME_LIMIT_OPTIONS)[number];
export const DEFAULT_TURN_TIME_LIMIT: TurnTimeLimit = 120;

// Bot execution speed (in milliseconds)
export const BOT_SPEED_MS = 1500;

// Delay (in milliseconds) before turn & river cards open and combat is resolved
export const TURN_RIVER_DELAY_MS = 1200;

// Delay (in milliseconds) displaying combat outcome before advancing turn
export const POST_COMBAT_DELAY_MS = 2900;

// Card switching animation duration (in milliseconds per slide phase: out and in)
export const CARD_ANIMATION_TIME_MS = 350;

// Piece movement animation duration (in milliseconds)
export const PIECE_ANIMATION_TIME_MS = 250;

// Piece movement animation curve: cubic-bezier(x1, y1, x2, y2)
// - Higher y1 (e.g. 0.3 to 0.6) = more explosive / aggressive launch
// - Lower x2 (e.g. 0.0 to 0.2) = snappier stop; higher x2 (e.g. 0.4) = longer coasting settle
export const PIECE_ANIMATION_EASING = 'cubic-bezier(0.3, 0.8, 0.3, 1)';

