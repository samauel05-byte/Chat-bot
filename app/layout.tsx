import type { Metadata } from "next";
import React from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://chat-9835cqur9-samkill.vercel.app"
  ),
  title: "NALA — Núcleo Automatizado de Listados Administrativos",
  description: "🤖 Automatiza la preparación de información para la DGII",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "NALA — Núcleo Automatizado de Listados Administrativos",
    description: "🤖 Automatiza la preparación de información para la DGII",
    images: [{ url: "/logo.svg", width: 576, height: 576 }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
