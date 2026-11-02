import { parseBestMove, parseInfoLine } from "./uci";
import type { SearchInfo, SearchResult } from "./uci";

export type { SearchInfo, SearchResult } from "./uci";

/**
 * Cliente del motor de ajedrez.
 *
 * La interfaz existe para que la lógica de la partida no dependa de Stockfish:
 * en tests se puede inyectar una implementación falsa y determinista, y si
 * algún día se cambia de motor, solo se toca este fichero.
 */

export type SearchOptions = {
  /** Nivel de habilidad de Stockfish (0-20). */
  skill?: number;
  /** Profundidad máxima. */
  depth?: number;
  /** Tiempo máximo de búsqueda en milisegundos. */
  movetimeMs?: number;
  /** Se llama en cada línea `info` con progreso de la búsqueda. */
  onInfo?: (info: SearchInfo) => void;
};

export interface EngineClient {
  init(): Promise<void>;
  search(fen: string, options?: SearchOptions): Promise<SearchResult>;
  stop(): void;
  quit(): void;
}

/** Ruta del build `lite single-threaded` servido desde `public/`. */
export const ENGINE_SCRIPT_PATH = "/engine/stockfish-19-lite-single.js";

const INIT_TIMEOUT_MS = 25_000;

export class StockfishClient implements EngineClient {
  private worker: Worker | null = null;
  private booting: Promise<void> | null = null;

  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;

  private searchResolve: ((result: SearchResult) => void) | null = null;
  private searchOnInfo: ((info: SearchInfo) => void) | null = null;

  init(): Promise<void> {
    if (this.booting) return this.booting;

    this.booting = new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => {
        this.readyResolve = null;
        this.readyReject = null;
        reject(error);
      };

      try {
        const worker = new Worker(ENGINE_SCRIPT_PATH);
        this.worker = worker;

        const timeout = setTimeout(() => {
          fail(new Error("El motor no ha respondido a tiempo."));
          worker.terminate();
          this.worker = null;
        }, INIT_TIMEOUT_MS);

        this.readyResolve = () => {
          clearTimeout(timeout);
          this.readyResolve = null;
          this.readyReject = null;
          resolve();
        };
        this.readyReject = fail;

        worker.onerror = (event) => {
          fail(new Error(event.message || "No se ha podido cargar el motor."));
        };

        worker.onmessage = (event: MessageEvent<unknown>) => {
          this.handleLine(typeof event.data === "string" ? event.data : String(event.data));
        };

        worker.postMessage("uci");
      } catch (error) {
        fail(error instanceof Error ? error : new Error("No se ha podido crear el worker."));
      }
    });

    return this.booting;
  }

  private handleLine(line: string) {
    if (line === "uciok") {
      this.readyResolve?.();
      return;
    }

    if (line.startsWith("readyok")) return;

    const best = parseBestMove(line);
    if (best) {
      const resolve = this.searchResolve;
      this.searchResolve = null;
      this.searchOnInfo = null;
      resolve?.(best);
      return;
    }

    const info = parseInfoLine(line);
    if (info) this.searchOnInfo?.(info);
  }

  private send(command: string) {
    this.worker?.postMessage(command);
  }

  setSkill(skill: number) {
    this.send(`setoption name Skill Level value ${Math.max(0, Math.min(20, Math.round(skill)))}`);
  }

  /**
   * Cola de búsquedas.
   *
   * El motor solo puede pensar en una posición a la vez, y `stop` provoca un
   * `bestmove` que llegaría tarde. Si dos búsquedas se solapan (por ejemplo la
   * evaluación de fondo y una pista), la respuesta de una puede acabar
   * resolviendo la promesa de la otra y devolver una jugada que no
   * corresponde a la posición actual. Serializar lo elimina de raíz.
   */
  private queue: Promise<unknown> = Promise.resolve();

  search(fen: string, options: SearchOptions = {}): Promise<SearchResult> {
    if (!this.worker) {
      return Promise.reject(new Error("El motor no está iniciado."));
    }

    const run = () => this.runSearch(fen, options);
    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private runSearch(fen: string, options: SearchOptions): Promise<SearchResult> {
    if (!this.worker) return Promise.resolve({ bestMove: null, ponder: null });

    const { skill, depth, movetimeMs, onInfo } = options;

    if (typeof skill === "number") this.setSkill(skill);

    this.send(`position fen ${fen}`);
    const parts = ["go"];
    if (typeof depth === "number") parts.push(`depth ${Math.round(depth)}`);
    if (typeof movetimeMs === "number") parts.push(`movetime ${Math.round(movetimeMs)}`);
    if (parts.length === 1) parts.push("movetime 500");

    const command = parts.join(" ");

    return new Promise<SearchResult>((resolve) => {
      this.searchResolve = resolve;
      this.searchOnInfo = onInfo ?? null;
      this.send(command);
    });
  }

  stop() {
    // Solo tiene sentido parar si hay una búsqueda viva: enviar `stop` sin
    // búsqueda puede producir un `bestmove` huérfano.
    if (!this.worker || !this.searchResolve) return;
    this.send("stop");
  }

  quit() {
    if (!this.worker) return;
    this.send("quit");
    this.worker.terminate();
    this.worker = null;
    this.booting = null;
    this.searchResolve = null;
    this.searchOnInfo = null;
  }
}
