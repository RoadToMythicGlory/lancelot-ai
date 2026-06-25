# Shidurey Huts

Read-only inventory of `https://shidureyhuts.co.il/main-rtl/` after login as `עידן מאגור`.

No app files or website data were modified. The inventory below is based on authenticated page loads only, plus visible forms, buttons, links, tables, and AJAX endpoints in the returned HTML.

## Operational Workflows

These workflows are inferred from the available authenticated pages and visible controls. They describe how the system appears to be used operationally; they do not confirm hidden server-side behavior beyond what is visible from read-only browsing.

### 1. User And Crew Setup Workflow

Purpose: maintain the pool of users, workers, and crew members who can be assigned to broadcasts.

Typical flow:

1. Open `אנשי קשר / עובדים` (`app-contact.php`) to review existing contacts/workers.
2. Use `הוסף משתמש/איש צוות` or `הוסף משתמש/עובד` (`adduser.php`) to add a new person.
3. Select user type and categories, then fill contact fields such as first name, last name, email, user id, address, phone, personal id, and password.
4. After workers exist in the system, they become available in scheduling fields such as `shadar[]`, `parsh[]`, `kavim[]`, `panel[]`, `edit[]`, `dir[]`, `sound[]`, `cg[]`, `ccu[]`, `replay[]`, `tec[]`, and other crew-role fields in `weekevents.php`.
5. A logged-in user can update their own profile from `הפרופיל שלי` (`userprofile.php?eid=1495`) by changing contact/profile information or uploading a profile image.

Related pages:

- `app-contact.php`
- `adduser.php`
- `userprofile.php?eid=1495`
- `weekevents.php`

### 2. Reference Data Setup Workflow

Purpose: configure the lists that scheduling pages depend on, such as cars, trailers, stadiums, OFFTUBE rooms, PLAYMAKER entries, and broadcast types.

Typical flow:

1. Go to `הוספה/עריכה`.
2. Maintain supporting lists:
   - `רכבים` (`add_car.php`) - add/delete cars.
   - `נגררים` (`add_nigrar.php`) - add/delete trailers.
   - `מולטי` (`add_multi.php`) - add/delete multi roles/types.
   - `איצטדיון` (`add_stadiums.php`) - add/delete stadiums with city and distance/time information.
   - `OFFTUBE` (`add_offtube.php`) - add/delete OFFTUBE entries.
   - `PLAY-MAKER` (`add_pm.php`) - add/delete PLAYMAKER entries.
   - `סוג שידור` (`add_type.php`) - add/delete broadcast types with group, port/fiber, fiber price, return fiber, setup time, and calculation type.
3. The configured values appear to feed dropdowns and autocomplete-style fields in weekly scheduling and planning pages.

Related pages:

- `add_car.php`
- `add_nigrar.php`
- `add_multi.php`
- `add_stadiums.php`
- `add_offtube.php`
- `add_pm.php`
- `add_type.php`
- `weekevents.php`

### 3. Weekly Broadcast Scheduling Workflow

Purpose: create or upload the weekly broadcast/game schedule and assign operational crew/resources.

Typical flow:

1. Download the CSV template from `קובץ תבנית שידורים` (`UPLOAD WEEK EVENTS.csv`) if schedule data is prepared outside the system.
2. Open `הוסף שיבוץ שבועי` (`weekevents.php`).
3. Either upload a weekly schedule file using `העלה שיבוץ`, or add a schedule manually through the weekly assignment form.
4. Manual schedule data includes week, date, day, league, broadcast name, broadcast type, timing, channel, location/stadium, room/OFFTUBE data, and detailed crew assignments.
5. Crew assignments cover many production roles, including on-air talent, editors, directors, sound, CG, CCU, replay, technicians, producers, camera operators, makeup/wardrobe, and notes.
6. After the schedule exists, use `דף הבית` (`main.php`) for a weekly overview and `נתוני שיבוץ שבועי` (`weekeventinfo.php`) for detailed weekly assignment data.

Related pages:

- `UPLOAD WEEK EVENTS.csv`
- `weekevents.php`
- `main.php`
- `weekeventinfo.php`
- `planner.php`

### 4. Schedule Review And Planning Workflow

Purpose: review, filter, and present weekly assignments after they have been created.

Typical flow:

