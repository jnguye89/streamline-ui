// Synthetic watch-feed entries for the games that have no real feed item of
// their own (unlike chess, which can show a live game - see ChessGameItem).
// Each one is an auto-playing, non-interactive preview with a "Press to play"
// call to action that opens the full game page. Nothing on the server.

// Rendered by CheckersDemoComponent; "Press to play" opens /play/checkers.
export interface CheckersDemoItem {
  type: 'checkers-demo';
  id: 'checkers-demo';
}

// Rendered by PokerDemoComponent; "Press to play" opens /play/poker.
export interface PokerDemoItem {
  type: 'poker-demo';
  id: 'poker-demo';
}

// Rendered by MahjongDemoComponent; "Press to play" opens /play/mahjong.
export interface MahjongDemoItem {
  type: 'mahjong-demo';
  id: 'mahjong-demo';
}

// Rendered by BackgammonDemoComponent; "Press to play" opens /play/backgammon.
export interface BackgammonDemoItem {
  type: 'backgammon-demo';
  id: 'backgammon-demo';
}

// Rendered by BotOrNotDemoComponent; "Press to play" opens /play/bot-or-not.
export interface BotOrNotDemoItem {
  type: 'bot-or-not-demo';
  id: 'bot-or-not-demo';
}
