# -*- coding: utf-8 -*-
import os

docs = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(docs, 'system-characterization-he.txt')

header = """================================================================================
אפיון מערכת Lancelot AI — מסמך מאוחד מלא
גרסה: 10.06.2026
================================================================================

מטרת המסמך
-----------
מסמך זה הוא אפיון עסקי ותפעולי מלא של כל מערכת Lancelot AI.
הוא מאחד את כל מסמכי האפיון הקיימים למסמך אחד, ומוסיף אפיון מפורט
למודולים שלא היה להם מסמך נפרד.

המסמך מתמקד בדרישות עסקיות ותפעוליות בלבד.
הוא אינו כולל טכנולוגיות, שמות מערכות, שפות פיתוח, מבני קוד או פרטי מימוש,
אלא אם צוין במפורש בסעיף אינטגרציות.

תוכן עניינים
------------
חלק א'  — יסודות הפלטפורמה
חלק ב'  — תכנונית שידורים
חלק ג'  — מערך השידורים
חלק ד'  — MCR
חלק ה'  — שידורי חוץ
חלק ו'  — מחסן וציוד
חלק ז'  — משמרות
חלק ח'  — לוח טיסות
חלק ט'  — משתמשים ומחלקות
חלק י'  — דף הבית ולוח מודעות
חלק יא' — צ'אט וסוכן AI
חלק יב' — מודולי ניהול
חלק יג' — אינטגרציות
חלק יד' — זרימות חוצות-מודולים

"""

parts = [
    ("חלק א' — יסודות הפלטפורמה", "platform-foundation-he.txt"),
    ("חלק ב' — תכנונית שידורים", "broadcast-planning-characterization-he.txt"),
    ("חלק ג' — מערך השידורים", "broadcast-array-characterization-he.txt"),
    ("חלק ד' — MCR", "MCR.md"),
    ("חלק ה' — שידורי חוץ", "שידורי חוץ.md"),
    ("חלק ו' — מחסן וציוד", "warehouse-characterization-he.txt"),
    ("חלק ז' — משמרות", "shifts-characterization-he.txt"),
    ("חלק ח' — לוח טיסות", "flight-board-characterization-he.txt"),
    ("חלק ט' — משתמשים ומחלקות", "users-characterization-he.txt"),
    ("חלק י' — דף הבית", "dashboard-characterization-he.txt"),
    ("חלק יא' — צ'אט וסוכן AI", "chat-ai-characterization-he.txt"),
    ("חלק יב' — מודולי ניהול", "platform-modules-characterization-he.txt"),
    ("חלק יג' — אינטגרציות", "integrations-characterization-he.txt"),
    ("חלק יד' — זרימות חוצות-מודולים", "cross-workflows-characterization-he.txt"),
]

with open(out, 'w', encoding='utf-8') as f:
    f.write(header)
    for title, filename in parts:
        path = os.path.join(docs, filename)
        sep = f"\n\n{'='*80}\n{title}\n{'='*80}\n\n"
        f.write(sep)
        with open(path, 'r', encoding='utf-8') as src:
            f.write(src.read())

lines = sum(1 for _ in open(out, encoding='utf-8'))
print(f"Created {out} with {lines} lines")
