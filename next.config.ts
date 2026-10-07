import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/access", destination: "/", permanent: false },
      { source: "/inspired-closets/access", destination: "/", permanent: false },
      { source: "/inspired-closets", destination: "/", permanent: false },
      { source: "/inspired-closets/ops", destination: "/ops/projects", permanent: false },
      { source: "/inspired-closets/ops/:path*", destination: "/ops/:path*", permanent: false },
      { source: "/inspired-closets/designers", destination: "/designers", permanent: false },
      { source: "/inspired-closets/installers", destination: "/installers", permanent: false },
      { source: "/inspired-closets/installers/:path*", destination: "/installers/:path*", permanent: false },
      { source: "/inspired-closets/site", destination: "/site", permanent: false },
      { source: "/inspired-closets/site/:path*", destination: "/site/:path*", permanent: false },
      { source: "/inspired-closets/gavin", destination: "/gavin", permanent: false },
      { source: "/inspired-closets/field", destination: "/installers", permanent: false },
      { source: "/inspired-closets/field/:path*", destination: "/installers/:path*", permanent: false },
      { source: "/inspired-closets/opengraph-image", destination: "/opengraph-image", permanent: false },
      { source: "/inspired-closets/twitter-image", destination: "/twitter-image", permanent: false },
    ];
  },
};

export default nextConfig;
