import { Auth0User } from '../auth0-user.model';

export type ChessGameStatus =
  | 'waiting'
  | 'active'
  | 'checkmate'
  | 'stalemate'
  | 'draw'
  | 'resigned'
  | 'abandoned';

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
  createdAt: string;
  updatedAt?: string;
  endedAt?: string | null;
}

// The watch feed's item shape for a chess game - mirrors LiveStream's
// 'type' discriminant so WatchComponent's playlist union can switch on it.
export type ChessGameItem = ChessGame & { type: 'chess' };

export interface ChessMovePayload {
  gameId: number;
  from: string;
  to: string;
  san: string;
  fen: string;
  turn: ChessColor;
  status: ChessGameStatus;
  winner: ChessWinner | null;
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

export interface ChessAck {
  ok: boolean;
  error?: string;
}
