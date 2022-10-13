const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development"
});
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true"
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
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
        destination: `${process.env.API_ENDPOINT}/:path*`
      }
    ];
  }
};

module.exports = withBundleAnalyzer(withPWA(nextConfig));
