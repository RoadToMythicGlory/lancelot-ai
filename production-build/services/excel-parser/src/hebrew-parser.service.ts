import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { parse, isValid } from 'date-fns';
import { DatabaseService } from './database.service';

interface ScheduleRow {
  employeeName: string;
  employeeId?: string;
  department?: string;
  [key: string]: any; // Dynamic columns for days
}

interface ParsedShift {
  employeeId: string;
  employeeName: string;
  date: Date;
  startTime: string;
  endTime: string;
  shiftType: string;
  department?: string;
}

@Injectable()
export class HebrewParserService {
  private readonly logger = new Logger(HebrewParserService.name);

  // Hebrew to English mappings
  private readonly hebrewDays: Record<string, number> = {
    'ראשון': 0,
    'שני': 1,
    'שלישי': 2,
    'רביעי': 3,
    'חמישי': 4,
    'שישי': 5,
    'שבת': 6,
    // Alternative spellings
    'יום א': 0,
    'יום ב': 1,
    'יום ג': 2,
    'יום ד': 3,
    'יום ה': 4,
    'יום ו': 5,
    'יום ש': 6,
  };

  private readonly hebrewMonths: Record<string, number> = {
    'ינואר': 1,
    'פברואר': 2,
    'מרץ': 3,
    'אפריל': 4,
    'מאי': 5,
    'יוני': 6,
    'יולי': 7,
    'אוגוסט': 8,
    'ספטמבר': 9,
    'אוקטובר': 10,
    'נובמבר': 11,
    'דצמבר': 12,
  };

  private readonly shiftPatterns = {
    morning: /בוקר|morning|06:00|07:00|08:00/i,
    evening: /ערב|evening|14:00|15:00|16:00/i,
    night: /לילה|night|22:00|23:00|00:00/i,
    full: /מלאה|full|משמרת מלאה/i,
  };

  constructor(private readonly db: DatabaseService) {}

  async parseExcelFile(
    buffer: Buffer,
    options: {
      departmentId?: string;
      startDate?: Date;
      preview?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    shifts: ParsedShift[];
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const shifts: ParsedShift[] = [];

    try {
      // Read Excel file
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json<ScheduleRow>(worksheet, {
        raw: false,
        dateNF: 'dd/mm/yyyy',
      });

      if (jsonData.length === 0) {
        errors.push('No data found in Excel file');
        return { success: false, shifts, errors, warnings };
      }

      // Analyze header structure
      const headers = Object.keys(jsonData[0]);
      const dateColumns = this.identifyDateColumns(headers);
      
      if (dateColumns.length === 0) {
        errors.push('Could not identify date columns in the Excel file');
        return { success: false, shifts, errors, warnings };
      }

      // Parse base date from sheet or use provided start date
      const baseDate = options.startDate || this.extractBaseDateFromSheet(worksheet);
      if (!baseDate) {
        errors.push('Could not determine the week/month for this schedule');
        return { success: false, shifts, errors, warnings };
      }

      // Process each row
      for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
        const row = jsonData[rowIndex];
        
        // Extract employee information
        const employeeInfo = await this.extractEmployeeInfo(row);
        if (!employeeInfo) {
          warnings.push(`Row ${rowIndex + 2}: Could not identify employee`);
          continue;
        }

        // Process each date column
        for (const dateCol of dateColumns) {
          const cellValue = row[dateCol];
          if (!cellValue || cellValue.toString().trim() === '') continue;

          try {
            const shiftData = this.parseShiftCell(cellValue.toString());
            if (!shiftData) continue;

            const shiftDate = this.calculateShiftDate(baseDate, dateCol);
            if (!shiftDate) {
              warnings.push(`Row ${rowIndex + 2}, Column ${dateCol}: Could not determine date`);
              continue;
            }

            shifts.push({
              employeeId: employeeInfo.id,
              employeeName: employeeInfo.name,
              date: shiftDate,
              startTime: shiftData.startTime,
              endTime: shiftData.endTime,
              shiftType: shiftData.type,
              department: employeeInfo.department || options.departmentId,
            });
          } catch (error) {
            warnings.push(
              `Row ${rowIndex + 2}, Column ${dateCol}: ${error.message}`
            );
          }
        }
      }

      // Validate parsed shifts
      const validationResults = await this.validateShifts(shifts);
      warnings.push(...validationResults.warnings);

      return {
        success: shifts.length > 0,
        shifts: validationResults.validShifts,
        errors,
        warnings,
      };
    } catch (error) {
      this.logger.error('Error parsing Excel file', error);
      errors.push(`Failed to parse Excel file: ${error.message}`);
      return { success: false, shifts: [], errors, warnings };
    }
  }

