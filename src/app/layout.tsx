import type { Metadata } from "next";
import { Red_Hat_Display, Red_Hat_Text } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "./theme.css";

const sensei = localFont({
  src: "../../fontnew/Sensei-Medium.otf",
  display: "swap",
  variable: "--font-sensei",
});

const redHatDisplay = Red_Hat_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-red-hat-display",
});

const redHatText = Red_Hat_Text({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-red-hat-text",
});

export const metadata: Metadata = {
  title: "Mesa Viva | Pedidos para restaurantes",
  description: "Menú QR, cocina, mesas y caja conectados.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${sensei.variable} ${redHatDisplay.variable} ${redHatText.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
