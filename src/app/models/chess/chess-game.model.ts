import { Auth0User } from '../auth0-user.model';

export type ChessGameStatus =
  | 'waiting'
  | 'active'
  | 'checkmate'
  | 'stalemate'
  | 'draw'
  | 'resigned'
  | 'abandoned'
  // Auto-assigned by the API's ChessTimeoutSchedulerService when a player
  // goes quiet on their own turn past the configurable timeout - distinct
  // from 'resigned' so the UI can say "wins by timeout" rather than
  // implying the other player chose to give up.
  | 'timeout';

export type ChessColor = 'white' | 'black';
export type ChessWinner = 'white' | 'black' | 'draw';

export interface ChessGame {
  id: number;
  whiteUser: Auth0User;
  blackUser: Auth0User | null;
  status: ChessGameStatus;
  fen: string;
  pgn: string;
  turn: ChessColor;
  winner: ChessWinner | null;
  // Which seat currently has a draw offer standing, or null if none -
  // mirrors ChessGame.drawOfferedBy on the API entity. Cleared server-side
  // the moment a move is made, so a stale offer never lingers past it.
  drawOfferedBy: ChessColor | null;
  createdAt: string;
  updatedAt?: string;
  endedAt?: string | null;
}

// The watch feed's item shape for a chess game - mirrors LiveStream's
// 'type' discriminant so WatchComponent's playlist union can switch on it.
export type ChessGameItem = ChessGame & { type: 'chess' };

// Synthetic placeholder WatchComponent slots into the feed in place of any
// real chess item when ChessService.listGames() comes back empty - see
// ChessDemoComponent. Not a real game: no id on the server, nothing to
// fetch/join via ChessService for this item itself.
export interface ChessDemoItem {
  type: 'chess-demo';
  id: 'chess-demo';
}

export interface ChessMovePayload {
  gameId: number;
  from: string;
  to: string;
  san: string;
  fen: string;
  turn: ChessColor;
  status: ChessGameStatus;
  winner: ChessWinner | null;
  // Always null on this event - a move always lapses any standing draw
  // offer server-side - but carried along so the client can clear its own
  // "offer pending" UI in the same place it applies every other move field,
  // instead of needing a separate round trip to notice.
  drawOfferedBy: ChessColor | null;
}

export interface ChessEndedPayload {
  gameId: number;
  status: ChessGameStatus;
  winner: ChessWinner | null;
}

export interface ChessJoinedPayload {
  gameId: number;
  blackUser: Auth0User | null;
  status: ChessGameStatus;
  turn: ChessColor;
}

export interface ChessDrawOfferedPayload {
  gameId: number;
  offeredBy: ChessColor;
}

export interface ChessDrawDeclinedPayload {
  gameId: number;
}

export interface ChessAck {
  ok: boolean;
  error?: string;
}
