# Excel Import Guide - Lancelot Platform

## Overview
The Lancelot platform now supports full Excel import functionality for broadcast schedules! You can upload your Excel files directly through the web interface, and the system will parse and import all events automatically.

## How It Works

### 1. Excel Parser Service
The Excel parser service port depends on context:
- **Docker** (`docker-compose up`): port `3002` (set via `PORT` env var)
- **Local dev** (`npm start` without env): port `4002` (code default)

The api-gateway `EXCEL_PARSER_URL` defaults to `http://localhost:3002` (matching Docker).

The service provides:
- Hebrew column name mapping
- Automatic channel detection
- Sport event parsing
- Department metadata extraction
- Date/time normalization

### 2. Supported Excel Formats
The parser supports Excel files (.xlsx, .xls) with the following Hebrew column names:

| Hebrew Column | English Mapping | Description |
|--------------|-----------------|-------------|
| שעה | time | Event start time |
| תאריך | date | Event date |
| ערוץ | channel | Broadcast channel |
| סוג | eventType | Event type |
| אירוע | eventName | Event name |
| מיקום | location | Event location |
| הערות | notes | Additional notes |
| ענף | sport | Sport type |
| ליגה/ענף | league | League name |
| שלב | stage | Competition stage |
| מארחת | homeTeam | Home team |
| אורחת | awayTeam | Away team |
| KO / TO | koTime | Kick-off time |
| סיום | endTime | End time |
| כ"ס / פטיליות | subtitles | Subtitles required |
| ערוץ מקביל | parallelChannel | Parallel channel |
| 5 SPORT 4K | channel1_4k | 4K broadcast |

### 3. Channel Mapping
The parser automatically detects and normalizes channel names:
- SPORT → CHANNEL 1
- LIVE → CHANNEL 4
- PLUS → CHANNEL 2
- GOLD → CHANNEL 3
- STARS → CHANNEL 5
- 4K → CHANNEL 1 4K

## Usage Instructions

### Starting the Services
Run the PowerShell script to start all services:
```powershell
.\start-all-services.ps1
```

Or start services individually:
```powershell
# Start databases
docker-compose up mongodb

# Start API Gateway
cd services/api-gateway
npm run start:dev

# Start Excel Parser
cd services/excel-parser
npm start

# Start Web Frontend
cd apps/web
npm run dev
```

### Importing Excel Files

1. Navigate to the Broadcast Planning page
2. Click the "+" button to add events
3. Select "ייבוא מקובץ Excel" (Import from Excel file)
4. Choose your Excel file
5. Review the preview of events to be imported
6. Click "ייבא" (Import) to confirm

### What Happens During Import

1. **File Upload**: The Excel file is sent to the parser service
2. **Parsing**: The service extracts all broadcast events
3. **Preview**: You see a preview of events before importing
4. **Validation**: The system checks for channel overlaps
5. **Import**: Events are created in the database with all metadata

### Troubleshooting

#### Excel Parser Not Running
If you see connection errors, make sure the Excel parser is running:
```powershell
cd services/excel-parser
npm start
```

#### Hebrew Text Issues
The parser handles Hebrew text automatically. If you see garbled text:
1. Ensure your Excel file is saved with UTF-8 encoding
2. Check that Hebrew columns use the exact names listed above

#### Missing Data
The parser is flexible and will import events even with missing fields. Required fields:
- Time (שעה)
- Date (תאריך)
- Channel (ערוץ) - defaults to "CHANNEL 1"

## Example Excel Structure

Your Excel file should look like this:

| תאריך | שעה | ערוץ | ענף | ליגה/ענף | שלב | מארחת | אורחת | KO / TO | הערות |
|--------|------|------|-----|----------|-----|--------|--------|---------|--------|
| 29/06/2025 | 20:30 | SPORT | כדורגל | ליגת העל | מחזור 10 | מכבי ת"א | הפועל ת"א | 20:30 | דרבי |
| 30/06/2025 | 19:00 | PLUS | כדורסל | ווינר סל | רבע גמר | הפועל ירושלים | מכבי ת"א | 19:00 | |

## API Reference

### Parse Broadcast Schedule
```
POST http://localhost:<PORT>/parse-broadcast-schedule
Content-Type: multipart/form-data

file: [Excel file]
```
> Port is `3002` in Docker, `4002` in local dev (unless `PORT` env is set).

Response:
```json
{
  "success": true,
  "events": [...],
  "errors": [],
  "tempJsonPath": "path/to/temp/file.json",
  "message": "Successfully parsed 50 broadcast events"
}
```

## Notes

- The Excel parser saves temporary JSON files in `services/excel-parser/temp/` for debugging
- All Hebrew metadata is preserved in the `metadata.rawHebrewData` field
- Department-specific data is categorized automatically
- The parser handles various date/time formats automatically 