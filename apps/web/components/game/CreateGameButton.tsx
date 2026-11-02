"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { createGame, saveShareLink, saveToken } from "@/lib/realtime/api";
import { shareUrl } from "@/lib/realtime/config";

/**
 * Crea una partida en el servidor y entra como blancas.
 * El enlace para el rival (con su token) se guarda para mostrarlo en la sala
 * de espera.
 */
export function CreateGameButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      const game = await createGame();
      saveToken(game.gameId, game.whiteToken);
      saveShareLink(game.gameId, shareUrl(game.gameId, game.blackToken));
      router.push(`/game/${game.gameId}#t=${game.whiteToken}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se ha podido crear la partida.",
      );
      setBusy(false);
    }
  }, [router]);

  return (
    <div className="flex flex-col gap-2">
      <Button variant="primary" onClick={() => void start()} disabled={busy}>
        {busy ? "Creando partida…" : "Crear partida online"}
      </Button>
      {error && (
        <p className="rounded border border-warn/40 bg-warn/10 px-2 py-1.5 text-[12px] text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
