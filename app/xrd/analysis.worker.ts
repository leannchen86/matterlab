// Fits patterns off the main thread. Like every analysis, it receives observed counts and chosen references only.
import { analyzePattern, type AnalysisOptions, type AnalysisResult, type Observation } from './analysis.ts';

export type AnalysisRequest = { readonly id: number; readonly observation: Observation; readonly options: AnalysisOptions };
export type AnalysisReply = { readonly id: number; readonly result: AnalysisResult } | { readonly id: number; readonly error: string };

addEventListener('message', (event: MessageEvent<AnalysisRequest>) => {
  const { id, observation, options } = event.data;
  let reply: AnalysisReply;
  try {
    reply = { id, result: analyzePattern(observation, options) };
  } catch (error) {
    reply = { id, error: error instanceof Error ? error.message : String(error) };
  }
  postMessage(reply);
});
