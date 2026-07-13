import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Energy Data Analyst",
  description: "Renewable energy operations analytics dashboard"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

