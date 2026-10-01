import type { Metadata } from "next";
import "./globals.css";
import AppFooter from "../components/layout/AppFooter";

export const metadata: Metadata = {
  title: "DataForge",
  description:
    "Production-Grade AI Data Engineering & Analytics Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-white antialiased">
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <AppFooter />
        </div>
      </body>
    </html>
  );
}