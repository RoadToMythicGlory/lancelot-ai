import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// Function to debug Excel columns
function debugExcelColumns(filePath: string) {
  console.log('🔍 Debugging Excel file:', filePath);
  
  try {
    // Read the file
    const buffer = fs.readFileSync(filePath);
    
    // Parse with XLSX
    const workbook = XLSX.read(buffer, { 
      type: 'buffer', 
      cellDates: true,
      raw: false
    });
    
    console.log('\n📋 Worksheets found:', workbook.SheetNames);
    
    // Process each worksheet
    workbook.SheetNames.forEach((sheetName, index) => {
      console.log(`\n📊 Sheet ${index + 1}: "${sheetName}"`);
      
      const worksheet = workbook.Sheets[sheetName];
      
      // Get the range
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      console.log(`   Range: ${worksheet['!ref']} (${range.e.r + 1} rows, ${range.e.c + 1} columns)`);
      
      // Get headers (first row)
      const headers: string[] = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        const cell = worksheet[cellAddress];
        headers.push(cell ? String(cell.v) : `Column ${col + 1}`);
      }
      
      console.log('\n   📑 Column Headers:');
      headers.forEach((header, idx) => {
        console.log(`      ${idx + 1}. "${header}"`);
      });
      
      // Convert to JSON to see how XLSX parses it
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        defval: ''
      });
      
      if (jsonData.length > 0) {
        console.log('\n   📄 First row as JSON:');
        console.log(JSON.stringify(jsonData[0], null, 2));
        
        console.log('\n   🔑 All unique column keys found:');
        const allKeys = new Set<string>();
        jsonData.forEach((row: any) => {
          Object.keys(row).forEach(key => allKeys.add(key));
        });
        Array.from(allKeys).sort().forEach(key => {
          console.log(`      - "${key}"`);
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Error reading Excel file:', error);
  }
}

// Check for Excel files in the schedules directory
const schedulesDir = path.join(__dirname, '../../schedules');
console.log('📁 Looking for Excel files in:', schedulesDir);

// Function to find Excel files recursively
function findExcelFiles(dir: string): string[] {
  const files: string[] = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...findExcelFiles(fullPath));
      } else if (item.endsWith('.xlsx') || item.endsWith('.xls')) {
        files.push(fullPath);
      }
    });
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}

// Find and debug all Excel files
const excelFiles = findExcelFiles(schedulesDir);
console.log(`\n📊 Found ${excelFiles.length} Excel files\n`);

excelFiles.forEach((file, index) => {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`File ${index + 1}/${excelFiles.length}`);
  console.log(`${'='.repeat(80)}`);
  debugExcelColumns(file);
});

console.log('\n✨ Debug complete!'); 