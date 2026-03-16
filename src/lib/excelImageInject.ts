/**
 * Excel Image Injection Utility
 * Injects an image (logo) into an already-generated XLSX file
 * by manipulating the OpenXML zip structure using JSZip.
 */

import JSZip from 'jszip';

/**
 * Inject a PNG image into a specific sheet of an XLSX workbook.
 * The image is placed in the top-left area (rows 0-3, cols 0-1).
 *
 * @param xlsxBuffer - The raw XLSX file as ArrayBuffer
 * @param imageData  - The image as Uint8Array
 * @param sheetIndex - 0-based index of the target sheet (default 0 = first sheet)
 * @returns A Blob of the modified XLSX file
 */
export async function injectImageIntoXlsx(
  xlsxBuffer: ArrayBuffer,
  imageData: Uint8Array,
  sheetIndex: number = 0
): Promise<Blob> {
  const zip = await JSZip.loadAsync(xlsxBuffer);

  // 1. Add image file
  zip.file('xl/media/image1.png', imageData);

  // 2. Create drawing XML — positions the image from cell A1 to roughly B4
  const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor editAs="oneCell">
    <xdr:from>
      <xdr:col>0</xdr:col>
      <xdr:colOff>200000</xdr:colOff>
      <xdr:row>1</xdr:row>
      <xdr:rowOff>50000</xdr:rowOff>
    </xdr:from>
    <xdr:to>
      <xdr:col>2</xdr:col>
      <xdr:colOff>1500000</xdr:colOff>
      <xdr:row>6</xdr:row>
      <xdr:rowOff>100000</xdr:rowOff>
    </xdr:to>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="2" name="Meridian Logo"/>
        <xdr:cNvPicPr>
          <a:picLocks noChangeAspect="1"/>
        </xdr:cNvPicPr>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip r:embed="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
        <a:stretch>
          <a:fillRect/>
        </a:stretch>
      </xdr:blipFill>
      <xdr:spPr>
        <a:xfrm>
          <a:off x="200000" y="200000"/>
          <a:ext cx="5200000" cy="1100000"/>
        </a:xfrm>
        <a:prstGeom prst="rect">
          <a:avLst/>
        </a:prstGeom>
      </xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;
  zip.file('xl/drawings/drawing1.xml', drawingXml);

  // 3. Drawing relationships — links drawing to image
  const drawingRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`;
  zip.file('xl/drawings/_rels/drawing1.xml.rels', drawingRels);

  // 4. Update or create sheet relationships to include the drawing
  const sheetNum = sheetIndex + 1;
  const sheetRelsPath = `xl/worksheets/_rels/sheet${sheetNum}.xml.rels`;
  const drawingRel = `<Relationship Id="rId_drw1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>`;

  const existingRels = zip.file(sheetRelsPath);
  if (existingRels) {
    let rels = await existingRels.async('string');
    if (!rels.includes('drawing1.xml')) {
      rels = rels.replace('</Relationships>', `${drawingRel}\n</Relationships>`);
    }
    zip.file(sheetRelsPath, rels);
  } else {
    zip.file(sheetRelsPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${drawingRel}
</Relationships>`);
  }

  // 5. Add <drawing> reference to the sheet XML
  const sheetPath = `xl/worksheets/sheet${sheetNum}.xml`;
  const sheetFile = zip.file(sheetPath);
  if (sheetFile) {
    let sheetXml = await sheetFile.async('string');
    if (!sheetXml.includes('<drawing')) {
      // Insert before </worksheet> — but after <sheetData> and other elements
      sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rId_drw1"/>\n</worksheet>');
      zip.file(sheetPath, sheetXml);
    }
  }

  // 6. Update [Content_Types].xml
  const ctFile = zip.file('[Content_Types].xml');
  if (ctFile) {
    let ct = await ctFile.async('string');
    if (!ct.includes('image/png')) {
      ct = ct.replace('</Types>', `<Default Extension="png" ContentType="image/png"/>\n</Types>`);
    }
    if (!ct.includes('drawing1.xml')) {
      ct = ct.replace('</Types>',
        `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>\n</Types>`);
    }
    zip.file('[Content_Types].xml', ct);
  }

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Hide gridlines on all sheets in an XLSX buffer by patching the XML.
 * Works with xlsx-js-style v1.2.0 which doesn't support !sheetViews.
 */
export async function hideGridlinesInXlsx(xlsxBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(xlsxBuffer);

  // Find all sheet XML files
  const sheetFiles = Object.keys(zip.files).filter(
    f => f.startsWith('xl/worksheets/sheet') && f.endsWith('.xml')
  );

  for (const sheetPath of sheetFiles) {
    const file = zip.file(sheetPath);
    if (!file) continue;
    let xml = await file.async('string');

    // If sheetViews already exists, update showGridLines attribute
    if (xml.includes('<sheetViews>')) {
      // Add or replace showGridLines in existing sheetView
      if (xml.includes('showGridLines')) {
        xml = xml.replace(/showGridLines="[^"]*"/, 'showGridLines="0"');
      } else {
        xml = xml.replace('<sheetView ', '<sheetView showGridLines="0" ');
      }
    } else {
      // Insert sheetViews before sheetFormatPr or sheetData
      const insertBefore = xml.includes('<sheetFormatPr') ? '<sheetFormatPr' : '<sheetData';
      xml = xml.replace(
        insertBefore,
        `<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>${insertBefore}`
      );
    }

    zip.file(sheetPath, xml);
  }

  const result = await zip.generateAsync({ type: 'arraybuffer' });
  return result;
}

/**
 * Fetch the Meridian logo from the public assets and return as Uint8Array.
 * Caches the logo in IndexedDB so it's available during cold-start offline mode.
 */
const LOGO_CACHE_DB = 'logo_cache_db';
const LOGO_CACHE_STORE = 'logo_store';
const LOGO_CACHE_KEY = 'meridian_logo';

async function openLogoCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOGO_CACHE_DB, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(LOGO_CACHE_STORE)) {
        db.createObjectStore(LOGO_CACHE_STORE);
      }
    };
  });
}

async function getCachedLogo(): Promise<Uint8Array | null> {
  try {
    const db = await openLogoCacheDB();
    return new Promise((resolve) => {
      const tx = db.transaction(LOGO_CACHE_STORE, 'readonly');
      const req = tx.objectStore(LOGO_CACHE_STORE).get(LOGO_CACHE_KEY);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch { return null; }
}

async function cacheLogo(data: Uint8Array): Promise<void> {
  try {
    const db = await openLogoCacheDB();
    return new Promise((resolve) => {
      const tx = db.transaction(LOGO_CACHE_STORE, 'readwrite');
      tx.objectStore(LOGO_CACHE_STORE).put(data, LOGO_CACHE_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch {}
}

export async function fetchLogoImageData(): Promise<Uint8Array | null> {
  try {
    const response = await fetch('./images/meridian-logo.png');
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const data = new Uint8Array(buffer);
      // Cache for offline use
      cacheLogo(data).catch(() => {});
      return data;
    }
  } catch {
    // Fetch failed (offline) — try IndexedDB cache
  }
  // Fallback: load from IndexedDB cache
  return getCachedLogo();
}
