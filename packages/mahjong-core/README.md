# @skriin/mahjong-core

Pure TypeScript for skriin ai TV mahjong. No Angular, React or DOM imports; time and randomness are injected.
Shared by the Angular TV app, the React Native iPhone app and the NestJS/Colyseus server.

| File | What |
|---|---|
| `tiles.ts` | 144 physical tile ids (4 × 34 kinds + 8 bonus tiles), kinds, names, Western marks, sort order, Riichi red-five flag |
| `types.ts` | `PlayerView` (what one player may see), `PlayerAction`, `ActionOption`, `HandResult`, `TableEvent`, seats and turn order |
| `engine.ts` | `MahjongEngine` contract, injected `Clock` and `Rng`, seeded RNG for tests, Fisher–Yates shuffle |
| `points.ts` | Approved half-spicy faan → points table (cap 10) and Clear Chapter payments |

Phase 2 adds: wall + dead wall, turn/claim state machine, hand splitter (every split), waits, shanten, `HongKongRules`, bots.
