import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ActivityBeacon } from "@/components/activity-beacon";

export const metadata: Metadata = {
  title: { default: "Le carnet de l’EVG", template: "%s · Carnet de l’EVG" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#24143e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body className="font-sans">
        {children}
        <ActivityBeacon />
      </body>
    </html>
  );
}
