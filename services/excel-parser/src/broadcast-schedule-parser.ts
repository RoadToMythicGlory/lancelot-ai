import * as XLSX from 'xlsx';

interface BroadcastScheduleRow {
  time?: string | number;
  date?: string | number;
  channel?: string;
  eventType?: string;
  eventName?: string;
  location?: string;
  notes?: string;
  [key: string]: any;
}

interface ParsedBroadcastEvent {
  title: string;
  startTime: string;
  // Optional additional time fields derived from Excel
  koTime?: string;
  endTime?: string;
  date: string;
  channel: string;
  eventType: string;
  location?: string;
  notes?: string;
  metadata: {
    departments: {
      broadcastArray: {
        customData?: Record<string, any>;
      };
      mcr: {
        customData?: Record<string, any>;
      };
      externalBroadcasts: {
        customData?: Record<string, any>;
      };
      closedCaptions: {
        customData?: Record<string, any>;
      };
      warehouse: {
        customData?: Record<string, any>;
      };
      playout: {
        customData?: Record<string, any>;
      };
    };
    rawHebrewData?: Record<string, any>;
    // Alias for UI importers expecting `metadata.raw`
    raw?: Record<string, any>;
    eventDetails?: Record<string, any>;
  };
}

export class BroadcastScheduleParser {
  
  parseExcelFile(buffer: Buffer): {
    success: boolean;
    events: ParsedBroadcastEvent[];
    errors: string[];
    tempJsonPath?: string;
  } {
    const errors: string[] = [];
    const events: ParsedBroadcastEvent[] = [];

    try {
      // Read Excel file with proper date/time handling
      const workbook = XLSX.read(buffer, { 
        type: 'buffer', 
        cellDates: true,
        dateNF: 'dd/mm/yyyy',
        cellNF: true,
        raw: false
      });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON with raw values to handle time properly
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        dateNF: 'dd/mm/yyyy',
        defval: ''
      });

      console.log('📊 Parsed Excel data:', jsonData.length, 'rows');

      // Process each row
      jsonData.forEach((row: any, index: number) => {
        try {
          const event = this.parseRow(row, index);
          if (event) {
            events.push(event);
          }
        } catch (error) {
          errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });

      // Save to temp JSON file for debugging and verification
      const tempJsonPath = this.saveTempJson(events);

      return {
        success: events.length > 0,
        events,
        errors,
        tempJsonPath
      };
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      errors.push(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { success: false, events: [], errors };
    }
  }

