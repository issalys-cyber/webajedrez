/**
 * Direcciones del servidor de partidas.
 *
 * Se configuran con variables de entorno públicas. Si no hay ninguna, se
 * asume el servidor local de desarrollo.
 */

const rawHttp = process.env.NEXT_PUBLIC_RT_HTTP_URL ?? "http://localhost:8787";

export const RT_HTTP_URL = rawHttp.replace(/\/$/, "");

export const RT_WS_URL = (
  process.env.NEXT_PUBLIC_RT_WS_URL ?? RT_HTTP_URL.replace(/^http/, "ws")
).replace(/\/$/, "");

/**
 * El modo online solo se anuncia si hay servidor configurado. En producción
 * aún no está desplegado, así que la portada no lo ofrece.
 */
export const ONLINE_ENABLED =
  process.env.NODE_ENV !== "production" || Boolean(process.env.NEXT_PUBLIC_RT_HTTP_URL);

export function gameSocketUrl(gameId: string, token: string): string {
  const params = new URLSearchParams({ game: gameId, token });
  return `${RT_WS_URL}/ws?${params.toString()}`;
}

export function shareUrl(gameId: string, token: string): string {
  const base =
    typeof window === "undefined" ? "" : window.location.origin;
  return `${base}/game/${gameId}#t=${token}`;
}
