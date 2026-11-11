/** @type {import('next').NextConfig} */
const nextConfig = {
  // exceljs (كشوف Excel) بيتحمّل من node_modules على السيرفر من غير bundling - loaded from node_modules, not bundled
  experimental: {
    serverComponentsExternalPackages: ["exceljs"],
    // لوجوهات الكشوف لازم تتشحن مع السيرفر (public مش بيتحط في الـ function) - ship the sheet logos with the server
    outputFileTracingIncludes: {
      "/api/salaries/export": ["./public/brand/**"],
      "/api/salaries/export-daily": ["./public/brand/**"],
    },
  },
};

export default nextConfig;
