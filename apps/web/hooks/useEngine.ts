"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StockfishClient } from "@/lib/engine/client";
import type { SearchOptions, SearchResult } from "@/lib/engine/client";
import type { SearchInfo } from "@/lib/engine/uci";

export type EngineStatus = "idle" | "loading" | "ready" | "thinking";

/**
 * Ciclo de vida del motor dentro de React.
 *
 * El motor NO se descarga hasta que se llama a `start()`: así el tablero pinta
 * antes de que empiecen a caer 1,8 MB de WASM.
 */
export function useEngine() {
  const clientRef = useRef<StockfishClient | null>(null);
  const [status, setStatus] = useState<EngineStatus>("idle");
  const [info, setInfo] = useState<SearchInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      clientRef.current?.quit();
      clientRef.current = null;
    };
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (clientRef.current) return true;

    setStatus("loading");
    setError(null);

    const client = new StockfishClient();
    try {
      await client.init();
      clientRef.current = client;
      setStatus("ready");
      return true;
    } catch (cause) {
      client.quit();
      setError(
        cause instanceof Error
          ? cause.message
          : "No se ha podido cargar el motor.",
      );
      setStatus("idle");
      return false;
    }
  }, []);

  const search = useCallback(
    async (fen: string, options: SearchOptions = {}): Promise<SearchResult | null> => {
      const client = clientRef.current;
      if (!client) return null;

      setStatus("thinking");
      setInfo(null);

      try {
        const result = await client.search(fen, {
          ...options,
          onInfo: (line) => {
            setInfo(line);
            options.onInfo?.(line);
          },
        });
        return result;
      } finally {
        setStatus((current) => (current === "thinking" ? "ready" : current));
      }
    },
    [],
  );

  const stop = useCallback(() => {
    clientRef.current?.stop();
  }, []);

  return {
    status,
    info,
    error,
    isReady: status === "ready" || status === "thinking",
    isLoading: status === "loading",
    isThinking: status === "thinking",
    start,
    search,
    stop,
  };
}

export type EngineController = ReturnType<typeof useEngine>;
