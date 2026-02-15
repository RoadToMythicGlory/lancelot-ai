import { HDate, Event, HebrewCalendar, Location } from '@hebcal/core';

// Map of Jewish holidays to their Hebrew names
const JEWISH_HOLIDAY_NAMES: Record<string, string> = {
  "Rosh Hashana": "ראש השנה",
  "Rosh Hashana I": "ראש השנה א'",
  "Rosh Hashana II": "ראש השנה ב'",
  "Yom Kippur": "יום כיפור",
  "Sukkot": "סוכות",
  "Sukkot I": "סוכות א'",
  "Sukkot II": "סוכות ב'",
  "Sukkot III (CH''M)": "חול המועד סוכות",
  "Sukkot IV (CH''M)": "חול המועד סוכות",
  "Sukkot V (CH''M)": "חול המועד סוכות",
  "Sukkot VI (CH''M)": "חול המועד סוכות",
  "Sukkot VII (Hoshana Raba)": "הושענא רבה",
  "Shmini Atzeret": "שמיני עצרת",
  "Simchat Torah": "שמחת תורה",
  "Chanukah": "חנוכה",
  "Chanukah: 1 Candle": "חנוכה: נר א'",
  "Chanukah: 2 Candles": "חנוכה: נר ב'",
  "Chanukah: 3 Candles": "חנוכה: נר ג'",
  "Chanukah: 4 Candles": "חנוכה: נר ד'",
  "Chanukah: 5 Candles": "חנוכה: נר ה'",
  "Chanukah: 6 Candles": "חנוכה: נר ו'",
  "Chanukah: 7 Candles": "חנוכה: נר ז'",
  "Chanukah: 8 Candles": "חנוכה: נר ח'",
  "Tu BiShvat": "ט\"ו בשבט",
  "Purim": "פורים",
  "Purim Katan": "פורים קטן",
  "Shushan Purim": "שושן פורים",
  "Pesach": "פסח",
  "Pesach I": "פסח א'",
  "Pesach II": "פסח ב'",
  "Pesach III (CH''M)": "חול המועד פסח",
  "Pesach IV (CH''M)": "חול המועד פסח",
  "Pesach V (CH''M)": "חול המועד פסח",
  "Pesach VI (CH''M)": "חול המועד פסח",
  "Pesach VII": "פסח ז'",
  "Pesach VIII": "פסח ח'",
  "Yom HaShoah": "יום השואה",
  "Yom HaZikaron": "יום הזיכרון",
  "Yom HaAtzma'ut": "יום העצמאות",
  "Lag BaOmer": "ל\"ג בעומר",
  "Yom Yerushalayim": "יום ירושלים",
  "Shavuot": "שבועות",
  "Shavuot I": "שבועות א'",
  "Shavuot II": "שבועות ב'",
  "Tish'a B'Av": "תשעה באב",
  "Tu B'Av": "ט\"ו באב",
  "Erev Rosh Hashana": "ערב ראש השנה",
  "Erev Yom Kippur": "ערב יום כיפור",
  "Erev Sukkot": "ערב סוכות",
  "Erev Pesach": "ערב פסח",
  "Erev Shavuot": "ערב שבועות",
  "Tzom Gedaliah": "צום גדליה",
  "Tzom Tammuz": "צום תמוז",
  "Asara B'Tevet": "עשרה בטבת",
  "Ta'anit Esther": "תענית אסתר",
  "Shabbat Zachor": "שבת זכור",
  "Shabbat Parah": "שבת פרה",
  "Shabbat HaChodesh": "שבת החודש",
  "Shabbat HaGadol": "שבת הגדול",
  "Shabbat Chazon": "שבת חזון",
  "Shabbat Nachamu": "שבת נחמו",
  "Shabbat Shuva": "שבת שובה",
  // Rosh Chodesh
  "Rosh Chodesh": "ראש חודש",
  "Rosh Chodesh Nisan": "ראש חודש ניסן",
  "Rosh Chodesh Iyyar": "ראש חודש אייר",
  "Rosh Chodesh Sivan": "ראש חודש סיון",
  "Rosh Chodesh Tamuz": "ראש חודש תמוז",
  "Rosh Chodesh Av": "ראש חודש אב",
  "Rosh Chodesh Elul": "ראש חודש אלול",
  "Rosh Chodesh Cheshvan": "ראש חודש חשוון",
  "Rosh Chodesh Kislev": "ראש חודש כסלו",
  "Rosh Chodesh Tevet": "ראש חודש טבת",
  "Rosh Chodesh Sh'vat": "ראש חודש שבט",
  "Rosh Chodesh Adar": "ראש חודש אדר",
  "Rosh Chodesh Adar I": "ראש חודש אדר א'",
  "Rosh Chodesh Adar II": "ראש חודש אדר ב'",
  // Parashat (Torah portions) - just in case
  "Parashat": "פרשת",
  // Other possible events
  "Sigd": "סיגד",
  "Yom HaAliyah": "יום העלייה",
  "Ben-Gurion Day": "יום בן גוריון",
  "Herzl Day": "יום הרצל",
  "Jabotinsky Day": "יום ז'בוטינסקי",
  "Birkat Hachamah": "ברכת החמה",
  // Fast days
  "Fast begins": "תחילת הצום",
  "Fast ends": "סוף הצום",
  // Minor holidays
  "Isru Chag": "אסרו חג",
  "Shushan Purim Katan": "שושן פורים קטן",
  // Modern holidays
  "Family Day": "יום המשפחה",
  "Hebrew Language Day": "יום השפה העברית",
  "Aliyah Day": "יום העלייה",
  // Special Shabbatot
  "Shabbat Mevarchim": "שבת מברכים",
  "Shabbat Rosh Chodesh": "שבת ראש חודש",
  "Shabbat Machar Chodesh": "שבת מחר חודש",
  "Shabbat Shekalim": "שבת שקלים",
  // Counting of Omer
  "Omer": "עומר",
  "Omer day": "יום בעומר"
};

