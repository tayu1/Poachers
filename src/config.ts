/**
 * Global Configuration & Game Options Source of Truth
 */

export const TURN_TIME_LIMIT_OPTIONS = [30, 60, 120, 0] as const;
export type TurnTimeLimit = (typeof TURN_TIME_LIMIT_OPTIONS)[number];
export const DEFAULT_TURN_TIME_LIMIT: TurnTimeLimit = 60;

// Bot execution speed (in milliseconds)
export const BOT_SPEED_MS = 1500;

// Delay (in milliseconds) for combat turn / river reveal animation step
export const COMBAT_TURN_RIVER_DELAY_MS = 2500;
