import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

    // services/shared/crypto lives outside this package and imports tweetnacl;
    // let webpack resolve those from apps/web/node_modules as well.
    config.resolve.modules = [
      ...(config.resolve.modules || ['node_modules']),
      path.resolve(__dirname, 'node_modules'),
    ];

    // Konva's Node.js entry point hard-requires the optional 'canvas' native module.
    // We don't want to install it (huge native build), so tell webpack to ignore it
    // on both client and server bundles.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
    };
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'canvas',
      ];
    }
    
    // Fix antd ES module resolution
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'antd/lib': 'antd/es',
        'antd': 'antd/es'
      };
      
      // Optimize chunk splitting to reduce preload warnings
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // Framework chunk
            framework: {
              name: 'framework',
              chunks: 'all',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-subscription)[\\/]/,
              priority: 40,
              enforce: true,
            },
            // Library chunk
            lib: {
              test(module) {
                return module.size() > 160000 &&
                  /node_modules[/\\]/.test(module.identifier());
              },
              name(module) {
                const hash = createHash('sha1');
                hash.update(module.identifier());
                return hash.digest('hex').substring(0, 8);
              },
              priority: 30,
              minChunks: 1,
              reuseExistingChunk: true,
            },
            // Common chunk
            commons: {
              name: 'commons',
              minChunks: 2,
              priority: 20,
            },
            // Shared chunk
            shared: {
              name(module, chunks) {
                return 'shared';
              },
              priority: 10,
              minChunks: 2,
              reuseExistingChunk: true,
            },
          },
          maxAsyncRequests: 30,
          maxInitialRequests: 25,
          minSize: 20000,
        },
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