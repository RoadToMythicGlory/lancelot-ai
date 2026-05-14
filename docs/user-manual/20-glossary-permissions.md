# מילון הרשאות ותפקידי מערכת

> **המסמך הזה הוא הקטלוג המלא של כל ההרשאות (`Permission`) והתפקידים (`System Role`) במערכת Lancelot.**
> כשמשתמש לא יכול לעשות פעולה - הסיבה היא לרוב חוסר הרשאה. כאן תמצאו את הרשימה המוסמכת.

המקור המוסמך לקובץ הזה הוא `apps/web/src/rbac/permissions.ts` ו-`services/api-gateway/src/rbac/permissions.ts` (חייבים להיות מסונכרנים).

---

## תפקידי מערכת (System Roles)

| תפקיד | קוד | תיאור |
|-------|-----|--------|
| **מנהל מערכת** | `SYSTEM_ADMIN` | הרשאות מלאות לכל המערכת. יכול ליצור מנהלי מערכת נוספים. |
| **מנהל IT** | `IT_ADMIN` | הרשאות ניהול טכניות מלאות. יכול לנהל משתמשים, מחלקות, הגדרות. לא יכול ליצור SYSTEM_ADMIN. |
| **משתמש IT** | `IT_USER` | תפקיד טכני - גישה לכלי ניטור, יומן ביקורת, אינטגרציות, בלי הרשאות כתיבה רחבות. |
| **מנהל מחלקה** | `DEPARTMENT_ADMIN` | מנהל של מחלקה אחת או יותר. יכול לנהל את חברי המחלקה שלו, את המשמרות שלהם, ולאשר בקשות. |
| **משתמש מחלקה** | `DEPARTMENT_USER` | משתמש רגיל - יכול לעבוד עם המודולים שיש לו הרשאה אליהם. |

---

## הרשאות מלאות (Permissions)

### משתמשים (Users)

| קוד | משמעות | מי מקבל כברירת מחדל |
|-----|---------|---------------------|
| `USERS_VIEW` | צפייה ברשימת משתמשים | כל DEPARTMENT_USER (של המחלקה שלהם) |
| `USERS_MANAGE_DEPT` | יצירה/עריכה של משתמשי המחלקה שלי | DEPARTMENT_ADMIN |
| `USERS_MANAGE_ALL` | יצירה/עריכה של כל משתמש בארגון | IT_ADMIN, SYSTEM_ADMIN |
| `USERS_DELETE` | מחיקה / השבתה | IT_ADMIN, SYSTEM_ADMIN |
| `ROLE_TEMPLATES_MANAGE` | יצירת תבניות תפקידים | IT_ADMIN, SYSTEM_ADMIN |

### שידור (Broadcast)

| קוד | משמעות | מי מקבל |
|-----|---------|---------|
| `BROADCAST_VIEW` | צפייה בתכנונית ובשידורי חוץ | DEPARTMENT_USER במחלקה רלוונטית |
| `BROADCAST_MANAGE` | יצירה/עריכה של אירועי שידור | DEPARTMENT_ADMIN (Production/News), IT_ADMIN |
| `BROADCAST_DELETE` | מחיקה של אירועי שידור | IT_ADMIN, SYSTEM_ADMIN |

### מחסן (Warehouse)

| קוד | משמעות | מי מקבל |
|-----|---------|---------|
| `WAREHOUSE_VIEW` | צפייה במלאי | DEPARTMENT_USER במחלקת Warehouse / מי שלוקח ציוד |
| `WAREHOUSE_MANAGE` | רישום / עריכה / השאלות והחזרות | DEPARTMENT_ADMIN של Warehouse |
| `WAREHOUSE_DISABLE_EQUIPMENT` | השבתה / הפעלה של פריט | DEPARTMENT_ADMIN של Warehouse |
| `WAREHOUSE_FORCE_RELEASE` | שחרור כפוי של ציוד מתקוע במשתמש | IT_ADMIN, DEPARTMENT_ADMIN של Warehouse |

### משמרות (Shifts)

| קוד | משמעות | מי מקבל |
|-----|---------|---------|
| `SHIFTS_VIEW_OWN` | צפייה במשמרות אישיות | כולם |
| `SHIFTS_VIEW_ALL` | צפייה במשמרות של כל הצוות | DEPARTMENT_ADMIN |
| `SHIFTS_MANAGE` | בניית לוח, אישור חופשות והחלפות | DEPARTMENT_ADMIN, IT_ADMIN |

### MCR

| קוד | משמעות | מי מקבל |
|-----|---------|---------|
| `MCR_VIEW` | צפייה בלוח MCR | DEPARTMENT_USER במחלקת MCR |
| `MCR_MANAGE` | עריכת אירועים, לוח עריכה, פרסום הודעות | DEPARTMENT_USER במחלקת MCR, DEPARTMENT_ADMIN |
| `MCR_ADMIN` | ניהול MCR מלא, מחיקת הודעות של אחרים | DEPARTMENT_ADMIN של MCR |

### Vizrt / גרפיקה

| קוד | משמעות | מי מקבל |
|-----|---------|---------|
| `VIZRT_VIEW` | צפייה בסצנות גרפיקה | מפעילי גרפיקה |
| `VIZRT_OPERATE` | הפעלת גרפיקה בשידור | מפעילי גרפיקה |
| `VIZRT_ADMIN` | ניהול הגדרות Vizrt | DEPARTMENT_ADMIN של Production-CG |