interface JewishHoliday {
  name: string;
  hebrewName: string;
  isYomTov: boolean;
  isMajorHoliday: boolean;
}

export function getJewishHolidaysForDate(date: Date, includeRoshChodesh: boolean = true): JewishHoliday[] {
  try {
    // Create Hebrew date from the given date
    const hDate = new HDate(date);
    
    // Get events for this date
    const events = HebrewCalendar.getHolidaysOnDate(hDate) || [];
    
    // Filter and map holidays
    const holidays: JewishHoliday[] = events
      .filter((event: Event) => {
        // Filter out minor events we don't want to display
        const desc = event.getDesc();
        return !desc.includes('Parashat') && // Skip Torah portions
               (includeRoshChodesh || !desc.includes('Rosh Chodesh')) && // Conditionally include Rosh Chodesh
               !desc.includes('Havdalah') && // Skip Havdalah times
               !desc.includes('Candle lighting'); // Skip candle lighting times
      })
      .map((event: Event) => {
        const englishName = event.getDesc();
        let hebrewName = JEWISH_HOLIDAY_NAMES[englishName] || englishName;
        
        // Special handling for Omer counting
        if (englishName.includes('day of the Omer')) {
          const match = englishName.match(/(\d+)\w* day of the Omer/);
          if (match) {
            const dayNum = match[1];
            hebrewName = `יום ${dayNum} בעומר`;
          }
        }
        
        // Debug: Log events that don't have Hebrew translations
        if (!JEWISH_HOLIDAY_NAMES[englishName] && !englishName.includes('day of the Omer')) {
          console.log('Missing Hebrew translation for:', englishName);
        }
        
        // Determine if it's a major holiday (Yom Tov)
        const majorHolidays = [
          'Rosh Hashana', 'Yom Kippur', 'Sukkot', 'Pesach', 'Shavuot',
          'Shmini Atzeret', 'Simchat Torah'
        ];
        
        const isMajorHoliday = majorHolidays.some(holiday => 
          englishName.includes(holiday)
        );
        
        // Check if it's Yom Tov (work prohibited)
        const isYomTov = event.getCategories().includes('yomtov') || 
                        englishName.includes('Yom Kippur') ||
                        englishName.includes('Rosh Hashana') ||
                        (englishName.includes('Pesach') && !englishName.includes("CH''M")) ||
                        (englishName.includes('Sukkot') && !englishName.includes("CH''M")) ||
                        englishName.includes('Shavuot') ||
                        englishName.includes('Shmini Atzeret') ||
                        englishName.includes('Simchat Torah');
        
        return {
          name: englishName,
          hebrewName,
          isYomTov,
          isMajorHoliday
        };
      });
    
    return holidays;
  } catch (error) {
    console.error('Error getting Jewish holidays:', error);
    return [];
  }
}

// Helper function to get Hebrew date string
export function getHebrewDateString(date: Date): string {
  try {
    const hDate = new HDate(date);
    return hDate.renderGematriya();
  } catch (error) {
    console.error('Error getting Hebrew date:', error);
    return '';
  }
}

// Check if a date is Shabbat
export function isShabbat(date: Date): boolean {
  return date.getDay() === 6; // Saturday
}

// Get special day type for styling
export function getSpecialDayType(date: Date): 'shabbat' | 'yomtov' | 'holiday' | 'chol-hamoed' | null {
  if (isShabbat(date)) return 'shabbat';
  
  const holidays = getJewishHolidaysForDate(date);
  if (holidays.length === 0) return null;
  
  // Check for Yom Tov first
  if (holidays.some(h => h.isYomTov)) return 'yomtov';
  
  // Check for Chol HaMoed
  if (holidays.some(h => h.name.includes("CH''M"))) return 'chol-hamoed';
  
  // Any other holiday
  return 'holiday';
}


