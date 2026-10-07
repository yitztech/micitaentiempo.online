/// <reference lib="webworker" />
// Resuelve una parte del reto ALTCHA: prueba los contadores start, start+step, start+2·step…
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/web/pbkdf2";

self.onmessage = async (
  e: MessageEvent<{
    challenge: Parameters<typeof solveChallenge>[0]["challenge"];
    start: number;
    step: number;
  }>,
) => {
  const { challenge, start, step } = e.data;
  const solution = await solveChallenge({ challenge, deriveKey, counterStart: start, counterStep: step });
  self.postMessage(solution);
};
