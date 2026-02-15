import { HDate, Event as HebcalEvent, Location, HebrewCalendar } from '@hebcal/core';

export interface JewishHoliday {
  id: string;
  title: string;
  hebrewTitle: string;
  date: Date;
  isYomTov?: boolean;
  isMajor?: boolean;
}

// Configure location for Israel
const location = new Location(31.7683, 35.2137, true, 'Asia/Jerusalem', 'Jerusalem', 'IL');

export function getJewishHolidays(startDate: Date, endDate: Date): JewishHoliday[] {
  const holidays: JewishHoliday[] = [];
  
  // Create Hebrew calendar options
  const options = {
    isHebrewYear: false,
    candlelighting: true,
    location: location,
    sedrot: true,
    omer: true,
    molad: false,
    ashkenazi: false,
    shabbatMevarchim: true,
  };

  // Get events for the date range
  const events = HebrewCalendar.calendar({
    ...options,
    start: startDate,
    end: endDate,
  });

  // Filter and format holidays
  events.forEach((ev: HebcalEvent) => {
    const date = ev.getDate().greg();
    const desc = ev.getDesc();
    
    // Skip regular Shabbat and weekday events
    if (desc === 'Candle lighting' || desc === 'Havdalah' || desc.includes('Parashat')) {
      return;
    }

    // Map important holidays
    const holidayMap: Record<string, { hebrew: string, major: boolean, yomtov: boolean }> = {
      "Rosh Hashana": { hebrew: "ראש השנה", major: true, yomtov: true },
      "Rosh Hashana I": { hebrew: "ראש השנה א'", major: true, yomtov: true },
      "Rosh Hashana II": { hebrew: "ראש השנה ב'", major: true, yomtov: true },
      "Yom Kippur": { hebrew: "יום כיפור", major: true, yomtov: true },
      "Sukkot": { hebrew: "סוכות", major: true, yomtov: true },
      "Sukkot I": { hebrew: "סוכות א'", major: true, yomtov: true },
      "Sukkot II": { hebrew: "סוכות ב'", major: true, yomtov: true },
      "Shmini Atzeret": { hebrew: "שמיני עצרת", major: true, yomtov: true },
      "Simchat Torah": { hebrew: "שמחת תורה", major: true, yomtov: true },
      "Pesach": { hebrew: "פסח", major: true, yomtov: true },
      "Pesach I": { hebrew: "פסח א'", major: true, yomtov: true },
      "Pesach II": { hebrew: "פסח ב'", major: true, yomtov: true },
      "Pesach VII": { hebrew: "פסח ז'", major: true, yomtov: true },
      "Pesach VIII": { hebrew: "פסח ח'", major: true, yomtov: true },
      "Shavuot": { hebrew: "שבועות", major: true, yomtov: true },
      "Chanukah": { hebrew: "חנוכה", major: true, yomtov: false },
      "Chanukah: 1 Candle": { hebrew: "חנוכה: נר א'", major: false, yomtov: false },
      "Chanukah: 2 Candles": { hebrew: "חנוכה: נר ב'", major: false, yomtov: false },
      "Chanukah: 3 Candles": { hebrew: "חנוכה: נר ג'", major: false, yomtov: false },
      "Chanukah: 4 Candles": { hebrew: "חנוכה: נר ד'", major: false, yomtov: false },
      "Chanukah: 5 Candles": { hebrew: "חנוכה: נר ה'", major: false, yomtov: false },
      "Chanukah: 6 Candles": { hebrew: "חנוכה: נר ו'", major: false, yomtov: false },
      "Chanukah: 7 Candles": { hebrew: "חנוכה: נר ז'", major: false, yomtov: false },
      "Chanukah: 8 Candles": { hebrew: "חנוכה: נר ח'", major: false, yomtov: false },
      "Purim": { hebrew: "פורים", major: true, yomtov: false },
      "Shushan Purim": { hebrew: "שושן פורים", major: false, yomtov: false },
      "Purim Katan": { hebrew: "פורים קטן", major: false, yomtov: false },
      "Tu BiShvat": { hebrew: "ט\"ו בשבט", major: false, yomtov: false },
      "Lag BaOmer": { hebrew: "ל\"ג בעומר", major: false, yomtov: false },
      "Yom HaShoah": { hebrew: "יום השואה", major: true, yomtov: false },
      "Yom HaZikaron": { hebrew: "יום הזיכרון", major: true, yomtov: false },
      "Yom HaAtzma'ut": { hebrew: "יום העצמאות", major: true, yomtov: false },
      "Yom Yerushalayim": { hebrew: "יום ירושלים", major: false, yomtov: false },
      "Tisha B'Av": { hebrew: "תשעה באב", major: true, yomtov: false },
      "Tu B'Av": { hebrew: "ט\"ו באב", major: false, yomtov: false },
      "Tzom Gedaliah": { hebrew: "צום גדליה", major: false, yomtov: false },
      "Tzom Tammuz": { hebrew: "צום תמוז", major: false, yomtov: false },
      "Ta'anit Esther": { hebrew: "תענית אסתר", major: false, yomtov: false },
      "Asara B'Tevet": { hebrew: "עשרה בטבת", major: false, yomtov: false },
      "Rosh Chodesh": { hebrew: "ראש חודש", major: false, yomtov: false },
      "Erev Rosh Hashana": { hebrew: "ערב ראש השנה", major: false, yomtov: false },
      "Erev Yom Kippur": { hebrew: "ערב יום כיפור", major: false, yomtov: false },
      "Erev Sukkot": { hebrew: "ערב סוכות", major: false, yomtov: false },
      "Erev Pesach": { hebrew: "ערב פסח", major: false, yomtov: false },
      "Hoshanah Rabah": { hebrew: "הושענא רבה", major: false, yomtov: false },
      "Chol HaMoed Pesach": { hebrew: "חול המועד פסח", major: false, yomtov: false },
      "Chol HaMoed Sukkot": { hebrew: "חול המועד סוכות", major: false, yomtov: false },
    };

    const holidayInfo = holidayMap[desc];
    if (holidayInfo) {
      holidays.push({
        id: `jewish-${date.getTime()}-${desc.replace(/\s+/g, '-')}`,
        title: desc,
        hebrewTitle: holidayInfo.hebrew,
        date: date,
        isYomTov: holidayInfo.yomtov,
        isMajor: holidayInfo.major,
      });
    } else if (desc.startsWith('Rosh Chodesh')) {
      // Handle Rosh Chodesh with month names
      const monthName = desc.replace('Rosh Chodesh ', '');
      holidays.push({
        id: `jewish-${date.getTime()}-rosh-chodesh`,
        title: desc,
        hebrewTitle: `ראש חודש ${monthName}`,
        date: date,
        isYomTov: false,
        isMajor: false,
      });
    }
  });

  return holidays;
}
