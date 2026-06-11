/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Versión de la app, expuesta al cliente para mostrarla en el footer.
    NEXT_PUBLIC_APP_VERSION: require("./package.json").version,
  },
};

module.exports = nextConfig;
