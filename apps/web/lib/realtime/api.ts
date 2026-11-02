"use client";

import { RT_HTTP_URL } from "./config";

export type CreatedGame = {
  gameId: string;
  whiteToken: string;
  blackToken: string;
  initialMs: number;
  incrementMs: number;
};

export type GameSummary = {
  gameId: string;
  status: "waiting" | "playing" | "finished" | "aborted";
  ply: number;
  initialMs: number;
  incrementMs: number;
  players: { w: boolean; b: boolean };
};

export async function createGame(options: {
  initialMs?: number;
  incrementMs?: number;
} = {}): Promise<CreatedGame> {
  const response = await fetch(`${RT_HTTP_URL}/games`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    throw new Error(`El servidor de partidas ha respondido ${response.status}.`);
  }

  return (await response.json()) as CreatedGame;
}

export async function fetchGame(gameId: string): Promise<GameSummary | null> {
  try {
    const response = await fetch(`${RT_HTTP_URL}/games/${gameId}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as GameSummary;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tokens
//
// El token del rival viaja en el fragmento de la URL (`#t=...`), que no se
// envía al servidor ni aparece en los registros. Se guardan también en
// sessionStorage para sobrevivir a un refresco.
// ---------------------------------------------------------------------------

const TOKEN_PREFIX = "waj:token:";
const SHARE_PREFIX = "waj:share:";

export function saveToken(gameId: string, token: string) {
  try {
    sessionStorage.setItem(TOKEN_PREFIX + gameId, token);
  } catch {
    // sessionStorage puede estar bloqueado; el fragmento de la URL basta.
  }
}

export function loadToken(gameId: string): string | null {
  try {
    return sessionStorage.getItem(TOKEN_PREFIX + gameId);
  } catch {
    return null;
  }
}

/** Enlace que hay que enviar al rival (lleva el token de las negras). */
export function saveShareLink(gameId: string, url: string) {
  try {
    sessionStorage.setItem(SHARE_PREFIX + gameId, url);
  } catch {
    // sin persistencia: se perderá al refrescar
  }
}

export function loadShareLink(gameId: string): string | null {
  try {
    return sessionStorage.getItem(SHARE_PREFIX + gameId);
  } catch {
    return null;
  }
}

/** Lee el token del fragmento de la URL (`/game/<id>#t=<token>`). */
export function tokenFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  return params.get("t");
}
