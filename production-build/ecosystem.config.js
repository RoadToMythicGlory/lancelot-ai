module.exports = {
  apps: [
    {
      name: 'lancelot-api',
      script: './services/api-gateway/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    },
    {
      name: 'lancelot-web',
      script: 'npm',
      args: 'start',
      cwd: './apps/web',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'lancelot-excel',
      script: './services/excel-parser/dist/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    }
  ]
};
