/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The whole account is saved as one document, so the default 1 MB Server Action limit is reached after a few hundred bills.
    // 4 MB stays under Vercel's 4.5 MB request cap. Moving to per-record tables removes the limit (see README).
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
