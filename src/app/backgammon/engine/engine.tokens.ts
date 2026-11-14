import { InjectionToken } from '@angular/core';
import { BackgammonEngine } from '@skriin/backgammon-core';
import { Scenario } from './preview-states';

/** The UI talks to the game only through this. */
export const BACKGAMMON_ENGINE = new InjectionToken<BackgammonEngine>('BACKGAMMON_ENGINE');

/** Review only: loads a preview state (P key). Not part of the game contract. */
export interface PreviewControl {
  loadScenario(s: Scenario): void;
}
export const BACKGAMMON_PREVIEW = new InjectionToken<PreviewControl>('BACKGAMMON_PREVIEW');
