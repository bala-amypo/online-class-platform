import type { NextConfig } from "next";

const devOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(",")
  : [
      "localhost:3000",
      "192.168.56.1:3000",
      "10.102.85.88:3000",
      "192.168.1.15:3000",
      "192.168.1.15",
      "192.168.56.1",
      "10.102.85.88"
    ];

const extraOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [];

const allOrigins = [
  ...devOrigins,
  ...extraOrigins
];

const nextConfig: NextConfig = {
  allowedDevOrigins: allOrigins,
  experimental: {
    serverActions: {
      allowedOrigins: allOrigins
    }
  }
};

export default nextConfig;
