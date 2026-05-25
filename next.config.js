const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "fbqcmtcvgijlemfpncay.supabase.co", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "logo.clearbit.com", pathname: "/**" },
      { protocol: "https", hostname: "www.google.com", pathname: "/s2/favicons/**" },
    ],
  },
  compiler: { removeConsole: { exclude: ["error"] } },
  poweredByHeader: false,
  reactStrictMode: true,
};

module.exports = withNextIntl(nextConfig);
