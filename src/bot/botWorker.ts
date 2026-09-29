import { getBestBotAction, DEFAULT_BOT_PROFILE } from './bot';
import { GameState } from '../core/types';

self.onmessage = (e: MessageEvent<{ state: GameState, profile?: any }>) => {
  const { state, profile } = e.data;
  
  // Use provided profile or fallback to default
  const botProfile = profile || DEFAULT_BOT_PROFILE;
  
  // Compute best bot action using the deep tree search
  const result = getBestBotAction(state, botProfile);
  
  // Send the result back to the main thread
  self.postMessage({
    actionInt: result ? (result.actionInt ?? (typeof result.action === 'number' ? result.action : undefined)) : undefined,
    action: result?.action 
  });
};