1. Use `דף הבית` (`main.php`) to see `צפי משחקי השבוע`, including date, game, game type, channel, confirmation/assigned crew state, and status.
2. Open `תכנונית` (`planner.php`) and choose a week to load the planning view.
3. Open `נתוני שיבוץ שבועי` (`weekeventinfo.php`) and choose a week to display detailed schedule data.
4. Use `בחר הסתרת תאים` in `weekeventinfo.php` to control which columns/cells are visible.
5. Upload or update operational documents from `weekeventinfo.php`, including technical documents, production documents, line-up documents, and manpower documents.
6. Use `פירוט שיבוצי אודיו וידאו` (`event_audio_video.php`) to view audio/video assignment details for games in the current date range.
7. Use `צבעי טבלה` (`table_color.php`) to configure status and day colors that affect table presentation.

Related pages:

- `main.php`
- `planner.php`
- `weekeventinfo.php`
- `event_audio_video.php`
- `table_color.php`

### 5. OFFTUBE Scheduling Workflow

Purpose: manage OFFTUBE-specific weekly planning separately from the main weekly schedule.

Typical flow:

1. Open `OFFTUBE שיבוץ שבועי` (`offtube_weekevents.php`).
2. Choose a week in `PlannerOfftubeWeek` to view the OFFTUBE planner.
3. Use `הוסף ימים` to reveal the add-days workflow.
4. Add rows by week, date, and number of rows.
5. Use `צפה בשיבוץ` to view the OFFTUBE assignment state for the selected week.

Related pages:

- `offtube_weekevents.php`
- `add_offtube.php`
- `weekevents.php`

### 6. Worker Assignment Search Workflow

Purpose: find where a specific worker is assigned across schedules.

Typical flow:

1. Open `חיפוש שיבוץ עובדים` (`search_imp.php`).
2. Search by worker using `search_imp` and/or the worker selector field.
3. Review matching assignment rows by week, date, day, hours, broadcast, broadcast type, league, and location.

Related pages:

- `search_imp.php`
- `app-contact.php`
- `weekevents.php`

### 7. Schedule Export And Reporting Workflow

Purpose: generate operational/export views for schedules, fibers, reports, MCR checks, petty cash, and change history.

Typical flow:

1. Use `יצוא טבלת שידורים` (`exsport_table.php`) to view and download monthly broadcast schedule files.
2. Use `דוחות סיבים שבועיים` (`fiber_report.php`) to filter by week and export/view fiber assignment data.
3. Use `דוחות סיבים חודשיים` (`fiber_report_m.php`) to filter by month and export/view fiber assignment data.
4. Use `דוחות טבלאות שידורים` (`general_report.php`) to download broadcast-table reports.
5. Use `דוחות קופה קטנה` (`calc_report.php`) to view weekly petty-cash summary totals and rows.
6. Use `דוחות בדיקות MCR` (`mcr_check_report.php`) to review monthly MCR system-check records.
7. Use `היסטורית שינויים שידורי חוץ` (`weekevents_change_log.php`) to inspect schedule changes by date, including changed field, new value, change date/time, and user.

Related pages:

- `exsport_table.php`
- `fiber_report.php`
- `fiber_report_m.php`
- `general_report.php`
- `calc_report.php`
- `mcr_check_report.php`
- `weekevents_change_log.php`

### 8. Confirmation And Invoice Workflow

Purpose: review assignment confirmations and invoice data by month and worker.

Typical flow:

1. Open `אישורי שיבוצים` (`conf_list.php`).
2. Choose a month in `conf_date`.
3. Optionally search by worker using the visible employee search field.
4. Review the generated list of assignment confirmations and related invoice records.
5. Open `חשבוניות` (`invoice.php`).
6. Choose a month in `admin_inv`, optionally select/search a user, and run `חפש`.
7. Review invoice data for games/assignments in the selected period.

Related pages:

- `conf_list.php`
- `invoice.php`
- `weekevents.php`

### 9. Inventory And Equipment Rental Workflow

Purpose: track available equipment inventory and see how equipment is assigned/rented for games.

Typical flow:

1. Open `ניהול מלאי` (`inventory.php`) to review inventory by group/model.
2. Review general stock, available stock, and notes.
3. Open `טבלת השכרות` (`rent_table.php`).
4. Choose a week to view equipment rental/assignment data for games.
5. Use the rental table together with the weekly broadcast schedule to understand which equipment is needed or already allocated.

Related pages:

- `inventory.php`
- `rent_table.php`
- `weekevents.php`

### 10. Operations Monitoring Workflow

Purpose: monitor current-day games, broadcast checks, audio channels, and operational readiness.

Typical flow:

