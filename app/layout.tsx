import type { Metadata } from "next";
import { Cormorant, Figtree, Italiana, Manrope } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const italiana = Italiana({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

// Italiana and Figtree carry no Cyrillic. When the visitor switches the
// invitation to Bulgarian (html[lang="bg"]), globals.css swaps the font
// variables to these Cyrillic-capable companions.
const cormorant = Cormorant({
  variable: "--font-display-bg",
  weight: "500",
  style: ["normal", "italic"],
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-body-bg",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.jpg`;

  return {
    title: "Ekaterina & Dimitar | Our Wedding",
    description:
      "Join Ekaterina and Dimitar as they marry among the vines at Midalidare Estate on 20 June 2027.",
    referrer: "no-referrer",
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      noimageindex: true,
      googleBot: { index: false, follow: false, noarchive: true, noimageindex: true },
    },
    openGraph: {
      title: "Ekaterina & Dimitar | 20 June 2027",
      description: "20 June 2027 · Midalidare Estate, Bulgaria",
      images: [{ url: imageUrl, width: 1200, height: 800, alt: "Ekaterina and Dimitar's wedding invitation" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Ekaterina & Dimitar | 20 June 2027",
      description: "20 June 2027 · Midalidare Estate, Bulgaria",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${figtree.variable} ${italiana.variable} ${cormorant.variable} ${manrope.variable}`}>{children}</body>
    </html>
  );
}
