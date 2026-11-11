/** @type {import('next').NextConfig} */
const nextConfig = {
  // exceljs (كشوف Excel) بيتحمّل من node_modules على السيرفر من غير bundling - loaded from node_modules, not bundled
  experimental: { serverComponentsExternalPackages: ["exceljs"] },
};

export default nextConfig;
