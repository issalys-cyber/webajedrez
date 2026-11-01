import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Créditos y licencias",
};

type Credit = { name: string; role: string; license: string; url: string };

const credits: Credit[] = [
  {
    name: "chess.js",
    role: "Reglas del ajedrez, notación y PGN",
    license: "BSD-2-Clause",
    url: "https://github.com/jhlywa/chess.js",
  },
  {
    name: "react-chessboard",
    role: "Tablero",
    license: "MIT",
    url: "https://github.com/Clariity/react-chessboard",
  },
  {
    name: "Next.js",
    role: "Framework web",
    license: "MIT",
    url: "https://nextjs.org",
  },
  {
    name: "React",
    role: "Interfaz",
    license: "MIT",
    url: "https://react.dev",
  },
  {
    name: "Tailwind CSS",
    role: "Estilos",
    license: "MIT",
    url: "https://tailwindcss.com",
  },
];

export default function CreditosPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-14">
      <Link
        href="/"
        className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
      >
        ← Volver
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        Créditos y licencias
      </h1>

      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        <strong className="text-fg">webajedrez</strong> es software libre
        distribuido bajo la licencia{" "}
        <a
          href="https://www.gnu.org/licenses/agpl-3.0.html"
          className="text-accent underline underline-offset-4"
          rel="noreferrer noopener"
          target="_blank"
        >
          AGPL-3.0
        </a>
        . El código fuente de este sitio está disponible y puede consultarse,
        modificarse y redistribuirse bajo esos mismos términos.
      </p>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted">
        Componentes de software libre
      </h2>
      <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
        {credits.map((credit) => (
          <li
            key={credit.name}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
          >
            <span>
              <a
                href={credit.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm font-medium text-fg underline-offset-4 hover:underline"
              >
                {credit.name}
              </a>
              <span className="ml-2 text-[13px] text-muted">{credit.role}</span>
            </span>
            <span className="text-xs text-muted">{credit.license}</span>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs leading-relaxed text-muted">
        Este sitio no usa cookies de seguimiento, ni publicidad, ni servicios de
        analítica de terceros.
      </p>
    </main>
  );
}
