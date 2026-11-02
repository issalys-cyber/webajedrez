import type { Metadata } from "next";
import { OnlineGame } from "@/components/game/OnlineGame";

export const metadata: Metadata = {
  title: "Partida online",
  description:
    "Partida de ajedrez en tiempo real contra otra persona, con reloj y reconexión.",
};

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OnlineGame gameId={id} />;
}
