import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { BroadcastScheduleParser } from './broadcast-schedule-parser';
import { BroadcastArrayParser } from './broadcast-array-parser';

const app = express();

const MAX_EXCEL_BYTES = 10 * 1024 * 1024;

// Allowlist of MIME types accepted by the upload endpoint. Excel writes show
// up under both the modern Office Open XML mime and the legacy octet-stream
// when the browser cannot infer the type, but we still require the extension.
const ALLOWED_EXCEL_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_EXCEL_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ok = ALLOWED_EXCEL_MIMES.has(file.mimetype) && /\.(xlsx|xls)$/i.test(file.originalname || '');
    if (!ok) {
      return cb(new Error('Only .xls / .xlsx files are accepted'));
    }
    cb(null, true);
  },
});

// Strict CORS list, configurable via env in production deployments.
const allowedOrigins = (process.env.EXCEL_PARSER_CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
if (allowedOrigins.length === 0) {
  allowedOrigins.push('http://localhost:3000', 'https://www.lanceloterp.io', 'https://lanceloterp.io');
}

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Optional shared-secret auth: when EXCEL_PARSER_API_KEY is set, every parse
// request must present the same key in `x-api-key`. Recommended for production.
function apiKeyGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
  const expected = process.env.EXCEL_PARSER_API_KEY;
  if (!expected) return next();
  const provided = req.headers['x-api-key'];
  if (provided !== expected) {
    return res.status(401).json({ success: false, error: 'Invalid API key' });
  }
  next();
}

app.use('/parse-broadcast-schedule', apiKeyGuard);
app.use('/parse-broadcast-array', apiKeyGuard);

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'excel-parser',
  });
});

app.get('/status', (req, res) => {
  res.json({
    message: 'Lancelot Excel Parser is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Parse broadcast schedule Excel file
app.post(
  '/parse-broadcast-schedule',
  (req, res, next) => {
    upload.single('file')(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ success: false, error: `File exceeds ${MAX_EXCEL_BYTES} bytes` });
        }
        return res.status(400).json({ success: false, error: err.message });
      }
      if (err) {
        return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
      }
      next();
    });
  },
  async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ success: false, error: 'Empty file' });
    }

    const parser = new BroadcastScheduleParser();
    const result = parser.parseExcelFile(req.file.buffer);

    res.json({
      success: result.success,
      events: result.events,
      errors: result.errors,
      tempJsonPath: result.tempJsonPath,
      message: `Successfully parsed ${result.events.length} broadcast events`,
    });
  } catch (error) {
    console.error('Error parsing broadcast schedule:', error);
    const message = process.env.NODE_ENV === 'production'
      ? 'Failed to parse Excel file'
      : (error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      success: false,
      error: message,
    });
  }
}
);

// Parse broadcast ARRAY (weekly מערך) Excel file
app.post(
  '/parse-broadcast-array',
  (req, res, next) => {
    upload.single('file')(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ success: false, error: `File exceeds ${MAX_EXCEL_BYTES} bytes` });
        }
        return res.status(400).json({ success: false, error: err.message });
      }
      if (err) {
        return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }
      if (!req.file.buffer || req.file.buffer.length === 0) {
        return res.status(400).json({ success: false, error: 'Empty file' });
      }
      const parser = new BroadcastArrayParser();
      const result = parser.parseExcelFile(req.file.buffer);
      res.json({
        success: result.success,
        rows: result.rows,
        errors: result.errors,
        weekHint: result.weekHint,
        message: `Successfully parsed ${result.rows.length} broadcast-array rows`,
      });
    } catch (error) {
      console.error('Error parsing broadcast array:', error);
      const message = process.env.NODE_ENV === 'production'
        ? 'Failed to parse Excel file'
        : (error instanceof Error ? error.message : 'Unknown error');
      res.status(500).json({ success: false, error: message });
    }
  },
);

app.post('/parse-hebrew-excel', (req, res) => {
  res.json({
    message: 'Hebrew Excel parsing endpoint ready',
    status: 'not_implemented',
  });
});

const port = parseInt(process.env.PORT || '4002', 10);
app.listen(port, () => {
  console.log(`🚀 Excel Parser running on http://localhost:${port}`);
  console.log(`🔍 Health check: http://localhost:${port}/health`);
  console.log(`📊 Parse broadcast schedule: POST http://localhost:${port}/parse-broadcast-schedule`);
  console.log(`🎬 Parse broadcast array:    POST http://localhost:${port}/parse-broadcast-array`);
});

export default app; 