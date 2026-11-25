import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (Postgres embarqué pour le dev local et les tests) ne doit pas être bundlé.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Dev uniquement : permet d'ouvrir l'app via 127.0.0.1 (cookies séparés de localhost, pratique pour simuler un 2e téléphone).
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