  private parseRow(row: any, index: number): ParsedBroadcastEvent | null {
    // Skip empty rows
    if (!row || Object.keys(row).length === 0) {
      return null;
    }

    // Log all columns in the first row to debug
    if (index === 0) {
      console.log('📊 Excel columns found:', Object.keys(row));
      console.log('📊 First row data:', row);
    }

    // Map Hebrew column names to English - EXPANDED based on actual Excel columns
    const columnMappings: Record<string, string> = {
      'שעה': 'time',
      'תאריך': 'date',
      'ערוץ': 'channel',
      'סוג': 'eventType',
      'אירוע': 'eventName',
      'מיקום': 'location',
      'הערות': 'notes',
      'יום': 'day',
      'שבוע': 'week',
      'KO / TO': 'koTime',
      'ענף': 'sport',
      'ליגה/ענף': 'league',  // Updated based on actual column name
      'ליגה/תחרות': 'league', // Keep both variants
      'שלב': 'stage',
      'מארחת': 'homeTeam',    // Updated based on actual column name
      'מאירח': 'homeTeam',     // Keep both variants
      'אורחת': 'awayTeam',
      'ישיר': 'live',
      'סיום': 'endTime',
      'כ"ס': 'subtitles',      // Updated based on actual column name
      'פטיליות': 'subtitles',  // Keep both variants
      'ערוץ מקביל': 'parallelChannel',
      '5 SPORT 4K': 'channel1_4k',
      'CHANNEL 1 4K': 'channel1_4k',
      // Additional mappings from the מערך file
      'שעת שידור': 'time',
      'שידור': 'eventName',
      'משחק': 'gameName',
      'מקום שידור': 'location',
      'עורך': 'editor',
      'מפיק': 'producer',
      'איש VTR (ריפליי)': 'vtrOperator',
      'טכנאי שידור / במאי': 'technicalDirector',
      'שדר + פרשן': 'commentators',
      'שדר קוים': 'lineCommentator'
    };

    // Create normalized row object and collect Hebrew metadata
    const normalizedRow: BroadcastScheduleRow = {};
    const hebrewMetadata: Record<string, any> = {};
    
    Object.keys(row).forEach(key => {
      const trimmedKey = key.trim();
      const normalizedKey = columnMappings[trimmedKey] || trimmedKey;
      
      // If it's a known field, add to normalized row
      if (columnMappings[trimmedKey]) {
        normalizedRow[normalizedKey] = row[key];
      } else {
        // Otherwise, it's Hebrew metadata - preserve it
        // Skip empty values to reduce noise
        if (row[key] !== '' && row[key] !== '-' && row[key] !== null && row[key] !== undefined) {
          hebrewMetadata[trimmedKey] = row[key];
        }
      }
    });

    // Log Hebrew metadata for first few rows to debug
    if (index < 3) {
      console.log(`📊 Row ${index + 2} Hebrew metadata:`, hebrewMetadata);
    }

    // Extract time from first column or 'time' field
    const time = this.extractTime(normalizedRow);
    if (!time) {
      console.warn(`Row ${index + 2}: No time found, skipping`);
      return null;
    }

    // Extract date - could be in column header or specific field
    const date = this.extractDate(normalizedRow, row);
    if (!date) {
      console.warn(`Row ${index + 2}: No date found, skipping`);
      return null;
    }

    // Extract channel/sport type (SPORT 4K, LIVE, etc.)
    const channel = this.extractChannel(normalizedRow, row);

    // Extract event details - try multiple fields
    const eventName = normalizedRow.eventName || 
                     this.extractEventName(normalizedRow, row) || 
                     normalizedRow.sport || 
                     'אירוע ללא שם';

    // Extract additional fields from normalized row
    const sport = normalizedRow.sport || hebrewMetadata['ענף'] || '';
    const league = normalizedRow.league || hebrewMetadata['ליגה/תחרות'] || '';
    const stage = normalizedRow.stage || hebrewMetadata['שלב'] || '';
    const homeTeam = normalizedRow.homeTeam || hebrewMetadata['מאירח'] || '';
    const awayTeam = normalizedRow.awayTeam || hebrewMetadata['אורחת'] || '';

    // Build a better title from the available data
    const titleParts = [];
    if (sport) titleParts.push(sport);
    if (league) titleParts.push(league);
    if (stage) titleParts.push(stage);
    if (homeTeam && awayTeam) {
      titleParts.push(`${homeTeam} vs ${awayTeam}`);
    } else if (homeTeam || awayTeam) {
      titleParts.push(homeTeam || awayTeam);
    }
    
    const enhancedTitle = titleParts.length > 0 ? titleParts.join(' - ') : eventName;

    // Categorize Hebrew metadata by department based on keywords
    const departmentMetadata = this.categorizeHebrewMetadata(hebrewMetadata);

    // Prepare additional time fields if present
    const koTimeParsed = normalizedRow.koTime ? this.parseTimeValue(normalizedRow.koTime) : null;
    const endTimeParsed = normalizedRow.endTime ? this.parseTimeValue(normalizedRow.endTime) : null;

    // Create the broadcast event
    const broadcastEvent: ParsedBroadcastEvent = {
      title: enhancedTitle,
      startTime: time,
      ...(koTimeParsed ? { koTime: koTimeParsed } : {}),
      ...(endTimeParsed ? { endTime: endTimeParsed } : {}),
      date: date,
      channel: channel || 'CHANNEL 1',
      eventType: normalizedRow.live === 'LIVE' || normalizedRow.live === 'כן' || normalizedRow.live === 'ישיר' ? 'live' : 'recorded',
      location: normalizedRow.location || this.extractLocation(row) || undefined,
      notes: normalizedRow.notes || '',
      metadata: {
        departments: {
          broadcastArray: {
            customData: departmentMetadata.broadcastArray
          },
          mcr: {
            customData: departmentMetadata.mcr
          },
          externalBroadcasts: {
            customData: departmentMetadata.externalBroadcasts
          },
          closedCaptions: {
            customData: departmentMetadata.closedCaptions
          },
          warehouse: {
            customData: departmentMetadata.warehouse
          },
          playout: {
            customData: departmentMetadata.playout
          }
        },
        // Store all raw Hebrew data for reference
        rawHebrewData: hebrewMetadata,
        // Alias for UI that expects `raw`
        raw: hebrewMetadata,
        // Store normalized fields that might be useful
        eventDetails: {
          sport,
          league,
          stage,
          homeTeam,
          awayTeam,
          koTime: normalizedRow.koTime,
          endTime: normalizedRow.endTime,
          subtitles: normalizedRow.subtitles,
          parallelChannel: normalizedRow.parallelChannel,
          channel1_4k: this.parseBooleanValue(normalizedRow.channel1_4k),
          live: normalizedRow.live
        }
      }
    };

    return broadcastEvent;
  }

