// @ts-check
// noinspection JSFileReferences
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants.js";

import bundle_analyzer from "@next/bundle-analyzer";
const withBundleAnalyzer = bundle_analyzer({
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

const nextConfigFunction = async (phase) => {
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) {
    const withPWA = (await import("@ducanh2912/next-pwa")).default({
      dest: "public",
      register: true,
      disable: process.env.NODE_ENV === "development"
    });
    return withBundleAnalyzer(withPWA(nextConfig));
  }
  return withBundleAnalyzer(nextConfig);
};

export default nextConfigFunction;
