$docsPath = $PSScriptRoot
$out = Join-Path $docsPath 'system-characterization-he.txt'

$header = @"
================================================================================
אפיון מערכת Lancelot AI — מסמך מאוחד מלא
גרסה: 10.06.2026
================================================================================

מטרת המסמך
-----------
מסמך זה הוא אפיון עסקי ותפעולי מלא של כל מערכת Lancelot AI.
הוא מאחד את כל מסמכי האפיון הקיימים למסמך אחד, ומוסיף אפיון מפורט
למודולים שלא היה להם מסמך נפרד.

המסמך מתמקד בדרישות עסקיות ותפעוליות בלבד.

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

"@

$partA = Get-Content (Join-Path $docsPath 'platform-foundation-he.txt') -Raw -Encoding UTF8

$parts = @(
    @{ Title = "חלק ב' — תכנונית שידורים"; File = 'broadcast-planning-characterization-he.txt' },
    @{ Title = "חלק ג' — מערך השידורים"; File = 'broadcast-array-characterization-he.txt' },
    @{ Title = "חלק ד' — MCR"; File = 'MCR.md' },
    @{ Title = "חלק ה' — שידורי חוץ"; File = 'שידורי חוץ.md' },
    @{ Title = "חלק ו' — מחסן וציוד"; File = 'warehouse-characterization-he.txt' },
    @{ Title = "חלק ז' — משמרות"; File = 'shifts-characterization-he.txt' },
    @{ Title = "חלק ח' — לוח טיסות"; File = 'flight-board-characterization-he.txt' },
    @{ Title = "חלק ט' — משתמשים ומחלקות"; File = 'users-characterization-he.txt' },
    @{ Title = "חלק י' — דף הבית"; File = 'dashboard-characterization-he.txt' },
    @{ Title = "חלק יא' — צ'אט וסוכן AI"; File = 'chat-ai-characterization-he.txt' },
    @{ Title = "חלק יב' — מודולי ניהול"; File = 'platform-modules-characterization-he.txt' },
    @{ Title = "חלק יג' — אינטגרציות"; File = 'integrations-characterization-he.txt' },
    @{ Title = "חלק יד' — זרימות חוצות-מודולים"; File = 'cross-workflows-characterization-he.txt' }
)

[System.IO.File]::WriteAllText($out, $header + $partA, [System.Text.UTF8Encoding]::new($false))

foreach ($p in $parts) {
    $sep = "`n`n================================================================================`n$($p.Title)`n================================================================================`n`n"
    $content = Get-Content (Join-Path $docsPath $p.File) -Raw -Encoding UTF8
    [System.IO.File]::AppendAllText($out, $sep + $content, [System.Text.UTF8Encoding]::new($false))
}

$lines = (Get-Content $out).Count
Write-Host "Created $out with $lines lines"
