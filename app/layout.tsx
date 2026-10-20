import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

// self-hosted at build time: the app makes no requests to Google
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex" });

export const metadata: Metadata = {
  title: "SCAS ID Cards",
  description: "Generate Sudharsan College student ID cards from an Excel workbook",
};

// cover the whole screen so env(safe-area-inset-*) reports the iPhone insets
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${plex.variable}`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
