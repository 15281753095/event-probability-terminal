import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Event Probability Terminal",
  description: "Research terminal shell for event probability markets."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

