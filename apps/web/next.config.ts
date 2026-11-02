import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  async headers() {
    return [
      {
        // El motor son 1,8 MB que no cambian nunca en una misma versión.
        // El nombre del fichero incluye la versión de Stockfish, así que se
        // puede cachear de forma agresiva: si algún día se sube de versión,
        // cambia el nombre y no hay riesgo de servir un binario obsoleto.
        source: "/engine/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
