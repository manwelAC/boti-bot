import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boti-bot | Task documents",
  description: "Bring Jira task documents into focus before tracing the code.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
