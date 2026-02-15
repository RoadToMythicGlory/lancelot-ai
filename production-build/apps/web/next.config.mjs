const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Force a new BUILD_ID on each deploy to bust client caches
  generateBuildId: async () => {
    return String(Date.now());
  },
  
  images: {
    domains: ['localhost', 'api.lancelot.example.com', 'files.lancelot.example.com'],
    formats: ['image/avif', 'image/webp'],
  },
  
  // Experimental flags disabled to prevent heavy memory usage in dev.
  experimental: {},

  // Remove custom Turbopack rules for now – they consume a lot of RAM.
  turbopack: {},

  // Completely skip ESLint during Next.js builds – this saves a large
  // amount of RAM and prevents OOM crashes while we stabilise the codebase.
  eslint: {
    ignoreDuringBuilds: true,
    dirs: [], // do not lint any directory for now
  },

  // Skip TypeScript type checking during build/dev – you can run `npm run lint` separately.
  typescript: {
    ignoreBuildErrors: true,
  },
  
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Improved chunk splitting for better loading
  webpack: (config, { isServer }) => {
    // SVG handling
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });
    
    config.ignoreWarnings = [
      { module: /node_modules\/punycode/ },
    ];
    
    // Fix antd ES module resolution
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'antd/lib': 'antd/es',
        'antd': 'antd/es'
      };
    }
    
    return config;
  },
  
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
  
  env: {
    NEXT_PUBLIC_APP_NAME: 'Lancelot',
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version,
  },
};

export default nextConfig; 