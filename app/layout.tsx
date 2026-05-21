import type { Metadata, Viewport } from "next";
import "./globals.css";
import { sans } from "@/lib/fonts";

/**
 * Stone Harbor — root metadata.
 *
 * Notes on Open Graph image handling:
 *   We deliberately do NOT set metadata.openGraph.images here. Next.js
 *   App Router auto-detects app/opengraph-image.png and emits the
 *   correct <meta property="og:image" content="https://.../opengraph-image?{hash}">
 *   tag automatically, with cache-busting and dimensions. Setting the
 *   `images` array manually with a relative path produces a URL that
 *   doesn't match what's actually served. Let the file-convention win.
 *
 *   Same logic for twitter.images — Next.js sees the same file and
 *   emits twitter:image automatically when openGraph.images is absent.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://stoneharbor.app"),
  title: {
    default: "Stone Harbor — A patient harbor for men finding their way back",
    template: "%s · Stone Harbor",
  },
  description:
    "Stone Harbor is a private men's mental wellness platform for clarity, calm, and strength after the storm. Quiet daily journaling, brotherhood without performance, and the patient harbor men in divorce, burnout, betrayal, and loss can return to.",
  applicationName: "Stone Harbor",
  authors: [{ name: "Stone Harbor" }],
  keywords: [
    "men's mental wellness",
    "men's journaling",
    "divorce recovery",
    "men's brotherhood",
    "men's mindfulness",
    "men's grief",
    "men's burnout",
    "patient harbor",
  ],
  openGraph: {
    title: "Stone Harbor — A patient harbor for men finding their way back",
    description:
      "A private men's mental wellness platform for clarity, calm, and strength after the storm. Quiet daily journaling, brotherhood without performance, and the patient harbor men in divorce, burnout, betrayal, and loss can return to.",
    siteName: "Stone Harbor",
    url: "https://stoneharbor.app",
    type: "website",
    locale: "en_US",
    // images: intentionally omitted — Next.js auto-emits from app/opengraph-image.png
  },
  twitter: {
    card: "summary_large_image",
    title: "Stone Harbor — A patient harbor for men finding their way back",
    description:
      "A private men's mental wellness platform for clarity, calm, and strength after the storm. Quiet daily journaling and brotherhood without performance.",
    // images: intentionally omitted — Next.js auto-emits from app/opengraph-image.png
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-anchor.svg", type: "image/svg+xml" },
    ],
    apple: "/favicon-anchor-180.png",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