1. Open `לוח טיסות` (`flights.php`).
2. Review audio-channel control (`בקרת אודיו ערוצים`).
3. Review daily expected games and broadcasts under `צפי משחקים יומי`.
4. Check rows for game date, game, broadcast time, game type, channel, assignment view, OFFTUBE check, broadcast check, and status.
5. Use visible status controls such as `נצפה` and `לא נבדק` to understand the current check state.

Related pages:

- `flights.php`
- `main.php`
- `weekeventinfo.php`

### 11. Delete And Restore Schedule Workflow

Purpose: remove weekly assignments when needed and restore deleted assignments if required.

Typical flow:

1. Open `מחיקת שיבוץ שבועי` (`delgames.php`).
2. Choose a week in `del_games_res` to load assignments available for deletion.
3. Open `שחזור מחיקת שיבוץ` (`retrieve_del.php`) if deleted assignments need to be restored.
4. Choose a week in `ret_games_res` to load deleted assignments available for restore.

Related pages:

- `delgames.php`
- `retrieve_del.php`
- `weekevents.php`

## Menu Structure

- `הפרופיל שלי` - `userprofile.php?eid=1495`
- `דף הבית` - `main.php`
- `ניהול`
  - `אנשי קשר / עובדים` - `app-contact.php`
  - `הוסף משתמש/איש צוות` - `adduser.php`
  - `הוסף שיבוץ שבועי` - `weekevents.php`
  - `חיפוש שיבוץ עובדים` - `search_imp.php`
  - `תכנונית` - `planner.php`
  - `נתוני שיבוץ שבועי` - `weekeventinfo.php`
  - `OFFTUBE שיבוץ שבועי` - `offtube_weekevents.php`
  - `פירוט שיבוצי אודיו וידאו` - `event_audio_video.php`
  - `יצוא טבלת שידורים` - `exsport_table.php`
  - `מחיקת שיבוץ שבועי` - `delgames.php`
  - `שחזור מחיקת שיבוץ` - `retrieve_del.php`
  - `צבעי טבלה` - `table_color.php`
  - `לוח טיסות` - `flights.php`
- A second menu group repeats these pages: `אנשי קשר / עובדים`, `הוסף משתמש/איש צוות`, `הוסף שיבוץ שבועי`, `נתוני שיבוץ שבועי`, `יצוא וצפיה בטבלת שידורים`, `מחיקת שיבוץ`, `שחזור שיבוץ`.
- `דוחות`
  - `דוחות סיבים שבועיים` - `fiber_report.php`
  - `דוחות סיבים חודשיים` - `fiber_report_m.php`
  - `דוחות טבלאות שידורים` - `general_report.php`
  - `דוחות קופה קטנה` - `calc_report.php`
  - `דוחות בדיקות MCR` - `mcr_check_report.php`
  - `היסטורית שינויים שידורי חוץ` - `weekevents_change_log.php`
- `אישורים וחשבונות`
  - `אישורי שיבוצים` - `conf_list.php`
  - `חשבוניות` - `invoice.php`
- `מלאי`
  - `ניהול מלאי` - `inventory.php`
  - `טבלת השכרות` - `rent_table.php`
- `קבצים`
  - `קובץ תבנית שידורים` - `UPLOAD WEEK EVENTS.csv`
- `הוספה/עריכה`
  - `הוסף משתמש/עובד` - `adduser.php`
  - `רכבים` - `add_car.php`
  - `נגררים` - `add_nigrar.php`
  - `מולטי` - `add_multi.php`
  - `איצטדיון` - `add_stadiums.php`
  - `OFFTUBE` - `add_offtube.php`
  - `PLAY-MAKER` - `add_pm.php`
  - `סוג שידור` - `add_type.php`

## Pages And Available Functions

### `userprofile.php?eid=1495` - הפרופיל שלי

- Shows profile page for `עידן מאגור`.
- Upload profile image: file input `image`, button `העלה תמונה`.
- Update profile: fields for user id, first name, last name, email, phone, personal id, address, password; button `עדכן פרופיל`.
- Uses AJAX endpoint: `main_ajax.php`.

### `main.php` - דף הבית

- Shows `צפי משחקי השבוע`.
- Main table columns: `#`, `תאריך`, `משחק`, `סוג משחק`, `ערוץ`, `אישורי שיבוץ/סגל משובץ`, `סטטוס`.
- Uses AJAX endpoints: `main.php`, `main_ajax.php`.

### `app-contact.php` - אנשי קשר / עובדים