  private identifyDateColumns(headers: string[]): string[] {
    const dateColumns: string[] = [];

    for (const header of headers) {
      // Check if header contains Hebrew day names
      const lowerHeader = header.toLowerCase();
      const hasHebrewDay = Object.keys(this.hebrewDays).some(day =>
        header.includes(day)
      );

      // Check for date patterns (DD/MM, DD.MM, etc.)
      const hasDatePattern = /\d{1,2}[\/\.\-]\d{1,2}/.test(header);

      // Check for English day names
      const hasEnglishDay = /monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(
        header
      );

      if (hasHebrewDay || hasDatePattern || hasEnglishDay) {
        dateColumns.push(header);
      }
    }

    return dateColumns;
  }

  private extractBaseDateFromSheet(worksheet: XLSX.WorkSheet): Date | null {
    // Look for date in cell A1, B1, or specific cells
    const possibleDateCells = ['A1', 'B1', 'C1', 'A2', 'B2'];
    
    for (const cellRef of possibleDateCells) {
      const cell = worksheet[cellRef];
      if (!cell) continue;

      const value = cell.v?.toString() || '';
      
      // Try to parse various date formats
      const datePatterns = [
        /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/,
        /(\w+)\s+(\d{4})/,
        /שבוע\s+(\d{1,2})[\/\.\-](\d{1,2})/,
      ];

      for (const pattern of datePatterns) {
        const match = value.match(pattern);
        if (match) {
          // Parse based on pattern
          if (pattern.source.includes('\\w+')) {
            // Month name pattern
            const monthName = match[1];
            const year = parseInt(match[2]);
            const monthNum = this.hebrewMonths[monthName] || 
                           this.getEnglishMonth(monthName);
            
            if (monthNum) {
              return new Date(year, monthNum - 1, 1);
            }
          } else {
            // Numeric date pattern
            const day = parseInt(match[1]);
            const month = parseInt(match[2]);
            const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
            
            const date = new Date(year, month - 1, day);
            if (isValid(date)) {
              return date;
            }
          }
        }
      }
    }

    return null;
  }

  private async extractEmployeeInfo(
    row: ScheduleRow
  ): Promise<{ id: string; name: string; department?: string } | null> {
    // Common column names for employee information
    const nameColumns = [
      'שם',
      'עובד',
      'שם עובד',
      'name',
      'employee',
      'employee name',
    ];

    const idColumns = [
      'ת.ז',
      'תז',
      'מספר עובד',
      'id',
      'employee id',
      'employee_id',
    ];

    let name = '';
    let id = '';

    // Find name
    for (const col of nameColumns) {
      if (row[col]) {
        name = row[col].toString().trim();
        break;
      }
    }

    // Find ID
    for (const col of idColumns) {
      if (row[col]) {
        id = row[col].toString().trim();
        break;
      }
    }

    if (!name && !id) {
      return null;
    }

    // Try to find employee in database
    if (id) {
      const employee = await this.db.findEmployeeByEmployeeId(id);
      if (employee) {
        return {
          id: employee.id,
          name: employee.hebrewFirstName 
            ? `${employee.hebrewFirstName} ${employee.hebrewLastName}`
            : `${employee.firstName} ${employee.lastName}`,
          department: employee.departmentId,
        };
      }
    }

    // Try to match by name
    if (name) {
      const employee = await this.db.findEmployeeByName(name);
      if (employee) {
        return {
          id: employee.id,
          name: name,
          department: employee.departmentId,
        };
      }
    }

    // Generate temporary ID if not found
    return {
      id: `temp_${name || id}`,
      name: name || `Employee ${id}`,
      department: row.department || row['מחלקה'],
    };
  }

