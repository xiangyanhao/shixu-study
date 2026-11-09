const PAGE_BETWEEN_PARAGRAPHS=/<p>((?:(?!<\/p>).)*)<\/p><h3 id="(heading-\d+)">(PDF 第 (\d+) 页（正文第 \d+ 页）)<\/h3><p>((?:(?!<\/p>).)*)<\/p>/gs;
const plainText=html=>html.replace(/<[^>]+>/g,'').replace(/&(?:#\d+|#x[\da-f]+|\w+);/gi,'字').trim();

export function joinPdfPageContinuations(html){
 let result=html,previous;
 do{
  previous=result;
  result=result.replace(PAGE_BETWEEN_PARAGRAPHS,(full,before,id,title,page,after)=>{
   const end=plainText(before),start=plainText(after);
   if(/[。！？.!?][”’"'）】]*$/.test(end)||/^(?:（\d+）|\(\d+\)|\d+[.、])/.test(start))return full;
   return `<p>${before}<span id="${id}" class="pdf-page-inline" role="note" aria-label="${title}">〔PDF ${page}〕</span>${after}</p>`;
  });
 }while(result!==previous);
 return result;
}
