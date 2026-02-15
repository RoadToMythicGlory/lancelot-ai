import { BroadcastScheduleParser } from './src/broadcast-schedule-parser';
import * as fs from 'fs';
import * as path from 'path';

// Test with real Excel file
const excelPath = path.join(__dirname, '../../schedules/תכנונית/תכנונית_שבוע_25_2025.xlsx');

console.log('🧪 Testing Real Excel File Parsing...\n');
console.log('📁 File:', excelPath);

if (!fs.existsSync(excelPath)) {
  console.error('❌ Excel file not found!');
  process.exit(1);
}

// Read the file
const buffer = fs.readFileSync(excelPath);

// Parse with our parser
const parser = new BroadcastScheduleParser();
const result = parser.parseExcelFile(buffer);

console.log('\n📊 Parsing Results:');
console.log(`✅ Success: ${result.success}`);
console.log(`📋 Events parsed: ${result.events.length}`);
console.log(`❌ Errors: ${result.errors.length}`);

if (result.errors.length > 0) {
  console.log('\n⚠️  Errors:');
  result.errors.forEach(error => console.log(`  - ${error}`));
}

// Show first 3 events in detail
console.log('\n📅 First 3 Events (Detailed):');
result.events.slice(0, 3).forEach((event, index) => {
  console.log(`\n${index + 1}. ${event.title}`);
  console.log(`   Time: ${event.startTime} on ${event.date}`);
  console.log(`   Channel: ${event.channel}`);
  console.log(`   Type: ${event.eventType}`);
  console.log(`   Location: ${event.location || 'N/A'}`);
  
  // Show event details
  if (event.metadata.eventDetails) {
    console.log('\n   📊 Event Details:');
    Object.entries(event.metadata.eventDetails).forEach(([key, value]) => {
      if (value) {
        console.log(`     ${key}: ${value}`);
      }
    });
  }
  
  // Show department data
  console.log('\n   🏢 Department Data:');
  Object.entries(event.metadata.departments).forEach(([dept, data]: [string, any]) => {
    if (data.customData && Object.keys(data.customData).length > 0) {
      console.log(`\n     ${dept}:`);
      Object.entries(data.customData).forEach(([key, value]) => {
        console.log(`       ${key}: ${value}`);
      });
    }
  });
  
  // Show raw Hebrew data
  if (event.metadata.rawHebrewData && Object.keys(event.metadata.rawHebrewData).length > 0) {
    console.log('\n   📝 Raw Hebrew Data:');
    Object.entries(event.metadata.rawHebrewData).forEach(([key, value]) => {
      console.log(`     ${key}: ${value}`);
    });
  }
});

// Summary of all events
console.log('\n📊 All Events Summary:');
result.events.forEach((event, index) => {
  console.log(`${index + 1}. ${event.startTime} - ${event.title} (${event.channel})`);
});

// Show the temp JSON file location
if (result.tempJsonPath) {
  console.log(`\n💾 Full data saved to: ${result.tempJsonPath}`);
}

console.log('\n✨ Real Excel parsing test complete!'); 