import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import InitialLoader from "./components/InitialLoader";
import DateSimulatorIndicator from "./components/DateSimulatorIndicator";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fusión Legal",
  description: "Aplicación de gestión legal integrada con AppSheet y Google Sheets",
};

export const viewport: Viewport = {
  themeColor: "#19304B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <InitialLoader />
        <DateSimulatorIndicator />
        {children}
      </body>
    </html>
  );
}