  private extractTime(row: BroadcastScheduleRow): string | null {
    // Check common time fields
    if (row.time !== undefined && row.time !== '') {
      return this.parseTimeValue(row.time);
    }

    // Check first few columns for time pattern or Excel time value
    for (const value of Object.values(row)) {
      if (value !== undefined && value !== '') {
        const parsedTime = this.parseTimeValue(value);
        if (parsedTime) {
          return parsedTime;
        }
      }
    }

    return null;
  }

  private parseTimeValue(value: any): string | null {
    // Handle Excel decimal time format (fraction of day)
    if (typeof value === 'number' && value >= 0 && value < 1) {
      // Excel stores time as fraction of day (e.g., 0.5 = 12:00 PM)
      const totalMinutes = Math.round(value * 24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    // Handle string time format
    if (typeof value === 'string') {
      // Try to match HH:MM format
      const timeMatch = value.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        return this.normalizeTime(value);
      }

      // Try to match time in Hebrew format (e.g., "14:30 שעה")
      const hebrewTimeMatch = value.match(/(\d{1,2}):(\d{2})\s*שעה/);
      if (hebrewTimeMatch) {
        return this.normalizeTime(`${hebrewTimeMatch[1]}:${hebrewTimeMatch[2]}`);
      }

      // Handle AM/PM format
      const ampmMatch = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)/i);
      if (ampmMatch) {
        let hours = parseInt(ampmMatch[1]);
        const minutes = ampmMatch[2];
        const period = ampmMatch[3].toUpperCase();
        
        if (period === 'PM' && hours !== 12) {
          hours += 12;
        } else if (period === 'AM' && hours === 12) {
          hours = 0;
        }
        
        return `${hours.toString().padStart(2, '0')}:${minutes}`;
      }
    }

    // Handle Date object (Excel might return Date for time cells)
    if (value instanceof Date) {
      const hours = value.getHours();
      const minutes = value.getMinutes();
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    return null;
  }

