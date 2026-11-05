// Production configuration for Lancelot Platform
// This file is included in the deployment package

module.exports = {
  // API Configuration
  api: {
    publicUrl: 'https://api.lanceloterp.io',
    internalUrl: 'http://localhost:4000',
    websocketUrl: 'wss://api.lanceloterp.io',
    corsOrigins: [
      'https://lanceloterp.io',
      'https://www.lanceloterp.io',
      'https://api.lanceloterp.io'
    ]
  },

  // Web App Configuration
  web: {
    publicUrl: 'https://lanceloterp.io',
    internalUrl: 'http://localhost:3000'
  },

  // Excel Parser Configuration
  excelParser: {
    enabled: true,
    port: 4001,
    internalUrl: 'http://localhost:4001'
  },

  // Services Configuration
  services: {
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/lancelot',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }
    }
  },

  // Security Configuration
  security: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: '7d',
    bcryptRounds: 12,
    enablePlayground: false,
    enableIntrospection: false
  },

  // Localization
  localization: {
    defaultLocale: 'he',
    timezone: 'Asia/Jerusalem'
  }
};





