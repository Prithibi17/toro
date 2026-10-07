import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Toro — Run your company", template: "%s · Toro" },
  description: "A secure company ERP workspace",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
