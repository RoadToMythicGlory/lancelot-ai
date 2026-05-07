import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { BroadcastScheduleParser } from './broadcast-schedule-parser';

const app = express();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://www.lanceloterp.io',
    'https://lanceloterp.io',
  ],
  credentials: true,
}));
app.use(express.json());

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
app.post('/parse-broadcast-schedule', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
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
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

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
});

export default app; 