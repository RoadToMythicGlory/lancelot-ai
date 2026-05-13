import { splitSections } from '../splitSections';
import { TextItem } from '../extractText';

function makeItem(str: string, y: number, pageNum = 1, x = 100): TextItem {
  return { str, y, pageNum, x, width: 50, dir: 'rtl' };
}

describe('splitSections', () => {
  it('splits items by section anchors', () => {
    const items: TextItem[] = [
      makeItem('פרטי שידור', 800),
      makeItem('תאריך: 17/04/2026', 780),
      makeItem('עיר: תל אביב', 760),
      makeItem('רשימת אנשי צוות', 700),
      makeItem('צלם: יוסי כהן', 680),
      makeItem('הערות למשחק', 600),
      makeItem('הערה כלשהי', 580),
      makeItem('רשימת פריטים', 500),
      makeItem('TRIPOD BIG', 480),
      makeItem('3', 480, 1, 50),
    ];

    const sections = splitSections(items);

    expect(sections.broadcastDetails.length).toBeGreaterThan(0);
    expect(sections.crew.length).toBeGreaterThan(0);
    expect(sections.notes.length).toBeGreaterThan(0);
    expect(sections.equipmentItems.length).toBeGreaterThan(0);
  });

  it('handles missing sections gracefully', () => {
    const items: TextItem[] = [
      makeItem('רשימת פריטים', 500),
      makeItem('CAMERA 1', 480),
      makeItem('2', 480, 1, 50),
    ];

    const sections = splitSections(items);
    expect(sections.equipmentItems.length).toBeGreaterThan(0);
    expect(sections.broadcastDetails.length).toBe(0);
    expect(sections.crew.length).toBe(0);
    expect(sections.notes.length).toBe(0);
  });

  it('dumps everything into equipmentItems when no anchors found', () => {
    const items: TextItem[] = [
      makeItem('TRIPOD BIG', 480),
      makeItem('3', 480, 1, 50),
    ];

    const sections = splitSections(items);
    expect(sections.equipmentItems.length).toBe(2);
  });

  it('handles multi-page PDFs', () => {
    const items: TextItem[] = [
      makeItem('פרטי שידור', 800, 1),
      makeItem('date info', 780, 1),
      makeItem('רשימת פריטים', 800, 2),
      makeItem('CAMERA', 780, 2),
    ];

    const sections = splitSections(items);
    expect(sections.broadcastDetails.length).toBeGreaterThan(0);
    expect(sections.equipmentItems.length).toBeGreaterThan(0);
  });

  it('handles side-by-side anchors (broadcast + crew on same Y line)', () => {
    const items: TextItem[] = [
      makeItem('טופס השכרת ציוד מחסן', 800, 1, 200),
      // Side-by-side headers on the same Y
      makeItem('פרטי שידור', 700, 1, 200),
      makeItem('רשימת אנשי צוות', 700, 1, 450),
      // Broadcast details (left/lower X)
      makeItem('תאריך המשחק : 10-04-2026', 680, 1, 150),
      makeItem('עיר : תל אביב', 660, 1, 200),
      // Crew (right/higher X)
      makeItem('טכנאי/ים : יוסי', 680, 1, 470),
      makeItem('צלם/ים : דני', 660, 1, 400),
      // Notes section below
      makeItem('הערות למשחק', 600, 1, 400),
      makeItem('some note', 580, 1, 400),
      makeItem('רשימת פריטים', 500, 1, 400),
      makeItem('TRIPOD', 480, 1, 400),
    ];

    const sections = splitSections(items);

    // Broadcast details should have the date/city items (low X)
    const bdTexts = sections.broadcastDetails.map(i => i.str);
    expect(bdTexts).toContain('תאריך המשחק : 10-04-2026');
    expect(bdTexts).toContain('עיר : תל אביב');

    // Crew should have the technician/camera items (high X)
    const crewTexts = sections.crew.map(i => i.str);
    expect(crewTexts).toContain('טכנאי/ים : יוסי');
    expect(crewTexts).toContain('צלם/ים : דני');

    expect(sections.notes.length).toBeGreaterThan(0);
    expect(sections.equipmentItems.length).toBeGreaterThan(0);
  });
});
