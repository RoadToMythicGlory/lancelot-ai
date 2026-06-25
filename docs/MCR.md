# אפיון מחלקת MCR – חדר בקרה ראשי

## מטרת המסמך

מסמך זה מגדיר את מחלקת **MCR (Master Control Room / חדר בקרה ראשי)** במערכת Lancelot AI: תחומי האחריות של המחלקה, זרימת העבודה, דפי המערכת, המידע הנשמר, הרשאות, אינטגרציות ויכולות תפעוליות.

האפיון מתאר את המצב הקיים במערכת לאחר הרחבת עמוד ה-MCR לסביבת עבודה מרובת לשוניות, כולל אירועי הכנה, לו"ז יומי, בדיקות תפעוליות, החלפה חיצונית ומעקב ציוד הנדסה שיתופי.

## עקרונות יסוד

MCR הוא חדר הבקרה המרכזי שדרכו עוברים כל השידורים. במערכת, MCR אינו מחליף את התכנונית — הוא שכבת תפעול ייעודית שמאפשרת לצוות MCR להכין, לעקוב ולנהל את השידורים מנקודת מבט טכנית.

הכללים המחייבים:

- אירועי השידור נוצרים ונערכים בתכנונית (`/broadcast-planning`). MCR מקבל מהם **Shadow Event** אוטומטי — מראה תפעולית שמאפשרת ל-MCR לעבוד בלי לגעת באירוע התכנוני.
- שדות תפעוליים של MCR (זמני MCR, קליטות, אנשי קשר, פלטפורמות יציאה, סטטוס הכנה, הערות) נשמרים ב-`MCREvent` ואינם דורסים את נתוני התכנונית.
- אירועי **MCR בלבד** (`isMCROnly: true`) נוצרים ידנית על ידי צוות MCR ואינם מופיעים בתכנונית.
- לוח הלו"ז (`ActivityRow`) הוא מקור האמת לתצוגת לוח הפעילויות היומי — גם לעריכה וגם להצגה על מסכים בחדר.
- שיבוץ אנשים נשאר במערכת השיבוצים. MCR אינו מקור האמת לשיבוץ כוח אדם.
- בקשת ציוד מהמחסן נשארת בתהליך המחסן הקיים. MCR רק **צופה** בציוד הנדסה שיתופי שהוקצה לאירועים או לעובדים.
- כל הממשק הוא בעברית ובכיוון RTL. שמות טכניים (SRT CALLER, DVBS2 וכו') נשארים באנגלית לפי מוסכמת התעשייה.
- עדכונים בזמן אמת מועברים דרך GraphQL Subscriptions — מסכים מרובים בחדר MCR מסתנכרנים אוטומטית.

## תחומי אחריות של מחלקת MCR

מחלקת MCR אחראית על ההכנה הטכנית והתפעול של שידורים בחדר הבקרה הראשי.

המחלקה מטפלת בין היתר ב:

- צפייה וניהול אירועי שידור לפי יום / שבוע / חודש.
- הכנת אירועים: קליטות לווייניות, אנשי קשר, פלטפורמות יציאה, זמני MCR, אולפן בקרה וערוץ.
- סיווג סוג שידור (SRT, DVB, RTMP, LIVEU וכו') וצביעת אירועים לפי סוג.
- לו"ז יומי תפעולי — מכשירים, גיבויים, ניתובים, סטטוס מוכנות.
- בדיקות יומיות (Daily Checks) לפני תחילת משמרת.
- קישור קבוצות החלפה חיצונית (External Exchange) לאירועי MCR.
- מעקב אחר ציוד הנדסה שיתופי שהוקצה לאירועים או לעובדים.
- לוח טיסות MCR ייעודי להצגה על מסכים גדולים.
- ייצוא CSV של אירועים ולו"ז.

## מבנה מידע מרכזי

### אירוע MCR (`MCREvent`)

ישות עצמאית ב-MongoDB. כל אירוע תכנוני מקבל Shadow Event אוטומטי; ניתן גם ליצור אירועים ידניים.

```ts
MCREvent: {
  title: string;
  start: Date;
  end: Date;
  broadcastType?: BroadcastType;
  isMCROnly?: boolean;
  broadcastEventId?: ObjectId;   // קישור לאירוע תכנוני (אם קיים)

  // פרטים לפי סוג שידור (SRT, לוויין, LIVEU וכו')
  details?: {
    ip?: string;
    port?: string;
    passphrase?: string;
    contact?: string;
    notes?: string;
    satelliteConfig?: string;
    fileContent?: string;
    filePath?: string;
    cameraCount?: number;
  };

  // הכנה תפעולית
  preparationStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
  controlStudio?: string;
  broadcastChannel?: string;
  mcrStartTime?: Date;
  mcrEndTime?: Date;
  preparationNotes?: string;
  sourceLabel?: string;          // "תכנון שידור" | "אירוע ידני"

  feeds: MCRFeed[];
  contacts: MCRContact[];
  outputPlatforms: MCROutputPlatform[];
  exchangeGroupIds: string[];
  sharedEngineeringEquipment: MCRSharedEngineeringEquipment[];

  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
```

#### קליטה / Feed (`MCRFeed`)

```ts
{
  name?: string;
  satellite?: string;
  frequency?: string;
  symbolRate?: string;
  polarization?: string;
  fec?: string;
  encryptionType?: string;
  encryptionKey?: string;
  bissKey?: string;
  format?: string;
  notes?: string;
}
```

#### איש קשר (`MCRContact`)

```ts
{
  fullName?: string;
  role?: string;
  phone?: string;
  email?: string;
  notes?: string;
}
```

#### פלטפורמת יציאה (`MCROutputPlatform`)

```ts
{
  name?: string;
  outputType?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'LIVE' | 'OFF';
  details?: string;
}
```

### שורת לו"ז (`ActivityRow`)

מייצגת שורה בלוח הפעילויות היומי. נוצרת אוטומטית לכל אירוע תכנוני חדש; ניתן להוסיף שורות ידניות.

```ts
ActivityRow: {
  date: Date;
  activityName: string;
  source?: string;
  time: string;           // HH:mm
  endTime: string;        // HH:mm
  equipment?: string;    // HTML מעוצב
  backup?: string;       // HTML מעוצב
  routing?: string;      // HTML מעוצב
  channel?: string;
  broadcastType?: BroadcastType;
  notes?: string;        // HTML מעוצב
  status: 'UNKNOWN' | 'READY' | 'NOT_READY' | 'ERROR';
  isHidden?: boolean;
  isManual?: boolean;
  broadcastEventId?: ObjectId;
  createdBy: ObjectId;
  updatedBy?: ObjectId;
}
```

### בדיקות יומיות

שתי ישויות:

- `MCRDailyCheckTemplate` — פריט בדיקה ברשימה (שם, תיאור, סדר, פעיל/לא).
- `MCRDailyCheckEntry` — רישום השלמה לתאריך ספציפי (מי סימן, מתי, הערות).

ברירת מחדל: 25 בדיקות מוגדרות מראש (שרשרת שידור, גיבוי, אות וידאו, סנכרון זמן וכו').

### קבוצת החלפה חיצונית (`MCRExchangeGroup`)

```ts
MCRExchangeGroup: {
  name: string;
  description?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'REVIEW_PENDING' | 'CLOSED';
  takerCount: number;
  synopsisCount: number;
  pendingUploads: MCRExchangeUpload[];
  linkedMcrEventIds: ObjectId[];
  createdBy: ObjectId;
}
```

### הודעות בולטין (`BulletinPost`)

לוח הודעות פנימי של מחלקת MCR (קיים במימוש, רכיב `BulletinWidget`):

```ts
{
  content: string;
  departmentId: ObjectId;   // מחלקת MCR
  expiryDate?: Date;
  untilNewPost?: boolean;
  isActive: boolean;
  createdBy: ObjectId;
}
```

## מנגנון Shadow Events

כאשר נוצר אירוע בתכנונית, המערכת יוצרת אוטומטית:

1. **Shadow MCREvent** — מראה תפעולית עם `broadcastEventId`, `sourceLabel: "תכנון שידור"`.
2. **ActivityRow** — שורת לו"ז ראשונית ליום האירוע.

### מה מסתנכרן מתכנונית → MCR

- כותרת (`title`)
- זמני התחלה וסיום (`start`, `end`)
- סוג שידור (`broadcastType`) — אם הוגדר בתכנונית
- ערוץ (`broadcastChannel`) — ביצירה ראשונית בלבד

### מה **לא** מסתנכרן (בעלות MCR)

- `mcrStartTime` / `mcrEndTime`
- `feeds`, `contacts`, `outputPlatforms`
- `preparationStatus`, `preparationNotes`
- `controlStudio`, `broadcastChannel` (לאחר עריכה ידנית ב-MCR)

### מחיקת אירוע תכנוני

ה-Shadow Event **לא נמחק**. הקישור `broadcastEventId` מוסר ו-`sourceLabel` מתעדכן — כך עבודת ההכנה של MCR לא אובדת.

### Back-fill

בטעינת אירועים בטווח תאריכים, המערכת יוצרת Shadow Events חסרים לאירועים ישנים שנוצרו לפני שהמנגנון הופעל.

## סוגי שידור וצבעים

| סוג שידור | קוד | צבע |
|-----------|-----|-----|
| SRT CALLER | `SRT_CALLER` | `#7ca13d` |
| SRT LISTENER | `SRT_LISTENER` | `#a8cc6a` |
| DVBS2 | `DVBS2` | `#ed80e8` |
| DVBS2X | `DVBS2X` | `#54b0c7` |
| NS3 | `NS3` | `#1b943b` |
| NS4 | `NS4` | `#1b943b` |
| RTMP | `RTMP` | `#d46eab` |
| ZIXI | `ZIXI` | `#ff6b6b` |
| LIVEU | `LIVEU` | `#e8ca92` |
| PRT | `PRT` | `#c2e8ed` |
| קליטה מ-OU | `KLITA_MOU` | `#b135de` |
| אחר | `OTHER` | `#e31464` |

### טפסים לפי סוג שידור

| סוג | שדות נדרשים |
|-----|-------------|
| SRT CALLER | CALLER IP*, CALLER PORT*, Contact*, Passphrase, Notes |
| SRT LISTENER | LISTENER IP*, LISTENER PORT*, Contact*, Passphrase, Notes |
| DVBS2 / DVBS2X / NS3 / NS4 / קליטה מ-OU | העלאת מערך לוויני + עורך טקסט עשיר (B/U/I, מרקר, צבעים) |
| RTMP / OTHER | עורך טקסט עשיר + העלאת קובץ |
| LIVEU | כמות מצלמות (ברירת מחדל: 1) |
| PRT | ללא טופס — תיוג בלבד |
| ZIXI | עורך טקסט עשיר |

## דף MCR הראשי

נתיב: `apps/web/src/app/MCR/page.tsx`  
כניסה: סיידבר → **MCR** (`/MCR`)

הדף בנוי מכותרת, באנר הרשאות (צפייה בלבד / עריכה), וחמש לשוניות:

### 1. אירועי MCR

רכיבים: `EventsArea`, `EventListPanel`, `PreparationWorkspace`, `CreateEventModal`

**פריסה:** רשימת אירועים (420px) + אזור הכנה (שאר הרוחב).

**יכולות:**

- ניווט יומי / שבועי / חודשי (`RangeNavigator`).
- רשימת אירועים מקובצת לפי יום, עם צבע לפי סוג שידור ותג סטטוס הכנה.
- בחירת אירוע → פתיחת **אזור הכנה** מלא.
- יצירת אירוע MCR בלבד (`+ אירוע חדש`).
- מחיקת אירועים ידניים בלבד (אירועי תכנון — לא ניתנים למחיקה מ-MCR).
- ייצוא CSV של אירועים בטווח הנוכחי.
- עדכון חי (Subscriptions).

**אזור הכנה (`PreparationWorkspace`):**

| אזור | תוכן |
|------|------|
| פרטים כלליים | סטטוס הכנה, אולפן בקרה, ערוץ שידור, שעות MCR |
| קליטות ולוויינים | רשימת Feeds + ייבוא ממסמך סינופסיס |
| אנשי קשר | רשימת Contacts |
| פלטפורמות יציאה | רשימת Output Platforms + סטטוס (ממתין / מאושר / באוויר / כבוי) |
| הערות הכנה | עורך טקסט עשיר |

**ייבוא ממסמך (`SynopsisHelper` + `parseMCRDocument`):**

מנתח מסמך סינופסיס (PDF/Word) ומציע קליטות ופלטפורמות יציאה לייבוא לאירוע.

### 2. לו"ז

רכיב: `ScheduleArea`

**יכולות:**

- טבלת פעילויות יומית לעריכה.
- תצוגת שבוע / חודש — סיכום מקובץ לפי ימים.
- עמודות: פעילות, שעה, שעת סיום, מקור, מכשירים, גיבוי, ניתובים, ערוץ, סוג שידור, הערות, סטטוס.
- עמודות מכשירים / גיבוי / ניתובים / הערות — עורך HTML עשיר (`RichTextEditor`).
- שורות מתכנונית: שם הפעילות קריאה בלבד; שאר העמודות ניתנות לעריכה.
- שורות ידניות: כל העמודות ניתנות לעריכה.
- פעולות: הוספת שורה, שכפול, הסתרה מלוח צפייה, מחיקה.
- שמירה מרוכזת (`שמור הכל`) — מוטציית `saveActivityRows`.
- כפתור **תצוגת הצגה** — מודאל תצוגה שחורה לקריאה בלבד (מקביל ל-`/MCR/view-board`).
- ייצוא CSV.
- עדכון חי (Subscriptions). רענון אוטומטי רק כשאין שינויים לא שמורים.

**סטטוסי שורה:**

| סטטוס | קוד | אייקון | משמעות |
|-------|-----|--------|---------|
| לא הוגדר | `UNKNOWN` | ? לבן | ברירת מחדל |
| מוכן לשידור | `READY` | ✓ ירוק | מוכן |
| לא מוכן לשידור | `NOT_READY` | ? צהוב | דורש טיפול |
| תקלה | `ERROR` | ! אדום | תקלה פעילה |

### 3. בדיקות יומיות

רכיב: `DailyChecksArea`

**יכולות:**

- רשימת בדיקות לתאריך נבחר.
- סימון השלמה (V) לכל בדיקה — נשמר עם שם המסמן ושעת הסימון.
- פס התקדמות: X מתוך Y הושלמו (אחוז).
- ניהול תבניות בדיקה (רק `MCR_ADMIN`): הוספה, עריכה, השבתה.
- 25 בדיקות ברירת מחדל נזרעות אוטומטית בכניסה ראשונה.
- עדכון חי בין מסכים.

### 4. החלפה חיצונית

רכיב: `ExternalExchangeArea`

**תלות:** דורש בחירת אירוע בלשונית "אירועי MCR".

**יכולות:**

- צפייה בקבוצות החלפה מקושרות לאירוע הנבחר.
- יצירת קבוצה חדשה.
- קישור קבוצה קיימת לאירוע.
- ניתוק קישור.
- אישור העלאות סינופסיס ממתינות (`acceptMCRExchangeUpload`).
- סגירת קבוצה (`CLOSED` — לא ניתן להוסיף סינופסיסים).
- פתיחת עמוד מלא (`/external-broadcasts?group=...`) בלשונית חדשה.
- עדכון חי.

**סטטוסי קבוצה:**

| סטטוס | תווית |
|-------|-------|
| `DRAFT` | טיוטה |
| `PUBLISHED` | פורסם |
| `ACTIVE` | פעיל |
| `REVIEW_PENDING` | ממתין לבדיקה |
| `CLOSED` | סגור |

### 5. ציוד הנדסה שיתופי

רכיב: `SharedEngineeringEquipmentArea`

**יכולות:**

- שלוש תצוגות: מוקצה לאירועים, מוקצה לעובדים, זמין במחסן.
- סינון לפי סטטוס (פעיל / הכל) ומצב נוכחי (מחסן / אירוע / עובד).
- חיפוש לפי שם, ברקוד, קטגוריה.
- הצגת מיקום מבני (מחסן + מקום אחסון) לפריטים במחסן.
- הצגת מקום שידור (venue) לפריטים מוקצים לאירוע.
- ייצוא דוח (CSV/PDF) דרך `WarehouseExportButtons`.
- נתונים נגזרים מהמחסן — MCR אינו מקצה ציוד, רק עוקב.

## דפים נלווים

### לוח פעילויות צפייה

נתיב: `/MCR/view-board`  
הרשאה: `MCR_VIEW`

טבלה שחורה סטטית לתצוגה על מסכים בחדר MCR:

- עמודות: פעילות, שעה, שעת סיום, מכשירים, גיבוי, ניתובים, ערוץ, סוג שידור (צבעוני), סטטוס.
- בחירת תאריך + מקשי קיצור (חצים RTL, T/Home = היום).
- רענון אוטומטי כל 30 שניות.
- שורות מוסתרות (`isHidden`) לא מוצגות.

### לוח פעילויות עריכה (דף נפרד)

נתיב: `/MCR/edit-board`  
הרשאה: `MCR_MANAGE`

גרסה עצמאית של לוח העריכה — נפתחת בלשונית חדשה (כפתורי `ButtonsWidget` הישנים).

### לוח שנה מסך מלא

נתיב: `/MCR/calendar-fullscreen`  
רכיב: `CalendarWidget`

לוח שנה עם תצוגות יומית / שבועית / חודשית — נפתח בלשונית חדשה מהלוח הישן. כולל חגים יהודיים (`jewishHolidays`).

### לוח טיסות MCR

נתיב: `/MCR/flight-board`  
הרשאה: `MCR_FLIGHT_BOARD_VIEW`

לוח טיסות ייעודי עם כל עמודות לוח ה-MCR. נוצר אוטומטית בכניסה ראשונה (`לוח טיסות - MCR`). רענון כל 30 שניות.

## אינטגרציות

### תכנונית (`/broadcast-planning`)

- מקור האמת לאירועי שידור.
- יצירה / עדכון / מחיקה של אירוע → Shadow Event + ActivityRow (או עדכון / ניתוק).
- ערוץ (`channel`) מועבר לשורת הלו"ז.

### מחסן

- ציוד הנדסה שיתופי: מסומן בדגל `sharedEngineering` בפריט ציוד.
- Snapshot של הקצאות נשמר על ה-Shadow Event (`sharedEngineeringEquipment`) ומתעדכן בעת הקצאה / החזרה / העברה.
- MCR צופה בלבד — אין הקצאה מ-MCR.

### API חיצוני

- `GET /api/v1/external/shared-engineering-equipment` — חשיפת נתוני ציוד הנדסה שיתופי לשותפים (X-API-Key).
- Webhooks על שינויי הקצאה.

### שידורי חוץ

- קבוצות החלפה חיצונית משותפות — MCR מקשר קבוצות לאירועים; ניהול מלא בדף שידורי חוץ.

## הרשאות

| פעולה | Permission | הערות |
|-------|-----------|-------|
| כניסה לדף MCR | `MCR_VIEW` | חבר במחלקת MCR (Playout / Ingest / General) או SYSTEM_ADMIN |
| עריכת אירועים, לו"ז, בדיקות, החלפות | `MCR_MANAGE` | |
| ניהול תבניות בדיקות יומיות, מחיקת הודעות של אחרים | `MCR_ADMIN` | |
| לוח טיסות MCR — צפייה | `MCR_FLIGHT_BOARD_VIEW` | |
| לוח טיסות MCR — ניהול | `MCR_FLIGHT_BOARD_MANAGE` | |

משתמש עם `MCR_VIEW` בלבד רואה באנר "גישת צפייה בלבד" — כל כפתורי העריכה מושבתים.

## GraphQL מרכזי

### שאילתות

- `mcrEvents(start, end, broadcastType)` — אירועי MCR בטווח
- `mcrEvent(id)` — אירוע בודד
- `mcrBulletinPosts(departmentId, activeOnly)` — הודעות בולטין
- `activityRows(date, includeHidden)` — שורות לו"ז ליום
- `activityRow(id)` / `activityRowByBroadcastEvent(broadcastEventId, date)`
- `mcrDailyCheckTemplates(activeOnly)` — תבניות בדיקות
- `mcrDailyCheck(date)` — סיכום בדיקות ליום
- `mcrExchangeGroups(status, mcrEventId)` — קבוצות החלפה
- `mcrSharedEngineeringEquipment(status)` — מעקב ציוד הנדסה שיתופי
- `parseMCRDocument(input)` — ניתוח מסמך סינופסיס

### מוטציות

- `createMCREvent` / `updateMCREvent` / `deleteMCREvent`
- `createMCRBulletinPost` / `updateMCRBulletinPost` / `deleteMCRBulletinPost`
- `createActivityRow` / `updateActivityRow` / `saveActivityRows` / `deleteActivityRow` / `hideActivityRow`
- `createMCRDailyCheckTemplate` / `updateMCRDailyCheckTemplate` / `deactivateMCRDailyCheckTemplate`
- `setMCRDailyCheckCompleted`
- `createMCRExchangeGroup` / `updateMCRExchangeGroup` / `closeMCRExchangeGroup`
- `linkMCRExchangeGroupToEvent` / `unlinkMCRExchangeGroupFromEvent`
- `acceptMCRExchangeUpload` / `addMCRExchangeUpload`

### Subscriptions (עדכון חי)

- `mcrEventCreated` / `mcrEventUpdated` / `mcrEventDeleted`
- `mcrBulletinPostCreated` / `mcrBulletinPostUpdated` / `mcrBulletinPostDeleted`
- `activityRowCreated` / `activityRowUpdated` / `activityRowDeleted`
- `mcrDailyCheckEntryUpdated` / `mcrDailyCheckTemplateChanged`
- `mcrExchangeGroupUpdated`

## אזור זמן

כל חלונות היום (day windows) מחושבים לפי אזור הזמן של הארגון (`config.TIMEZONE`, ברירת מחדל: `Asia/Jerusalem`). זה מבטיח שלוח הלו"ז מציג נכון אירועים שנקבעו לשעות ערב/לילה בישראל גם כששרת ה-API רץ באזור זמן אחר.

## קבצים מרכזיים במימוש

### Frontend

- `apps/web/src/app/MCR/page.tsx` — דף ראשי
- `apps/web/src/app/MCR/components/EventsArea.tsx` — לשונית אירועים
- `apps/web/src/app/MCR/components/PreparationWorkspace.tsx` — אזור הכנה
- `apps/web/src/app/MCR/components/ScheduleArea.tsx` — לשונית לו"ז
- `apps/web/src/app/MCR/components/DailyChecksArea.tsx` — בדיקות יומיות
- `apps/web/src/app/MCR/components/ExternalExchangeArea.tsx` — החלפה חיצונית
- `apps/web/src/app/MCR/components/SharedEngineeringEquipmentArea.tsx` — ציוד הנדסה שיתופי
- `apps/web/src/app/MCR/view-board/page.tsx` — לוח צפייה
- `apps/web/src/app/MCR/edit-board/page.tsx` — לוח עריכה נפרד
- `apps/web/src/app/MCR/flight-board/page.tsx` — לוח טיסות MCR
- `apps/web/src/app/MCR/calendar-fullscreen/page.tsx` — לוח שנה מסך מלא
- `apps/web/src/app/MCR/constants.ts` — סוגי שידור, צבעים, תוויות
- `apps/web/src/app/MCR/types.ts` — טיפוסי TypeScript
- `apps/web/src/graphql/mcrQueries.ts` / `mcrMutations.ts` — GraphQL

### Backend

- `services/api-gateway/src/resolvers/mcrResolvers.ts` — רזולברים
- `services/api-gateway/src/models/mcrEvent.ts` — מודל אירוע
- `services/api-gateway/src/models/activityRow.ts` — מודל שורת לו"ז
- `services/api-gateway/src/models/mcrDailyCheck.ts` — בדיקות יומיות
- `services/api-gateway/src/models/mcrExchangeGroup.ts` — החלפה חיצונית
- `services/api-gateway/src/models/bulletinPost.ts` — הודעות בולטין
- `services/api-gateway/src/services/mcrShadowEvent.ts` — Shadow Events
- `services/api-gateway/src/services/mcrDocumentParser.ts` — ניתוח סינופסיס
- `services/api-gateway/src/services/sharedEngineeringExport.service.ts` — snapshot ציוד
- `services/api-gateway/src/schema/schema.graphql` — סכמת GraphQL

## בדיקות נדרשות

### אירועים

- יצירת אירוע בתכנונית → Shadow Event + ActivityRow נוצרים אוטומטית.
- עדכון כותרת/זמנים בתכנונית → Shadow Event מתעדכן; שדות MCR לא נדרסים.
- מחיקת אירוע תכנוני → Shadow Event נשאר, קישור מוסר.
- יצירת אירוע MCR בלבד → לא מופיע בתכנונית.
- Back-fill: אירוע ישן ללא Shadow → נוצר בטעינה ראשונה.

### לו"ז

- שורות מתכנונית: שם קריאה בלבד, שאר עמודות ניתנות לעריכה.
- שורות ידניות: כל העמודות ניתנות לעריכה.
- הסתרת שורה → לא מופיעה בלוח צפייה.
- שמירה מרוכזת → כל השינויים נשמרים.
- עדכון חי → מסך שני מתעדכן (ללא דריסת עריכה פתוחה).
- חלון יום לפי Asia/Jerusalem.

### בדיקות יומיות

- 25 תבניות ברירת מחדל נזרעות.
- סימון / ביטול סימון נשמר עם שם מסמן.
- אחוז התקדמות מדויק.
- `MCR_ADMIN` יכול לנהל תבניות.

### החלפה חיצונית

- קישור / ניתוק קבוצה לאירוע.
- אישור העלאה → סטטוס מתעדכן.
- סגירת קבוצה → לא ניתן להוסיף סינופסיסים.

### ציוד הנדסה שיתופי

- הקצאה לאירוע → מופיע בלשונית MCR.
- החזרה למחסן → נעלם מרשימת פעיל / מופיע בזמין.
- Snapshot על Shadow Event מתעדכן.

### הרשאות

- `MCR_VIEW` בלבד → כל כפתורי עריכה מושבתים.
- `MCR_MANAGE` → עריכה מלאה.
- `MCR_ADMIN` → ניהול תבניות בדיקות.

### Regression

- תכנונית לא השתנתה מבחינת זרימת יצירת אירועים.
- שיבוץ אנשים לא השתנה.
- מחסן — הקצאת ציוד לא השתנתה; MCR רק צופה.

## רכיבים ישנים (Legacy)

המפרט המקורי (`MCR instrucions.txt`) תיאר דאשבורד עם שלושה ווידג'טים (לוח שנה 60%, כפתורים 10%, בולטין 30%). הרכיבים עדיין קיימים בקוד:

- `CalendarWidget` — נגיש דרך `/MCR/calendar-fullscreen`
- `ButtonsWidget` — כפתורי לוח צפייה / עריכה / MCR MAP
- `BulletinWidget` — לוח הודעות MCR

הדף הראשי `/MCR` עבר לסביבת עבודה מרובת לשוניות. **MCR MAP** — בפיתוח, טרם מומש.

## סיכום

מחלקת MCR במערכת Lancelot AI היא סביבת עבודה מלאה לחדר הבקרה הראשי. היא מספקת:

- מראה תפעולית (Shadow Event) לכל אירוע תכנוני, עם הכנה עצמאית.
- לו"ז יומי לעריכה והצגה על מסכים.
- בדיקות יומיות עם 25 פריטי ברירת מחדל.
- קישור להחלפה חיצונית ולשידורי חוץ.
- מעקב ציוד הנדסה שיתופי מהמחסן.
- לוח טיסות MCR ייעודי.
- עדכון חי בין מסכים מרובים.
- ייצוא CSV.
- ממשק עברית RTL מלא.

המערכת אינה מחליפה את התכנונית, השיבוצים או המחסן — היא שכבת תפעול ייעודית שמאפשרת לצוות MCR לעבוד ביעילות מבלי לפגוע בתהליכי הליבה.