- Shows `רשימת אנשי קשר / עובדים`.
- Main table columns: `מספר`, `שם`, `כתובת מייל`, `טלפון`, `תפקיד`, `מחק`.
- Available function: view employee/contact list and delete entries from the `מחק` column.
- Uses AJAX endpoint: `main_ajax.php`.

### `adduser.php` - הוסף משתמש/איש צוות / הוסף משתמש/עובד

- Shows `הוסף משתמש`.
- Add user form: `user_type`, `user_category[]`, first name, last name, email, user id, address, phone, personal id, password, confirm password.
- Submit button: `הוסף משתמש`.
- Uses AJAX endpoint: `main_ajax.php`.

### `weekevents.php` - הוסף שיבוץ שבועי

- Shows `הוסף שיבוץ שבועי`.
- Upload schedule CSV/file: file input `file`, button `העלה שיבוץ`.
- Add weekly assignment manually: week, date, day, league, broadcast, broadcast type, start/end times, channel, location/stadium, OFFTUBE, and crew role fields including commentator, editor, director, sound, CG, CCU, replay, technician, producer, cameras, makeup/wardrobe, notes, and related role arrays.
- Submit button: `הוסף שיבוץ`.
- Main assignment table includes columns for week/date/day, league/broadcast/type, broadcast/game times, channel, location, room, crew roles, producers, cameras, notes, and related assignment details.
- Uses AJAX endpoints: `main_ajax.php`, `validate.php`.

### `search_imp.php` - חיפוש שיבוץ עובדים

- Search employee assignments.
- Search form fields: `search_imp`, `imp`.
- Submit button: `חפש`.
- Results table columns: `שבוע`, `תאריך`, `יום`, `שעות`, `שידור`, `סוג שידור`, `ליגה`, `מיקום`.
- Uses AJAX endpoints: `shifts_ajax.php`, `main_ajax.php`.

### `planner.php` - תכנונית

- Planner view by week.
- Form field: `getPlannerView` with type `week`.
- Uses AJAX endpoints: `planner_ajax.php`, `main_ajax.php`.

### `weekeventinfo.php` - נתוני שיבוץ שבועי

- Shows weekly assignment data and `העלאת מסמכים - לעדכון מסמך יש לבחור מסמך מחדש`.
- Filter form: `week_filter` with type `week`, checkbox controls for hidden cells.
- Buttons: `הצג`, `בחר הסתרת תאים`.
- Document upload fields: `tech[]`, `hafaka_doc[]`, `line_up[]`, `men_power[]`.
- Modal/actions visible: `Close`, `סגור`, `שמור מסמכים`.
- Uses AJAX endpoints: `cookie.php`, `main-table.php`, `main_ajax.php`, `planner_ajax.php`, `docs_ajax.php`.

### `offtube_weekevents.php` - OFFTUBE שיבוץ שבועי

- Shows `הוספת ימים לשיבוץ לשבוע נוכחי`.
- Planner form field: `PlannerOfftubeWeek` with type `week`.
- Add days/rows form: `week[]`, `date[]`, `rows[]`.
- Buttons/controls: `הוסף ימים`, `צפה בשיבוץ`, `+`, `הוסף שורות`.
- Uses AJAX endpoint: `main_ajax.php`.

### `event_audio_video.php` - פירוט שיבוצי אודיו וידאו

- Shows `שיבוץ אודיו וידאו למשחק`.
- Displays games between dates, observed as `24-06-2026 - 10-06-2026` during inventory.
- Uses AJAX endpoint: `main_ajax.php`.

### `exsport_table.php` - יצוא טבלת שידורים / יצוא וצפיה בטבלת שידורים

- Shows `הורדת קבצי שיבוץ - חודשי`.
- Table columns: `#`, `שם הקובץ`, `צפיה בקובץ`, `הורדה`.
- Available functions: view generated broadcast table files and download them.
- Uses AJAX endpoint: `main_ajax.php`.

### `delgames.php` - מחיקת שיבוץ שבועי / מחיקת שיבוץ

- Shows `מחיקת שיבוץ שבועי`.
- Filter form field: `del_games_res` with type `week`.
- Available function: load weekly assignments for deletion.
- Uses AJAX endpoint: `main_ajax.php`.

### `retrieve_del.php` - שחזור מחיקת שיבוץ / שחזור שיבוץ

