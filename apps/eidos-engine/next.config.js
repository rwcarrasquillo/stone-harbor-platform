/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Eidos instrument scoring logic ships raw TypeScript from the
  // workspace package (its `main`/`types` point at src/index.ts), so
  // Next must transpile it. Future construct-compute modules that get
  // promoted to packages/eidos inherit this wiring.
  transpilePackages: ["@stone-harbor/eidos"],
  poweredByHeader: false,
  reactStrictMode: true,
};

module.exports = nextConfig;
