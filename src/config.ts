/**
 * Global Configuration & Game Options Source of Truth
 */

export const TURN_TIME_LIMIT_OPTIONS = [30, 60, 120, 0] as const;
export type TurnTimeLimit = (typeof TURN_TIME_LIMIT_OPTIONS)[number];
export const DEFAULT_TURN_TIME_LIMIT: TurnTimeLimit = 120;

// Bot execution speed (in milliseconds)
export const BOT_SPEED_MS = 1000;

// Delay (in milliseconds) before turn & river cards open and combat is resolved
export const TURN_RIVER_DELAY_MS = 1000;

// Delay (in milliseconds) displaying combat outcome before advancing turn
export const POST_COMBAT_DELAY_MS = 2900;



