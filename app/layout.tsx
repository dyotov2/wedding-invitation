import type { Metadata } from "next";
import { Figtree, Italiana } from "next/font/google";
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

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "Dimitar & Ekaterina | Our Wedding",
    description:
      "Join Dimitar and Ekaterina as they begin their forever at Midalidare Estate on 20 June 2027.",
    openGraph: {
      title: "Forever starts now | Dimitar & Ekaterina",
      description: "20 June 2027 · Midalidare Estate, Bulgaria",
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: "Dimitar and Ekaterina's wedding invitation" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Forever starts now | Dimitar & Ekaterina",
      description: "20 June 2027 · Midalidare Estate, Bulgaria",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${figtree.variable} ${italiana.variable}`}>{children}</body>
    </html>
  );
}
