import type { Metadata, Viewport } from "next";
import "./globals.css";
import { sans } from "@/lib/fonts";
import { ServiceWorkerRegistrar } from "@/app/components/serviceWorkerRegistrar";

/**
 * Stone Harbor — root metadata.
 *
 * On the OG image: app/opengraph-image.png is served by Next.js 16 at
 * the literal path /opengraph-image.png (with the .png extension —
 * verified in the build route table + by visiting the URL directly).
 * We reference it explicitly here so the <meta property="og:image">
 * tag emitted in <head> is deterministic and matches what the file
 * convention serves, instead of trusting auto-emit timing across
 * different crawlers.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://stoneharbor.app"),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Stone Harbor",
    statusBarStyle: "black-translucent",
    startupImage: [
      {
        url: "/icons/apple-splash-1290x2796.png",
        media:
          "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/icons/apple-splash-1179x2556.png",
        media:
          "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/icons/apple-splash-1170x2532.png",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/icons/apple-splash-1125x2436.png",
        media:
          "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)",
      },
    ],
  },
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
    title:
      "Stone Harbor — A patient harbor for men finding their way back",
    description:
      "A private men's mental wellness platform for clarity, calm, and strength after the storm. Quiet daily journaling, brotherhood without performance, and the patient harbor men in divorce, burnout, betrayal, and loss can return to.",
    siteName: "Stone Harbor",
    url: "https://stoneharbor.app",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Stone Harbor — Men's Mental Wellness",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title:
      "Stone Harbor — A patient harbor for men finding their way back",
    description:
      "A private men's mental wellness platform for clarity, calm, and strength after the storm. Quiet daily journaling and brotherhood without performance.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Stone Harbor — Men's Mental Wellness",
      },
    ],
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
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
