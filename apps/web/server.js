const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const path = require('path')
const fs = require('fs')
const http = require('http')

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

function proxyToApi(req, res) {
  const targetPath = req.url
  const headers = {
    ...req.headers,
    host: 'api.lanceloterp.io',
    origin: 'http://app.lanceloterp.io',
  }

  const proxyReq = http.request(
    {
      hostname: 'api.lanceloterp.io',
      port: 80,
      method: req.method,
      path: targetPath,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    },
  )

  proxyReq.on('error', (err) => {
    console.error('API proxy error:', err)
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'API proxy failed' }))
  })

  req.pipe(proxyReq)
}

// The Excel Parser runs as its own localhost-only Node process (managed
// by ~/lancelot-ai/lancelot-start-excel-parser.sh and supervised by the
// watchdog cron). Route the upload endpoint to it directly instead of
// going through the API gateway — the API has no parser, and proxying
// through `api.lanceloterp.io` used to 404 because nothing answered.
const EXCEL_PARSER_PORT = parseInt(process.env.EXCEL_PARSER_PORT || '4002', 10)
function proxyToExcelParser(req, res) {
  const headers = {
    ...req.headers,
    host: `127.0.0.1:${EXCEL_PARSER_PORT}`,
  }
  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: EXCEL_PARSER_PORT,
      method: req.method,
      path: req.url,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    },
  )

  proxyReq.on('error', (err) => {
    console.error('Excel parser proxy error:', err)
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Excel parser unavailable' }))
  })

  req.pipe(proxyReq)
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

      if (
        pathname === '/parse-broadcast-schedule' ||
        pathname === '/parse-broadcast-array'
      ) {
        proxyToExcelParser(req, res)
        return
      }

      if (
        pathname === '/graphql' ||
        pathname.startsWith('/socket.io') ||
        pathname.startsWith('/api/')
      ) {
        proxyToApi(req, res)
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

