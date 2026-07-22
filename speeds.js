/**
 * Game Speeds and Delays Configuration (in milliseconds)
 * Simply edit the numbers below to change the speeds.
 */
const speeds = {
  BOT_DELAY: 1000,                             // Base bot play delay (when speed slider is normal/3)
  SERVER_BOT_DELAY: 1600,                      // Delay for server-side bot play scheduling
  COMBAT_SHOWDOWN_HIGHLIGHT_DELAY: 2000,       // Delay before highlighting winning card (Step 2)
  COMBAT_SHOWDOWN_WINNING_CARD_DURATION: 2500, // How long winning card shows highlighted before resolution
};

if (typeof window !== 'undefined') {
  window.BOT_DELAY = speeds.BOT_DELAY;
  window.SERVER_BOT_DELAY = speeds.SERVER_BOT_DELAY;
  window.COMBAT_SHOWDOWN_HIGHLIGHT_DELAY = speeds.COMBAT_SHOWDOWN_HIGHLIGHT_DELAY;
  window.COMBAT_SHOWDOWN_WINNING_CARD_DURATION = speeds.COMBAT_SHOWDOWN_WINNING_CARD_DURATION;
} else if (typeof global !== 'undefined') {
  global.BOT_DELAY = speeds.BOT_DELAY;
  global.SERVER_BOT_DELAY = speeds.SERVER_BOT_DELAY;
  global.COMBAT_SHOWDOWN_HIGHLIGHT_DELAY = speeds.COMBAT_SHOWDOWN_HIGHLIGHT_DELAY;
  global.COMBAT_SHOWDOWN_WINNING_CARD_DURATION = speeds.COMBAT_SHOWDOWN_WINNING_CARD_DURATION;
}
