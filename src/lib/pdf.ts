import { createSource, validateSourceCollection } from "./canonical";
import { LIMITS, type Source } from "./contracts";

export async function readSourceFile(file: File, current: Source[]): Promise<Source> {
  if (file.size > LIMITS.fileBytes) throw new Error("Each file must be 5 MB or smaller.");
  if (!file.size) throw new Error("This file is empty. Choose a readable PDF or TXT file.");
  let source: Source;
  if (/\.txt$/i.test(file.name)) {
    const text = await file.text();
    if (!text.trim() || text.includes("\u0000")) throw new Error("This TXT file contains no readable text. Paste the policy text instead.");
    source = await createSource(file.name,[{number:1,text}],"txt");
  } else if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true});
    try {
      const document = await task.promise;
      if (document.numPages+current.reduce((n,s) => n+s.pages.length,0) > LIMITS.pages) throw new Error(`The evidence packet can contain up to ${LIMITS.pages} pages.`);
      const pages = [];
      for (let i=1;i<=document.numPages;i++) {
        const page = await document.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map(item => "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "").join("").trim();
        if (!text || text.replace(/\s/g,"").length < 3) throw new Error("This PDF has a scanned or unreadable page. OCR is not included; paste the policy text instead.");
        pages.push({number:i,text});
        page.cleanup();
      }
      source = await createSource(file.name,pages,"pdf");
    } catch(error) {
      if (error instanceof Error && /Password|InvalidPDF|MissingPDF|UnknownError/.test(error.name)) throw new Error("This PDF is encrypted, corrupt, or unreadable. Use a selectable-text PDF or paste its text.");
      throw error;
    } finally {await task.destroy();}
  } else throw new Error("Choose a PDF or TXT file. Other file types are not supported.");
  validateSourceCollection([...current,source]);
  return source;
}
