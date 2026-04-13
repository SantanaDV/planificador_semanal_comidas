import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Menu semanal IA",
  description: "Planificador semanal de comidas con ingredientes, preferencias y recetas guardadas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