  private normalizeTime(time: string): string {
    const match = time.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const hours = match[1].padStart(2, '0');
      const minutes = match[2];
      return `${hours}:${minutes}`;
    }
    return time;
  }

  private extractDate(normalizedRow: BroadcastScheduleRow, originalRow: any): string | null {
    // Check if date is in a specific field
    if (normalizedRow.date !== undefined && normalizedRow.date !== '') {
      return this.normalizeDate(normalizedRow.date);
    }

    // Look for date patterns in all fields
    const datePattern = /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/;
    for (const value of Object.values(originalRow)) {
      if (value !== undefined && value !== '') {
        // Try to normalize any value that might be a date
        if (typeof value === 'number' || value instanceof Date) {
          const normalized = this.normalizeDate(value);
          // Check if it looks like a valid date
          if (normalized.match(/\d{2}\/\d{2}\/\d{4}/)) {
            return normalized;
          }
        } else if (typeof value === 'string' && datePattern.test(value)) {
          return this.normalizeDate(value);
        }
      }
    }

    // Default to today if no date found
    const today = new Date();
    return `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
  }

  private normalizeDate(date: string | number | Date): string {
    // Handle Excel serial date number
    if (typeof date === 'number') {
      // Excel serial date: days since 1900-01-01 (with leap year bug)
      const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
      const msPerDay = 24 * 60 * 60 * 1000;
      const dateObj = new Date(excelEpoch.getTime() + date * msPerDay);
      
      const day = dateObj.getDate().toString().padStart(2, '0');
      const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
      const year = dateObj.getFullYear();
      
      return `${day}/${month}/${year}`;
    }

    // Handle Date object
    if (date instanceof Date) {
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }

    // Handle string date format
    if (typeof date === 'string') {
      const match = date.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
      if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        let year = match[3];
        if (year.length === 2) {
          year = '20' + year;
        }
        return `${day}/${month}/${year}`;
      }
    }

    return date.toString();
  }

  private extractChannel(normalizedRow: BroadcastScheduleRow, originalRow: any): string | null {
    // Check for channel field first
    if (normalizedRow.channel) {
      // If the channel field already exists, normalize it to Hebrew
      return this.normalizeChannelToHebrew(normalizedRow.channel);
    }

    // Check for sport channel patterns and map to proper channel names
    // IMPORTANT: Channel order must be: 5 Sport, 5 Plus, 5 Gold, 5 Live, 5 Stars
    const channelMappings: Record<string, string> = {
      // English variants - comprehensive mapping
      '5 SPORT 4K': 'CHANNEL 1 4K',
      'SPORT 4K': 'CHANNEL 1 4K',
      '5SPORT4K': 'CHANNEL 1 4K',
      'CHANNEL1 4K': 'CHANNEL 1 4K',
      '5 SPORT': 'CHANNEL 1',
      'SPORT': 'CHANNEL 1',
      '5SPORT': 'CHANNEL 1',
      'CHANNEL1': 'CHANNEL 1',
      '5 LIVE': 'CHANNEL 4',
      'LIVE': 'CHANNEL 4',
      '5LIVE': 'CHANNEL 4',
      'SPORT LIVE': 'CHANNEL 4',
      '5 PLUS': 'CHANNEL 2',
      'PLUS': 'CHANNEL 2',
      '5PLUS': 'CHANNEL 2',
      'SPORT PLUS': 'CHANNEL 2',
      '5 STARS': 'CHANNEL 5',
      'STARS': 'CHANNEL 5',
      '5STARS': 'CHANNEL 5',
      'SPORT STARS': 'CHANNEL 5',
      '5 GOLD': 'CHANNEL 3',
      'GOLD': 'CHANNEL 3',
      '5GOLD': 'CHANNEL 3',
      'SPORT GOLD': 'CHANNEL 3',
      // Additional English patterns
      'CHANNEL 1': 'CHANNEL 1',
      'CHANNEL 4': 'CHANNEL 4',
      'CHANNEL 2': 'CHANNEL 2',
      'CHANNEL 3': 'CHANNEL 3',
      'CHANNEL 5': 'CHANNEL 5',
      // Hebrew variants normalization
      'CHANNEL 3': 'CHANNEL 3'
    };

    for (const value of Object.values(originalRow)) {
      if (typeof value === 'string') {
        const upperValue = value.toUpperCase().trim();
        
        // First try exact matches
        if (channelMappings[upperValue]) {
          return channelMappings[upperValue];
        }
        
        // Then try substring matches (longer patterns first)
        const patterns = Object.keys(channelMappings).sort((a, b) => b.length - a.length);
        for (const pattern of patterns) {
          if (upperValue.includes(pattern)) {
            return channelMappings[pattern];
          }
        }
        
        // Check for example.com
        if (value.includes('example.com')) {
          return 'CHANNEL 1';
        }
      }
    }

    return 'CHANNEL 1'; // Default channel
  }

  // Helper method to normalize any channel value to Hebrew format
  private normalizeChannelToHebrew(channel: string): string {
    const channelMappings: Record<string, string> = {
      // English to Hebrew mappings
      '5 SPORT 4K': 'CHANNEL 1 4K',
      'SPORT 4K': 'CHANNEL 1 4K',
      '5SPORT4K': 'CHANNEL 1 4K',
      'CHANNEL1 4K': 'CHANNEL 1 4K',
      '5 SPORT': 'CHANNEL 1',
      'SPORT': 'CHANNEL 1',
      '5SPORT': 'CHANNEL 1',
      'CHANNEL1': 'CHANNEL 1',
      '5 LIVE': 'CHANNEL 4',
      'LIVE': 'CHANNEL 4',
      '5LIVE': 'CHANNEL 4',
      'SPORT LIVE': 'CHANNEL 4',
      '5 PLUS': 'CHANNEL 2',
      'PLUS': 'CHANNEL 2',
      '5PLUS': 'CHANNEL 2',
      'SPORT PLUS': 'CHANNEL 2',
      '5 STARS': 'CHANNEL 5',
      'STARS': 'CHANNEL 5',
      '5STARS': 'CHANNEL 5',
      'SPORT STARS': 'CHANNEL 5',
      '5 GOLD': 'CHANNEL 3',
      'GOLD': 'CHANNEL 3',
      '5GOLD': 'CHANNEL 3',
      'SPORT GOLD': 'CHANNEL 3',
      'CHANNEL 1': 'CHANNEL 1',
      'CHANNEL 4': 'CHANNEL 4',
      'CHANNEL 2': 'CHANNEL 2',
      'CHANNEL 3': 'CHANNEL 3',
      'CHANNEL 5': 'CHANNEL 5',
      // Hebrew variants normalization
      'CHANNEL 3': 'CHANNEL 3'
    };

    const upperChannel = channel.toUpperCase().trim();
    
    // Try exact match first
    if (channelMappings[upperChannel]) {
      return channelMappings[upperChannel];
    }
    
    // Try substring matches (longer patterns first)
    const patterns = Object.keys(channelMappings).sort((a, b) => b.length - a.length);
    for (const pattern of patterns) {
      if (upperChannel.includes(pattern)) {
        return channelMappings[pattern];
      }
    }
    
    // If already in Hebrew format, return as is
    if (/[\u0590-\u05FF]/.test(channel)) {
      return channel;
    }
    
    // Default fallback
    return 'CHANNEL 1';
  }

  private extractEventName(normalizedRow: BroadcastScheduleRow, originalRow: any): string | null {
    // Check for event name field
    if (normalizedRow.eventName) {
      return normalizedRow.eventName;
    }

    // Look for Hebrew text that might be event name
    // Skip time, date, and channel patterns
    const skipPatterns = /^\d{1,2}:\d{2}$|^\d{1,2}[\/\.]\d{1,2}|^(SPORT|LIVE|PLUS|STARS)/;
    
    for (const value of Object.values(originalRow)) {
      if (typeof value === 'string' && value.trim() && !skipPatterns.test(value)) {
        // Check if it contains Hebrew characters
        if (/[\u0590-\u05FF]/.test(value)) {
          return value.trim();
        }
      }
    }

    return null;
  }

  private extractLocation(row: any): string | null {
    // Look for location patterns
    const locationKeywords = ['אולפן', 'סטודיו', 'איצטדיון', 'אולם', 'מגרש'];
    
    for (const value of Object.values(row)) {
      if (typeof value === 'string') {
        for (const keyword of locationKeywords) {
          if (value.includes(keyword)) {
            return value;
          }
        }
      }
    }

    return null;
  }

  private categorizeHebrewMetadata(hebrewData: Record<string, any>) {
    // Keywords to categorize metadata by department
    const departmentKeywords = {
      broadcastArray: ['שידור', 'מערך', 'עורך', 'מפיק', 'טכנאי', 'שדר', 'קוים', 'VTR', 'במאי', 'פרשן'],
      mcr: ['מקור', 'גיבוי', 'מכשירים', 'ניתובים', 'MCR', 'ניתוב'],
      externalBroadcasts: ['הפקה', 'צוות', 'ציוד', 'צילום', 'חוץ'],
      closedCaptions: ['כתוביות', 'תרגום', 'נגישות', 'כ"ס'],
      warehouse: ['מחסן', 'ציוד', 'פריטים', 'ברקוד'],
      playout: ['קליטה', 'GMT', 'סינופסיס', 'פלייאאוט', 'שידור חוזר']
    };

    const categorized: Record<string, any> = {
      broadcastArray: {},
      mcr: {},
      externalBroadcasts: {},
      closedCaptions: {},
      warehouse: {},
      playout: {}
    };

    // Categorize each Hebrew field
    Object.entries(hebrewData).forEach(([key, value]) => {
      let assigned = false;
      
      // Check each department's keywords
      for (const [dept, keywords] of Object.entries(departmentKeywords)) {
        if (keywords.some(keyword => key.includes(keyword))) {
          categorized[dept][key] = value;
          assigned = true;
          break;
        }
      }
      
      // If not assigned to any department, add to all departments
      // This ensures no data is lost
      if (!assigned) {
        Object.keys(categorized).forEach(dept => {
          categorized[dept][key] = value;
        });
      }
    });

    return categorized;
  }

  private parseBooleanValue(value: any): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();
      
      // Check for explicit boolean strings
      if (lowerValue === 'true' || lowerValue === 'כן' || lowerValue === 'yes' || lowerValue === '1') {
        return true;
      }
      if (lowerValue === 'false' || lowerValue === 'לא' || lowerValue === 'no' || lowerValue === '0' || lowerValue === '') {
        return false;
      }
      
      // If it contains the channel name or '4K', consider it true
      if (lowerValue.includes('4k') || lowerValue.includes('sport') || lowerValue === '5 sport 4k') {
        return true;
      }
    }
    
    if (typeof value === 'number') {
      return value !== 0;
    }
    
    // Default to false for null, undefined, or unrecognized values
    return false;
  }

  private saveTempJson(events: ParsedBroadcastEvent[]): string {
    const fs = require('fs');
    const path = require('path');
    const tempDir = path.join(__dirname, '../temp');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = new Date().getTime();
    const filename = `broadcast-events-${timestamp}.json`;
    const filepath = path.join(tempDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(events, null, 2));
    console.log(`💾 Saved ${events.length} events to ${filepath}`);

    return filepath;
  }
} 