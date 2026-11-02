import Link from "next/link";
import { CreateGameButton } from "@/components/game/CreateGameButton";
import { ONLINE_ENABLED } from "@/lib/realtime/config";

const modes = [
  {
    title: "Dos jugadores, un dispositivo",
    detail: "Tablero completo, jugadas legales, PGN y FEN.",
    href: "/play/local",
    ready: true,
  },
  {
    title: "Contra el motor",
    detail: "Stockfish en tu navegador, con 20 niveles de dificultad.",
    href: "/play/bot",
    ready: true,
  },
  {
    title: "Online 1v1",
    detail: "Salas por enlace, reloj y reconexión. En construcción.",
    href: null,
    ready: false,
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-5 py-14">
      <div className="space-y-10">
        <header className="space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-good" />
            Tablero local · motor · online
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Ajedrez, sin instalar nada.
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted">
            Juega en el navegador con reglas completas: enroque, captura al paso,
            promoción, jaque mate y todas las tablas. Contra otra persona o
            contra Stockfish, que se ejecuta en tu propio dispositivo.
          </p>
        </header>

        {ONLINE_ENABLED && (
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-fg">Jugar online</h2>
                <p className="mt-1 text-[13px] leading-snug text-muted">
                  Crea una partida y comparte el enlace con tu rival. Reloj en el
                  servidor y reconexión si se cae la red.
                </p>
              </div>
              <CreateGameButton />
            </div>
          </section>
        )}

        <ul className="grid gap-3 sm:grid-cols-3">
          {modes.map((mode) => {
            const content = (
              <>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-fg">{mode.title}</span>
                  {!mode.ready && (
                    <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                      pronto
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block text-[13px] leading-snug text-muted">
                  {mode.detail}
                </span>
              </>
            );

            return (
              <li key={mode.title}>
                {mode.href ? (
                  <Link
                    href={mode.href}
                    className="block h-full rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/60 hover:bg-surface-2"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="h-full cursor-default rounded-xl border border-line/60 bg-surface/50 p-4 opacity-70">
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/play/local"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-accent px-5 text-sm font-medium text-[#0b1020] transition-colors hover:bg-accent-strong hover:text-white"
          >
            Jugar ahora
          </Link>
          <Link
            href="/creditos"
            className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Créditos y licencias
          </Link>
        </div>

        <footer className="border-t border-line pt-5 text-xs text-muted">
          Software libre bajo AGPL-3.0. Sin registro, sin anuncios, sin tracking.
        </footer>
      </div>
    </main>
  );
}
