import type { Metadata } from "next";
import React from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://analisis-itbis.vercel.app"
  ),
  title: "CAMI — Control y Análisis de Movimientos e Impuestos",
  description: "Plataforma contable y tributaria con análisis fiscal y asistente IA para la DGII",
  icons: {
    icon: [
      { url: "/cami-logo.png", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "CAMI — Control y Análisis de Movimientos e Impuestos",
    description: "Plataforma contable y tributaria con análisis fiscal y asistente IA para la DGII",
    images: [{ url: "/cami-logo.png", width: 512, height: 512 }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
