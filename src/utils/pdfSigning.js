import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Takes the original PDF's raw bytes and every signer's drawn signature +
// name + timestamp, and returns a new PDF with a dedicated signature page
// appended at the end — rather than drawing over whatever's already on the
// last page, which could land on top of real content unpredictably. This
// is the V1 approach: signatures on their own clearly-labeled page, not
// placed at specific spots within the document itself (that would need a
// real PDF viewer/editor for someone to click "sign here," which is a
// bigger build for later if needed).
export async function embedSignatures(originalPdfBytes, title, signatures) {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();

  page.drawText('Signature Record', { x: 50, y: height - 60, size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(title, { x: 50, y: height - 82, size: 11, font, color: rgb(0.35, 0.35, 0.35) });

  let y = height - 140;
  const rowHeight = 90;

  for (const sig of signatures) {
    if (y < 100) break; // safety: stop rather than draw off the bottom of the page

    if (sig.signatureImageDataUrl) {
      try {
        const pngBytes = dataUrlToBytes(sig.signatureImageDataUrl);
        const pngImage = await pdfDoc.embedPng(pngBytes);
        const imgDims = pngImage.scaleToFit(180, 50);
        page.drawImage(pngImage, { x: 50, y: y - 10, width: imgDims.width, height: imgDims.height });
      } catch {
        // A malformed signature image shouldn't take down the whole
        // document generation — just skip drawing it, the name/timestamp
        // line below still records that they signed.
      }
    }

    page.drawText(`${sig.name}`, { x: 50, y: y - 62, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(`Signed ${new Date(sig.signedAt).toLocaleString()}`, {
      x: 50,
      y: y - 78,
      size: 9,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
    page.drawLine({ start: { x: 50, y: y - 88 }, end: { x: width - 50, y: y - 88 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });

    y -= rowHeight;
  }

  return pdfDoc.save();
}
