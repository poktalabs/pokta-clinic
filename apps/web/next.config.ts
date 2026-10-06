import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared FHIR contract ships as TypeScript source.
  transpilePackages: ["@pokta-clinic/fhir"],
};

export default nextConfig;
