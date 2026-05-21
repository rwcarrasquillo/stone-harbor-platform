/** @type {import('next').NextConfig} */
const nextConfig = {
  // Image optimization — required for using next/image with Supabase
  // Storage URLs. Add additional hosts here if you ever serve avatars
  // from a separate CDN.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fbqcmtcvgijlemfpncay.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        // Clearbit company logos used on the welcome profile editor.
        protocol: "https",
        hostname: "logo.clearbit.com",
        pathname: "/**",
      },
      {
        // Google favicons fallback used by the work-company input.
        protocol: "https",
        hostname: "www.google.com",
        pathname: "/s2/favicons/**",
      },
    ],
  },

  // Strip console.* in production builds. Keeps `console.error` for
  // real failures (those go to Sentry / Vercel logs anyway) but removes
  // debug `console.log` and `console.warn` from the client bundle.
  compiler: {
    removeConsole: {
      exclude: ["error"],
    },
  },

  // Hide the "Powered by Next.js" header — minor security hygiene.
  poweredByHeader: false,

  // Stricter mode in development.
  reactStrictMode: true,
};

module.exports = nextConfig;
