import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ajedrez — webajedrez",
    template: "%s · webajedrez",
  },
  description:
    "Juega al ajedrez en el navegador: tablero local, partidas contra el motor y online. Software libre bajo AGPL-3.0.",
  applicationName: "webajedrez",
};

export const viewport: Viewport = {
  themeColor: "#101319",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
