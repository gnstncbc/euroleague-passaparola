import type { Metadata, Viewport } from "next";
import "./globals.css";
import { settingsBootScript } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Passaparola · EuroLeague",
  description: "Modern EuroLeague (2000 sonrası) bilgi yarışması. A'dan Z'ye 4 dakika.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121213" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: settingsBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
