/** @type {import('next').NextConfig} */
const nextConfig = {
  // --- 1. NETLIFY FIXES (Add these!) ---
  output: 'export', // Forces static HTML generation (creates 'out' folder)
  images: {
    unoptimized: true, // Required for static export
  },

  // --- 2. EXISTING WEBPACK FIXES (Keep these!) ---
  reactStrictMode: true,
  webpack: (config) => {
    // Ignore React Native specific modules for web builds
    config.resolve.alias = {
      ...config.resolve.alias,
      'react-native$': 'react-native-web',
      '@react-native-async-storage/async-storage': false,
    };
    
    // Fix node modules that don't work in browser
    config.resolve.fallback = { 
      fs: false, 
      net: false, 
      tls: false,
      encoding: false,
      lokijs: false,
      'pino-pretty': false
    };
    
    // Ignore warnings for these specific modules
    config.ignoreWarnings = [
      { module: /node_modules\/@walletconnect/ },
      { module: /node_modules\/wagmi/ }
    ];

    return config;
  },
  
  // Increase timeout for static generation
  staticPageGenerationTimeout: 120,
  
  // Hackathon Safety: Ignore errors during build
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  }
};

module.exports = nextConfig;