### SaaS / ארגון

| קוד | משמעות | מי מקבל |
|-----|---------|---------|
| `BILLING_VIEW` | צפייה במנוי, שימוש, חשבוניות | SYSTEM_ADMIN, IT_ADMIN |
| `BILLING_MANAGE` | שדרוג, ביטול, שינוי אמצעי תשלום | SYSTEM_ADMIN |
| `ORG_VIEW` | צפייה בפרטי הארגון | IT_ADMIN |
| `ORG_MANAGE` | עדכון פרטי הארגון | SYSTEM_ADMIN |
| `AUDIT_VIEW` | צפייה ביומן ביקורת | IT_ADMIN, SYSTEM_ADMIN |
| `AUDIT_EXPORT` | ייצוא יומן ביקורת | IT_ADMIN, SYSTEM_ADMIN |
| `SETTINGS_VIEW` | צפייה בהגדרות | IT_ADMIN, SYSTEM_ADMIN |
| `SETTINGS_MANAGE` | שינוי הגדרות (ארגון, תכונות, אבטחה) | IT_ADMIN, SYSTEM_ADMIN |

### דאשבורד וצ'אט

| קוד | משמעות | מי מקבל |
|-----|---------|---------|
| `DASHBOARD_VIEW` | צפייה בדאשבורד | כולם |
| `DASHBOARD_MANAGE` | התאמה אישית של הדאשבורד | DEPARTMENT_ADMIN |
| `CHAT_USE` | שימוש בצ'אט | כולם |

### אינטגרציות (Integrations)

| קוד | משמעות | מי מקבל |
|-----|---------|---------|
| `INTEGRATIONS_VIEW` | צפייה ב-API Keys, Webhooks | IT_ADMIN |
| `INTEGRATIONS_MANAGE` | יצירה/עריכה/מחיקה של מפתחות ו-Webhooks | IT_ADMIN, SYSTEM_ADMIN |

### מדיה (DAM)

| קוד | משמעות | מי מקבל |
|-----|---------|---------|
| `MEDIA_VIEW` | צפייה בקבצי מדיה | DEPARTMENT_USER במחלקת Production / Visuals / NewMedia |
| `MEDIA_MANAGE` | העלאה, מחיקה, יצירת תיקיות | DEPARTMENT_ADMIN |

### זכויות (Rights)

| קוד | משמעות | מי מקבל |
|-----|---------|---------|
| `RIGHTS_VIEW` | צפייה בזכויות | DEPARTMENT_USER במחלקה רלוונטית |
| `RIGHTS_MANAGE` | יצירה / מחיקה של זכויות | DEPARTMENT_ADMIN, IT_ADMIN |

### תהליכים (Workflows)

| קוד | משמעות | מי מקבל |
|-----|---------|---------|
| `WORKFLOWS_VIEW` | צפייה בתהליכים | כולם (לראות את התהליכים שלי) |
| `WORKFLOWS_MANAGE` | יצירת תבניות, ניהול תהליכים גלובלי | IT_ADMIN |

---

## הרשאות "מורשתות" (Legacy)

הקודים הישנים האלה נמצאים עדיין במערכת לתאימות לאחור. הם ממופים אוטומטית לקודים החדשים:

| קוד ישן | קוד חדש |
|---------|---------|
| `shift_admin` | `SHIFTS_MANAGE` |
| `VIZRT_READ` | `VIZRT_VIEW` |
| `VIZRT_TRIGGER` | `VIZRT_OPERATE` |
| `broadcast_planner` | `BROADCAST_MANAGE` |
| `broadcast_coordinator` | `BROADCAST_MANAGE` |

ראו את הקובץ `apps/web/src/rbac/permissions.ts` למפת המיפוי המלאה.

---

## איך ההרשאות מוקצות

הרשאות מגיעות ממקורות שונים, מיושמות לפי הסדר:

1. **תפקיד מערכת (System Role)** - הרשאות ברירת מחדל לפי תפקיד.
2. **תבנית תפקיד (Role Template)** - חבילת הרשאות מותאמת לתפקיד מקצועי.
3. **שיוך מחלקה** - מקבל אוטומטית גישה למודולים של המחלקה.
4. **הרשאות מותאמות אישית** - הוספה/הסרה ידנית ע"י מנהל.

הפעולה הסופית מתבצעת רק אם **כל הרשאות הנדרשות** קיימות אצל המשתמש.

---

## איך לבדוק אילו הרשאות יש לי

1. עברו ל-`/profile`.
2. בלשונית "הרשאות" - תראו את כל ה-`Permission` שיש לכם.
3. או דברו עם IT/מנהל המחלקה - יראו לכם דרך `/users`.

---

## איך לבקש הרשאה חדשה

1. החליטו איזה `Permission` חסר לכם.
2. פנו למנהל המחלקה (אם הרשאה במחלקה) או ל-IT (אם הרשאה כללית).
3. הם יעדכנו אתכם דרך `/users` (פעולה "ערוך").

---

## ראו גם

- `03-users.md` - יצירת משתמש והקצאת הרשאות.
- `13-settings.md` - הגדרות מערכת.
- `15-audit-log.md` - מעקב שינויי הרשאות.
- `apps/web/src/rbac/permissions.ts` - קוד מקור.
