const withPWA = require("next-pwa");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true"
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  i18n: {
    locales: ["en-US"],
    defaultLocale: "en-US",
    domains: []
  },
  images: {
    domains: ["www.gravatar.com"]
  },
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: "http://localhost:5757/:path*"
      }
    ];
  },
  pwa: {
    dest: "public",
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === "development"
  }
};

module.exports = withPWA(withBundleAnalyzer(nextConfig));
