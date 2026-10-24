import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Navbar from "@/src/components/Navbar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PicApp — AI Image Generator",
  description: "Generate stunning AI images from text prompts using PicApp.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-black text-white min-h-screen flex flex-col`}>
        {/* The Navbar renders at the top of every page */}
        <Navbar />

        {/* Page content renders inside this main tag */}
        <main className="flex-1 flex flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}