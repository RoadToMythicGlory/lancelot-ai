import * as XLSX from 'xlsx';
import { BroadcastScheduleParser } from './src/broadcast-schedule-parser';
import * as fs from 'fs';

// Test data with Hebrew metadata columns
const testData = [
  { 
    'שעה': '14:30',
    'תאריך': '15/06/2025',
    'ערוץ': 'CHANNEL 1',
    'אירוע': 'כדורגל - ליגת העל',
    'מיקום': 'אולפן ראשי',
    'הערות': 'שידור חי',
    // Hebrew metadata fields that should be wrapped in customData
    'מקום שידור': 'אולפן A',
    'שידור': 'ישיר מהאצטדיון',
    'עורך': 'יוסי כהן',
    'מפיק': 'דני לוי',
    'טכנאי שידור': 'משה דוד',
    'שדר': 'אבי נמני',
    'מקור': 'OB-VAN 1',
    'גיבוי': 'סטודיו B',
    'מכשירים': 'EVS, Vizrt',
    'ניתובים': 'Router 1 -> Studio A',
    'צוות הפקה': '15 אנשים',
    'ציוד צילום': '8 מצלמות HD',
    'כתוביות': 'עברית + אנגלית',
    'פריטי מחסן': 'מיקרופונים, כבלים',
    'זמן קליטה': '13:00',
    'GMT': '+2',
    'קובץ סינופסיס': 'synopsis_15062025.pdf'
  }
];

console.log('🧪 Testing Hebrew Metadata Wrapping in customData...\n');

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

if (result.events.length > 0) {
  const event = result.events[0];
  
  console.log('\n📅 Event Basic Info:');
  console.log(`  Title: ${event.title}`);
  console.log(`  Time: ${event.startTime}`);
  console.log(`  Date: ${event.date}`);
  console.log(`  Channel: ${event.channel}`);
  console.log(`  Location: ${event.location}`);
  
  console.log('\n🏢 Department Custom Data:');
  
  // Show broadcast array custom data
  console.log('\n  📡 Broadcast Array:');
  const broadcastData = event.metadata.departments.broadcastArray.customData;
  if (broadcastData && Object.keys(broadcastData).length > 0) {
    Object.entries(broadcastData).forEach(([key, value]) => {
      console.log(`    ${key}: ${value}`);
    });
  }
  
  // Show MCR custom data
  console.log('\n  🎛️ MCR:');
  const mcrData = event.metadata.departments.mcr.customData;
  if (mcrData && Object.keys(mcrData).length > 0) {
    Object.entries(mcrData).forEach(([key, value]) => {
      console.log(`    ${key}: ${value}`);
    });
  }
  
  // Show external broadcasts custom data
  console.log('\n  🎬 External Broadcasts:');
  const extData = event.metadata.departments.externalBroadcasts.customData;
  if (extData && Object.keys(extData).length > 0) {
    Object.entries(extData).forEach(([key, value]) => {
      console.log(`    ${key}: ${value}`);
    });
  }
  
  // Show closed captions custom data
  console.log('\n  📺 Closed Captions:');
  const ccData = event.metadata.departments.closedCaptions.customData;
  if (ccData && Object.keys(ccData).length > 0) {
    Object.entries(ccData).forEach(([key, value]) => {
      console.log(`    ${key}: ${value}`);
    });
  }
  
  // Show warehouse custom data
  console.log('\n  📦 Warehouse:');
  const whData = event.metadata.departments.warehouse.customData;
  if (whData && Object.keys(whData).length > 0) {
    Object.entries(whData).forEach(([key, value]) => {
      console.log(`    ${key}: ${value}`);
    });
  }
  
  // Show playout custom data
  console.log('\n  ▶️ Playout:');
  const playData = event.metadata.departments.playout.customData;
  if (playData && Object.keys(playData).length > 0) {
    Object.entries(playData).forEach(([key, value]) => {
      console.log(`    ${key}: ${value}`);
    });
  }
  
  // Show raw Hebrew data
  console.log('\n📝 Raw Hebrew Metadata:');
  if (event.metadata.rawHebrewData) {
    Object.entries(event.metadata.rawHebrewData).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
  }
}

// Show the temp JSON file location
if (result.tempJsonPath) {
  console.log(`\n💾 Temp JSON saved to: ${result.tempJsonPath}`);
  
  // Show a snippet of the JSON structure
  const jsonContent = fs.readFileSync(result.tempJsonPath, 'utf-8');
  const parsedJson = JSON.parse(jsonContent);
  console.log('\n📄 JSON Structure (departments with customData):');
  console.log(JSON.stringify(parsedJson[0].metadata.departments, null, 2));
}

console.log('\n✨ Hebrew metadata wrapping test complete!'); 