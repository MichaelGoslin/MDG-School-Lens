import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mdg-school-lens.michael-goslin.chatgpt.site"),
  title: "MDG School Lens | NYC School Quality Intelligence",
  description: "An executive view of NYC School Quality Reports for education administrators.",
  openGraph: {
    title: "MDG School Lens",
    description: "NYC School Quality Intelligence for education administrators.",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "MDG School Lens dashboard preview" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MDG School Lens",
    description: "NYC School Quality Intelligence for education administrators.",
    images: ["/og.png"],
  },
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
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