- Shows `שחזור מחיקת שיבוץ שבועי`.
- Filter form field: `ret_games_res` with type `week`.
- Available function: load deleted weekly assignments for restore.
- Uses AJAX endpoint: `main_ajax.php`.

### `table_color.php` - צבעי טבלה

- Shows `צבעי טבלה: סטטוסים + הפרדות ימים`.
- Includes note/link text: `לבחירת צבעים אנא הכנס לאתר בחירת צבעים`.
- Color form fields: `status_1`, `status_2`, `status_3`, `day_1`, `day_2`, `day_3`, `day_4`, `day_5`, `day_6`, `day_7`.
- Table columns: `צבע סטטוס מושהה`, `צבע סטטוס נדחה`, `צבע סטטוס מבוטל`, `צבע יום ראשון`, `צבע יום שני`, `צבע יום שלישי`, `צבע יום רביעי`, `צבע יום חמישי`, `צבע יום שישי`, `צבע יום שביעי`.
- Uses AJAX endpoint: `main_ajax.php`.

### `flights.php` - לוח טיסות

- Shows sections: `בקרת אודיו ערוצים`, `לא נמצאו מקורות`, `צפי משחקים יומי`, `משחקים/שידורים אשר מתנהלים היום`, `בדיקות שיגרתיות`.
- Visible controls: `נצפה`, `לא נבדק`.
- Main table columns: `#`, `תאריך`, `משחק`, `שעת שידור`, `סוג משחק`, `ערוץ`, `צפיה בשיבוץ`, `בדיקת אופטיוב`, `בדיקת שידור`, `סטטוס`.
- Uses AJAX endpoints: `main_ajax.php`, `get_channel_Audio.php`, `get_flights_data.php`.

### `fiber_report.php` - דוחות סיבים שבועיים

- Shows `יצוא דוח שיבוץ סיבים לשבוע`.
- Filter field: `fiber_report` with type `week`.
- Submit button: `חפש`.
- Report table columns: `יום`, `תאריך`, `שעת שידור`, `שידור`, `מיקום`, `סיב`, `סיב חוזר`, `הערות`, `טכנאי`, `משחק`, `ערוץ`, `חדר`.
- Uses AJAX endpoint: `main_ajax.php`.

### `fiber_report_m.php` - דוחות סיבים חודשיים

- Shows `יצוא דוח שיבוץ סיבים לחודש`.
- Filter field: `fiber_report_m` with type `month`.
- Submit button: `חפש`.
- Report table columns: `יום`, `תאריך`, `שעת שידור`, `שידור`, `מיקום`, `סיב`, `סיב חוזר`, `הערות`, `טכנאי`, `משחק`, `ערוץ`, `חדר`.
- Uses AJAX endpoint: `main_ajax.php`.

### `general_report.php` - דוחות טבלאות שידורים

- Shows `קבצי דוחות טבלאות שידורים`.
- Visible control: `הורד דוח`.
- Table columns: `יום`, `תאריך`, `ליגה`, `שידור`, `סוג שידור`, `מיקום`, `הורדה`.
- Uses AJAX endpoint: `main_ajax.php`.

### `calc_report.php` - דוחות קופה קטנה

- Shows `סיכום דוח קופה קטנה`, `סכום נדרש לשבוע : 0`, `סכום מזומן שחזר : 0`.
- Filter field: `calc_report` with type `week`.
- Submit button: `חפש`.
- Report table columns: `יום`, `תאריך`, `שידור`, `סוג שידור`, `ליגה`, `מיקום`, `סכום קופה`, `סכום מזומן שחזר`.
- Uses AJAX endpoint: `main_ajax.php`.

### `mcr_check_report.php` - דוחות בדיקות MCR

- Shows `דוחות MCR - בדיקת מערכות`.
- Filter field: `conf_date` with type `month`.
- Table columns: `#`, `סוג בדיקה`, `תאריך`, `שעה`, `סטטוס בדיקה`, `הערות`.
- Uses AJAX endpoint: `main_ajax.php`.

### `weekevents_change_log.php` - היסטורית שינויים שידורי חוץ

- Shows `היסטורית שינויים - טבלת שידורי חוץ` and `בחר תאריך להצגת שינויים`.
- Date filter field: `date_select` with type `date`.
- Table columns: `#`, `שבוע`, `שידור`, `תאריך`, `שונה`, `שונה ל`, `תאריך שינוי`, `שעת שינוי`, `על-ידי`.
- Uses AJAX endpoint: `main_ajax.php`.

### `conf_list.php` - אישורי שיבוצים

