/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // athlete headshots come straight from the CrossFit CDN
  images: { remotePatterns: [{ protocol: 'https', hostname: 'profilepicsbucket.crossfit.com' }] },
};

export default nextConfig;
