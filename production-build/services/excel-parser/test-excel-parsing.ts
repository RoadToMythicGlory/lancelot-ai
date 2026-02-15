import * as XLSX from 'xlsx';
import { BroadcastScheduleParser } from './src/broadcast-schedule-parser';
import * as fs from 'fs';
import * as path from 'path';

// Test data with various time formats
const testData = [
  { 
    time: 0.5, // Excel decimal time: 12:00 PM
    date: '15/06/2025',
    channel: 'CHANNEL 1',
    eventName: 'Test Event 1 - Decimal Time'
  },
  {
    time: '14:30',
    date: 44927, // Excel serial date
    channel: '5 LIVE',
    eventName: 'Test Event 2 - String Time'
  },
  {
    time: '9:45 AM',
    date: new Date(2025, 5, 15), // JavaScript Date
    channel: '5 STARS',
    eventName: 'Test Event 3 - AM/PM Time'
  },
  {
    time: 0.75, // 18:00 (6:00 PM)
    date: '15.06.2025',
    channel: 'SPORT 4K',
    eventName: 'Test Event 4 - Evening Time'
  },
  {
    time: '23:59',
    date: '15-06-2025',
    channel: '5 PLUS',
    eventName: 'Test Event 5 - Late Night'
  }
];

console.log('🧪 Testing Excel Time Formatting...\n');

// Create a test workbook
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(testData);

// Add the worksheet to the workbook
XLSX.utils.book_append_sheet(wb, ws, 'TestSchedule');

// Write to buffer
const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

// Parse with our improved parser
const parser = new BroadcastScheduleParser();
const result = parser.parseExcelFile(buffer);

console.log('📊 Parsing Results:');
console.log(`✅ Success: ${result.success}`);
console.log(`📋 Events parsed: ${result.events.length}`);
console.log(`❌ Errors: ${result.errors.length}`);

if (result.errors.length > 0) {
  console.log('\n⚠️  Errors:');
  result.errors.forEach(error => console.log(`  - ${error}`));
}

console.log('\n📅 Parsed Events:');
result.events.forEach((event, index) => {
  console.log(`\n${index + 1}. ${event.title}`);
  console.log(`   Time: ${event.startTime}`);
  console.log(`   Date: ${event.date}`);
  console.log(`   Channel: ${event.channel}`);
});

// Show the temp JSON file location
if (result.tempJsonPath) {
  console.log(`\n💾 Temp JSON saved to: ${result.tempJsonPath}`);
  
  // Read and display a sample of the JSON
  const jsonContent = fs.readFileSync(result.tempJsonPath, 'utf-8');
  const parsedJson = JSON.parse(jsonContent);
  console.log('\n📄 Sample JSON output:');
  console.log(JSON.stringify(parsedJson[0], null, 2));
}

console.log('\n✨ Excel time formatting test complete!'); 