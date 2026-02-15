# Excel Time Formatting and Hebrew Metadata in Broadcast Planning

## Overview

The Excel parser now properly handles various time formats that Excel uses, including:

1. **Decimal Time Format** - Excel's internal representation (0.5 = 12:00 PM)
2. **String Time Format** - Standard HH:MM format
3. **AM/PM Format** - 12-hour clock with AM/PM indicators
4. **Hebrew Time Format** - Time with Hebrew text (e.g., "14:30 שעה")
5. **Date Objects** - JavaScript Date objects from Excel

## How It Works

### Time Parsing

The parser uses a sophisticated `parseTimeValue()` function that handles:

```typescript
// Excel decimal time (fraction of day)
0.5      → "12:00"  // Noon
0.75     → "18:00"  // 6 PM
0.041667 → "01:00"  // 1 AM

// String formats
"14:30"     → "14:30"
"9:45 AM"   → "09:45"
"9:45 PM"   → "21:45"
"14:30 שעה" → "14:30"

// Date objects
new Date() → Extracts hours and minutes
```

### Date Parsing

The parser also handles Excel's date formats:

```typescript
// Excel serial date (days since 1900)
44927 → "01/01/2023"

// String formats
"15/06/2025"   → "15/06/2025"
"15.06.2025"   → "15/06/2025"
"15-06-2025"   → "15/06/2025"
"15/6/25"      → "15/06/2025"

// Date objects
new Date(2025, 5, 15) → "15/06/2025"
```

## Temp JSON Files

The parser saves processed events to temp JSON files for:

1. **Debugging** - Easy inspection of parsed data
2. **Validation** - Verify time formatting is correct
3. **Integration** - Other services can read the formatted data

Files are saved to: `services/excel-parser/temp/broadcast-events-{timestamp}.json`

## Usage

### Via API Endpoint

```bash
POST http://localhost:4002/parse-broadcast-schedule
Content-Type: multipart/form-data

file: [Excel file]
```

### Response Format

```json
{
  "success": true,
  "events": [
    {
      "title": "Event Name",
      "startTime": "14:30",  // Always in HH:MM format
      "date": "15/06/2025",  // Always in DD/MM/YYYY format
      "channel": "CHANNEL 1",
      "eventType": "live",
      "location": "אולפן",
      "notes": "",
      "metadata": {
        "departments": { ... }
      }
    }
  ],
  "errors": [],
  "tempJsonPath": "/path/to/temp/broadcast-events-1234567890.json",
  "message": "Successfully parsed 25 broadcast events"
}
```

## Testing

Run the test script to see various time format handling:

```bash
npm run test:excel
```

This will create a test Excel file with various time formats and show how they're parsed.

## Common Issues and Solutions

### Issue: Time shows as decimal (0.5 instead of 12:00)
**Solution**: The parser now automatically detects and converts Excel decimal time format.

### Issue: Date shows as number (44927)
**Solution**: The parser converts Excel serial dates to DD/MM/YYYY format.

### Issue: AM/PM times not converting to 24-hour
**Solution**: The parser handles AM/PM conversion automatically.

### Issue: Hebrew text mixed with time
**Solution**: The parser extracts time from Hebrew text patterns.

## Hebrew Metadata Handling

The parser now automatically wraps Hebrew metadata from Excel columns in `customData` for each department.

### How It Works

1. **Column Recognition**: Known Hebrew columns (שעה, תאריך, ערוץ, etc.) are mapped to standard fields
2. **Metadata Collection**: Unknown Hebrew columns are collected as metadata
3. **Department Categorization**: Metadata is categorized by department based on keywords:
   - **Broadcast Array**: שידור, מערך, עורך, מפיק, טכנאי, שדר, קוים
   - **MCR**: מקור, גיבוי, מכשירים, ניתובים, MCR
   - **External Broadcasts**: הפקה, צוות, ציוד, צילום
   - **Closed Captions**: כתוביות, תרגום, נגישות
   - **Warehouse**: מחסן, ציוד, פריטים
   - **Playout**: קליטה, GMT, סינופסיס, פלייאאוט

### Example Excel Data

| שעה | תאריך | ערוץ | אירוע | מקום שידור | עורך | מפיק | מקור | כתוביות |
|-----|--------|------|-------|-------------|------|------|------|----------|
| 14:30 | 15/06/2025 | CHANNEL 1 | כדורגל | אולפן A | יוסי כהן | דני לוי | OB-VAN 1 | עברית |

### Resulting JSON Structure

```json
{
  "title": "כדורגל",
  "startTime": "14:30",
  "date": "15/06/2025",
  "channel": "CHANNEL 1",
  "metadata": {
    "departments": {
      "broadcastArray": {
        "customData": {
          "מקום שידור": "אולפן A",
          "עורך": "יוסי כהן",
          "מפיק": "דני לוי"
        }
      },
      "mcr": {
        "customData": {
          "מקור": "OB-VAN 1"
        }
      },
      "closedCaptions": {
        "customData": {
          "כתוביות": "עברית"
        }
      }
    },
    "rawHebrewData": {
      "מקום שידור": "אולפן A",
      "עורך": "יוסי כהן",
      "מפיק": "דני לוי",
      "מקור": "OB-VAN 1",
      "כתוביות": "עברית"
    }
  }
}
```

### Testing Hebrew Metadata

Run the Hebrew metadata test:

```bash
npm run test:hebrew
```

This will show how Hebrew columns are categorized and wrapped in customData for each department. 