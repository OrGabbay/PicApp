import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Navbar from "@/src/components/Navbar";
import PreferencesSync from "@/src/components/PreferencesSync";
import { InlineScript } from "@/src/components/InlineScript";
import { PREFERENCES_BOOT_SCRIPT } from "@/src/lib/preferences";
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
    // data-theme / lang / dir are set from saved preferences before paint by the boot script
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <InlineScript html={PREFERENCES_BOOT_SCRIPT} />
      </head>
      <body className={`${inter.className} bg-black text-white min-h-screen flex flex-col`}>
        <PreferencesSync />

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
