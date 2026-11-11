/// <reference lib="webworker" />

import { AiRequest, runAiRequest } from './ai-protocol';
import { Searcher } from './core/search';

// The computer thinks here, off the UI thread, so the TV never stutters.
const searcher = new Searcher();

addEventListener('message', ({ data }: MessageEvent<AiRequest>) => {
  postMessage(runAiRequest(searcher, data));
});
