import type { Metadata } from "next";
import { BotGame } from "@/components/game/BotGame";

export const metadata: Metadata = {
  title: "Contra el motor",
  description:
    "Juega contra Stockfish en tu navegador con veinte niveles de dificultad, de principiante a fuerza completa.",
};

export default function PlayBotPage() {
  return <BotGame />;
}