- Shows `אישורי שיבוץ למשחקים` and `אנא בחר תאריך להצגת רשימת אישורים שיבוצים וחשבוניות`.
- Filter fields: `conf_date` with type `month`, employee search text field `חפש עובד`.
- Available function: list assignment confirmations and invoices by month/employee.
- Uses AJAX endpoint: `main_ajax.php`.

### `invoice.php` - חשבוניות

- Shows `נתוני חשבוניות למשחקים` and `אנא בחר תאריך להצגת רשימת חשבוניות`.
- Filter fields: `admin_inv` with type `month`, `user`.
- Submit button: `חפש`.
- Uses AJAX endpoint: `main_ajax.php`.

### `inventory.php` - ניהול מלאי

- Shows `מלאי`.
- Main table columns: `קבוצה`, `דגם`, `מלאי כללי`, `מלאי זמין`, `הערות`.
- Available function: view equipment inventory and availability.
- Uses AJAX endpoint: `main_ajax.php`.

### `rent_table.php` - טבלת השכרות

- Shows `טבלת שיבוצי ציוד למשחקים`.
- Filter field: `week` with type `week`.
- Available function: view equipment rental/assignment table by week.
- Uses AJAX endpoint: `main_ajax.php`.

### `UPLOAD WEEK EVENTS.csv` - קובץ תבנית שידורים

- Available function: download the broadcast/week-events CSV template file.

### `add_car.php` - רכבים

- Shows `הוספה/עריכה - רכבים`.
- Add car form field: `add_car`.
- Submit button: `הוסף רכב`.
- Table columns: `#`, `שם רכב`, `מחק רכב`.
- Available functions: add car, delete car.
- Uses AJAX endpoint: `main_ajax.php`.

### `add_nigrar.php` - נגררים

- Shows `הוספה/עריכה - נגררים`.
- Add trailer form field: `add_nigrar`.
- Submit button: `הוסף נגרר`.
- Table columns: `#`, `שם נגרר`, `מחק רכב`.
- Available functions: add trailer, delete trailer.
- Uses AJAX endpoint: `main_ajax.php`.

### `add_multi.php` - מולטי

- Shows `הוספה/עריכה - תפקידי עובד`.
- Add multi form field: `add_multi`.
- Submit button: `הוסף מולטי`.
- Table columns: `#`, `שם מולטי`, `מחק מולטי`.
- Available functions: add multi role/type, delete multi role/type.
- Uses AJAX endpoint: `main_ajax.php`.

### `add_stadiums.php` - איצטדיון

- Shows `הוספה/עריכה - איצטדיון`.
- Add stadium fields: `std_name`, `std_city`, `time`.
- Submit button: `הוסף איצטדיון`.
- Table columns: `#`, `שם איצטדיון`, `עיר`, `מרחק`, `מחק איצטדיון`.
- Available functions: add stadium, delete stadium.
- Uses AJAX endpoint: `main_ajax.php`.

### `add_offtube.php` - OFFTUBE

- Shows `הוספה/עריכה - OFFTUBE`.
- Add OFFTUBE field: `add_ftb`.
- Submit button: `הוסף OFFTUBE`.
- Table columns: `#`, `שם OFFTUBE`, `מחק OFFTUBE`.
- Available functions: add OFFTUBE entry, delete OFFTUBE entry.
- Uses AJAX endpoint: `main_ajax.php`.

### `add_pm.php` - PLAY-MAKER

- Shows `הוספה/עריכה - PLAYMAKER`.
- Add PLAYMAKER field: `add_pm`.
- Submit button: `הוסף PLAYMAKER`.
- Table columns: `#`, `שם PLAYMAKER`, `מחק PLAYMAKER`.
- Available functions: add PLAYMAKER entry, delete PLAYMAKER entry.
- Uses AJAX endpoint: `main_ajax.php`.

### `add_type.php` - סוג שידור

- Shows `הוספה/עריכה - סוג שידור`.
- Add broadcast type fields: `typ_name`, `type_grp`, `port`, `fiber_price`, `ret`, `prisa`, `cala_type`.
- Submit button: `הוסף סוג שידור`.
- Table columns: `#`, `שם שידור`, `קבוצת שידור`, `זמן פריסה`, `סיב`, `מחיר`, `סיב חוזר`, `סוג חישוב`, `סכום הובלה`, `מחק סוג שידור`.
- Available functions: add broadcast type, delete broadcast type.
- Uses AJAX endpoint: `main_ajax.php`.
