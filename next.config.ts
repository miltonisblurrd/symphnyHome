import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/inspired-closets", destination: "https://iclv.app/inspired-closets", permanent: false },
      { source: "/inspired-closets/:path*", destination: "https://iclv.app/inspired-closets/:path*", permanent: false },
      { source: "/api/inspired-closets", destination: "https://iclv.app/api/inspired-closets", permanent: false },
      { source: "/api/inspired-closets/:path*", destination: "https://iclv.app/api/inspired-closets/:path*", permanent: false },
      { source: "/api/integrations/quickbooks", destination: "https://iclv.app/api/integrations/quickbooks", permanent: false },
      { source: "/api/integrations/quickbooks/:path*", destination: "https://iclv.app/api/integrations/quickbooks/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
