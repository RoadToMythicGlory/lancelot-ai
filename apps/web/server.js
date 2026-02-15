const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const path = require('path')
const fs = require('fs')

const dev = process.env.NODE_ENV !== 'production'
// cPanel typically sets the hostname and port, so we use 0.0.0.0 to bind to all interfaces
const hostname = process.env.HOSTNAME || '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

// For standalone deployment, we need to serve static files manually
const staticDir = path.join(process.cwd(), '.next/static')
const publicDir = path.join(process.cwd(), 'public')

// MIME type mapping for common file types
const mimeTypes = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json'
}

// Function to serve static files
function serveStatic(filePath, res) {
  const ext = path.extname(filePath).toLowerCase()
  const mimeType = mimeTypes[ext] || 'application/octet-stream'
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404
      res.end('File not found')
      return
    }
    
    res.statusCode = 200
    res.setHeader('Content-Type', mimeType)
    
    // Set cache headers for static assets
    if (ext === '.js' || ext === '.css') {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.gif' || ext === '.webp' || ext === '.svg') {
      res.setHeader('Cache-Control', 'public, max-age=31536000')
    }
    
    res.end(data)
  })
}

// when using middleware `hostname` and `port` must be provided below
const app = next({ 
  dev, 
  hostname: dev ? 'localhost' : hostname,
  port,
  // For cPanel deployment, we need to ensure the app directory is correctly set
  dir: process.cwd()
})
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      // Be sure to pass true as the second argument to url.parse.
      // This tells it to parse the query portion of the URL.
      const parsedUrl = parse(req.url, true)
      const { pathname, query } = parsedUrl

      // Handle health check for cPanel/monitoring
      if (pathname === '/health') {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
        return
      }

      // Handle static files from _next/static
      if (pathname.startsWith('/_next/static/')) {
        const filePath = path.join(staticDir, pathname.replace('/_next/static', ''))
        if (fs.existsSync(filePath)) {
          serveStatic(filePath, res)
          return
        }
      }

      // Handle public files
      if (pathname.startsWith('/')) {
        const filePath = path.join(publicDir, pathname)
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          serveStatic(filePath, res)
          return
        }
      }

      // Handle all other requests with Next.js
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })
    .once('error', (err) => {
      console.error('Server error:', err)
      process.exit(1)
    })
    .listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`)
      console.log(`> Environment: ${dev ? 'development' : 'production'}`)
      console.log(`> Process ID: ${process.pid}`)
      console.log(`> Static files will be served from: ${staticDir}`)
      console.log(`> Public files will be served from: ${publicDir}`)
    })
})

