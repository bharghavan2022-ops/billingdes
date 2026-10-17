/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Saves send only changed rows in pieces of at most 1,500, so they are small. The limit is raised from the 1 MB default for
    // large imports (restoring a big backup) and stays under Vercel's 4.5 MB request cap.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