  private parseShiftCell(cellValue: string): {
    startTime: string;
    endTime: string;
    type: string;
  } | null {
    const value = cellValue.trim();
    
    // Skip empty cells or days off
    if (!value || /חופש|חופשה|חג|off|vacation/i.test(value)) {
      return null;
    }

    // Time range pattern (08:00-16:00, 8-16, etc.)
    const timeRangePattern = /(\d{1,2}):?(\d{0,2})\s*[-–]\s*(\d{1,2}):?(\d{0,2})/;
    const match = value.match(timeRangePattern);
    
    if (match) {
      const startHour = parseInt(match[1]);
      const startMin = match[2] ? parseInt(match[2]) : 0;
      const endHour = parseInt(match[3]);
      const endMin = match[4] ? parseInt(match[4]) : 0;

      return {
        startTime: `${startHour.toString().padStart(2, '0')}:${startMin
          .toString()
          .padStart(2, '0')}`,
        endTime: `${endHour.toString().padStart(2, '0')}:${endMin
          .toString()
          .padStart(2, '0')}`,
        type: this.detectShiftType(value, startHour),
      };
    }

    // Predefined shift types
    if (this.shiftPatterns.morning.test(value)) {
      return { startTime: '06:00', endTime: '14:00', type: 'morning' };
    }
    if (this.shiftPatterns.evening.test(value)) {
      return { startTime: '14:00', endTime: '22:00', type: 'evening' };
    }
    if (this.shiftPatterns.night.test(value)) {
      return { startTime: '22:00', endTime: '06:00', type: 'night' };
    }
    if (this.shiftPatterns.full.test(value)) {
      return { startTime: '08:00', endTime: '17:00', type: 'full' };
    }

    // Single letter shifts
    const letterShifts: Record<string, any> = {
      'ב': { startTime: '06:00', endTime: '14:00', type: 'morning' },
      'צ': { startTime: '14:00', endTime: '22:00', type: 'evening' },
      'ל': { startTime: '22:00', endTime: '06:00', type: 'night' },
      'M': { startTime: '06:00', endTime: '14:00', type: 'morning' },
      'E': { startTime: '14:00', endTime: '22:00', type: 'evening' },
      'N': { startTime: '22:00', endTime: '06:00', type: 'night' },
    };

    if (letterShifts[value]) {
      return letterShifts[value];
    }

    return null;
  }

