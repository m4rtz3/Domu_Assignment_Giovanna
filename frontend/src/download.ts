/**
 * Shared file-download helpers. PDF support is dynamically imported (jsPDF)
 * so it doesn't add weight to the initial page load for people who never
 * click "Download PDF".
 */

function saveBlob(filename: string, content: BlobPart, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadMarkdown(filename: string, content: string) {
  saveBlob(filename, content, "text/markdown;charset=utf-8;");
}

export function downloadText(filename: string, content: string) {
  saveBlob(filename, content, "text/plain;charset=utf-8;");
}

/** Strips the most common Markdown syntax so a PDF reads like a finished document, not raw source. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^```\w*$/gm, "")
    .replace(/^-\s+/gm, "• ");
}

export async function downloadPdf(filename: string, title: string, bodyText: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFontSize(16);
  doc.text(title, margin, y);
  y += 10;

  doc.setFontSize(10);
  const lines = doc.splitTextToSize(bodyText, maxWidth) as string[];
  for (const line of lines) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 5;
  }

  doc.save(filename);
}
