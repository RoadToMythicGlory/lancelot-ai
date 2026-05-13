export interface TextItem {
  pageNum: number;
  x: number;
  y: number;
  width: number;
  str: string;
  dir: string;
}

export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<TextItem[]> {
  // pdfjs-dist v5+ only ships ESM — dynamic import is required in CJS context
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

  const items: TextItem[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();

    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string' && item.str.trim()) {
        const tx = (item as any).transform;
        items.push({
          pageNum,
          x: tx ? tx[4] : 0,
          y: tx ? tx[5] : 0,
          width: (item as any).width || 0,
          str: item.str,
          dir: (item as any).dir || 'ltr',
        });
      }
    }

    page.cleanup();
  }

  await doc.destroy();
  return items;
}
