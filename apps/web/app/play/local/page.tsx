import type { Metadata } from "next";
import { LocalGame } from "@/components/game/LocalGame";

export const metadata: Metadata = {
  title: "Partida local",
  description:
    "Juega al ajedrez en el mismo dispositivo con reglas completas: enroque, captura al paso, promoción y todas las tablas.",
};

export default function PlayLocalPage() {
  return <LocalGame />;
}
