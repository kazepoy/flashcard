// Extraction de texte d'un PDF (pdf.js, chargé à la demande).

/**
 * @param {ArrayBuffer|Uint8Array} data
 * @param {{loader?:()=>Promise<any>, workerSrc?:string}} o
 * @returns {Promise<string>}
 */
export async function pdfToText(data, { loader, workerSrc } = {}) {
  const pdfjs = await (loader ? loader() : import('pdfjs-dist/build/pdf.min.mjs'));
  if (workerSrc && pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const doc = await pdfjs.getDocument({
    data: data instanceof Uint8Array ? data : new Uint8Array(data),
    useSystemFonts: true,
  }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = '';
    let out = '';
    let lastY = null;
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const y = it.transform ? it.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        out += line.trim() + '\n';
        line = '';
      }
      line += it.str + (it.hasEOL ? '\n' : ' ');
      lastY = y;
    }
    out += line.trim();
    pages.push(out);
  }
  return pages
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
