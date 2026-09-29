import { getBestBotAction, DEFAULT_BOT_PROFILE } from './bot';
import { GameState } from '../core/types';

self.onmessage = (e: MessageEvent<{ id?: number; turnCount?: number; seat?: any; state: GameState; profile?: any }>) => {
  const { id, turnCount, seat, state, profile } = e.data;
  
  // Use provided profile or fallback to default
  const botProfile = profile || DEFAULT_BOT_PROFILE;
  
  try {
    // Compute best bot action using the deep tree search
    const result = getBestBotAction(state, botProfile);
    
    // Send the result back to the main thread
    self.postMessage({
      id,
      turnCount,
      seat,
      actionInt: result ? (result.actionInt ?? (typeof result.action === 'number' ? result.action : undefined)) : undefined,
      action: result?.action 
    });
  } catch (err: any) {
    console.error('[BotWorker] Error in getBestBotAction:', err);
    self.postMessage({
      id,
      turnCount,
      seat,
      error: err?.message || String(err)
    });
  }
};