  private calculateShiftDate(baseDate: Date, columnHeader: string): Date | null {
    // Extract day from column header
    let dayOffset = -1;

    // Check for Hebrew day names
    for (const [dayName, dayIndex] of Object.entries(this.hebrewDays)) {
      if (columnHeader.includes(dayName)) {
        dayOffset = dayIndex;
        break;
      }
    }

    // Check for date in header (e.g., "15/3" or "15.3")
    const dateMatch = columnHeader.match(/(\d{1,2})[\/\.\-](\d{1,2})/);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]);
      const year = baseDate.getFullYear();
      
      return new Date(year, month - 1, day);
    }

    // Calculate date based on day offset
    if (dayOffset >= 0) {
      const baseDayOfWeek = baseDate.getDay();
      const daysToAdd = dayOffset - baseDayOfWeek;
      
      const shiftDate = new Date(baseDate);
      shiftDate.setDate(baseDate.getDate() + daysToAdd);
      
      return shiftDate;
    }

    return null;
  }

  private detectShiftType(value: string, startHour: number): string {
    if (this.shiftPatterns.morning.test(value) || (startHour >= 5 && startHour <= 9)) {
      return 'morning';
    }
    if (this.shiftPatterns.evening.test(value) || (startHour >= 13 && startHour <= 17)) {
      return 'evening';
    }
    if (this.shiftPatterns.night.test(value) || (startHour >= 21 || startHour <= 3)) {
      return 'night';
    }
    return 'custom';
  }

  private getEnglishMonth(monthName: string): number | null {
    const months: Record<string, number> = {
      january: 1, february: 2, march: 3, april: 4,
      may: 5, june: 6, july: 7, august: 8,
      september: 9, october: 10, november: 11, december: 12,
    };
    
    return months[monthName.toLowerCase()] || null;
  }

  private async validateShifts(shifts: ParsedShift[]): Promise<{
    validShifts: ParsedShift[];
    warnings: string[];
  }> {
    const validShifts: ParsedShift[] = [];
    const warnings: string[] = [];

    for (const shift of shifts) {
      // Check for duplicate shifts
      const duplicate = validShifts.find(
        s =>
          s.employeeId === shift.employeeId &&
          s.date.getTime() === shift.date.getTime()
      );

      if (duplicate) {
        warnings.push(
          `Duplicate shift found for ${shift.employeeName} on ${shift.date.toLocaleDateString()}`
        );
        continue;
      }

      // Validate time format
      if (!this.isValidTimeFormat(shift.startTime) || !this.isValidTimeFormat(shift.endTime)) {
        warnings.push(
          `Invalid time format for ${shift.employeeName} on ${shift.date.toLocaleDateString()}`
        );
        continue;
      }

      // Check if employee exists (for non-temp IDs)
      if (!shift.employeeId.startsWith('temp_')) {
        const employeeExists = await this.db.checkEmployeeExists(shift.employeeId);
        if (!employeeExists) {
          warnings.push(`Employee not found in system: ${shift.employeeName}`);
        }
      }

      validShifts.push(shift);
    }

    return { validShifts, warnings };
  }

  private isValidTimeFormat(time: string): boolean {
    return /^\d{2}:\d{2}$/.test(time);
  }

  async generatePreview(
    shifts: ParsedShift[],
    format: 'table' | 'calendar' = 'table'
  ): Promise<any> {
    if (format === 'table') {
      // Group by employee
      const grouped = shifts.reduce((acc, shift) => {
        if (!acc[shift.employeeId]) {
          acc[shift.employeeId] = {
            employee: shift.employeeName,
            shifts: [],
          };
        }
        acc[shift.employeeId].shifts.push({
          date: shift.date.toLocaleDateString(),
          time: `${shift.startTime} - ${shift.endTime}`,
          type: shift.shiftType,
        });
        return acc;
      }, {} as Record<string, any>);

      return Object.values(grouped);
    }

    // Calendar format
    const calendar = shifts.reduce((acc, shift) => {
      const dateKey = shift.date.toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push({
        employee: shift.employeeName,
        time: `${shift.startTime} - ${shift.endTime}`,
        type: shift.shiftType,
      });
      return acc;
    }, {} as Record<string, any>);

    return calendar;
  }

  async importShifts(
    shifts: ParsedShift[],
    options: {
      overwrite?: boolean;
      notifyEmployees?: boolean;
    } = {}
  ): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const shift of shifts) {
      try {
        // Skip temporary employees
        if (shift.employeeId.startsWith('temp_')) {
          skipped++;
          errors.push(`Skipped shift for unidentified employee: ${shift.employeeName}`);
          continue;
        }

        // Check for existing shift
        const existing = await this.db.findExistingShift(
          shift.employeeId,
          shift.date,
          shift.startTime
        );

        if (existing && !options.overwrite) {
          skipped++;
          continue;
        }

        // Create or update shift
        await this.db.createOrUpdateShift({
          userId: shift.employeeId,
          departmentId: shift.department,
          startTime: this.combineDateAndTime(shift.date, shift.startTime),
          endTime: this.combineDateAndTime(shift.date, shift.endTime),
          status: 'scheduled',
          createdBy: 'excel_import',
        });

        imported++;
      } catch (error) {
        errors.push(
          `Failed to import shift for ${shift.employeeName} on ${shift.date.toLocaleDateString()}: ${error.message}`
        );
      }
    }

    return { imported, skipped, errors };
  }

  private combineDateAndTime(date: Date, time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    
    // Handle overnight shifts
    if (time === '00:00' || hours < 6) {
      combined.setDate(combined.getDate() + 1);
    }
    
    return combined;
  }
} 