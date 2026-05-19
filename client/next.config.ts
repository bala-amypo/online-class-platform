import type { NextConfig } from "next";

const extraOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [];

const allOrigins = [
  "localhost:3000",
  "192.168.56.1:3000",
  "10.102.85.88:3000",
  "192.168.1.15:3000",
  "192.168.1.15",
  "192.168.56.1",
  "10.102.85.88",
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
