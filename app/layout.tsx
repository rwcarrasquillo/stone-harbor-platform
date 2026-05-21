import type { Metadata, Viewport } from "next";
import "./globals.css";
import { sans } from "@/lib/fonts";

export const metadata: Metadata = {
  metadataBase: new URL("https://stoneharbor.com"),
  title: {
    default: "Stone Harbor — A patient harbor for men finding their way back",
    template: "%s · Stone Harbor",
  },
  description:
    "Stone Harbor is a men's mental wellness platform for clarity, calm, and strength after the storm. Private journaling, brotherhood, and quiet daily practice.",
  applicationName: "Stone Harbor",
  authors: [{ name: "Stone Harbor" }],
  keywords: [
    "men's mental wellness",
    "men's journaling",
    "divorce recovery",
    "men's brotherhood",
    "men's mindfulness",
  ],
  openGraph: {
    title: "Stone Harbor",
    description:
      "A patient harbor for men finding their way back. Clarity, calm, and strength after the storm.",
    siteName: "Stone Harbor",
    url: "https://stoneharbor.com",
    type: "website",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Stone Harbor — Men's Mental Wellness",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stone Harbor",
    description: "A patient harbor for men finding their way back.",
    images: ["/opengraph-image.png"],
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
