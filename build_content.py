"""Rebuild from project-owned sources; PDF re-extraction is optional."""
from pathlib import Path
import argparse, json, re, shutil
ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root', type=Path, default=ROOT/'sources'/'materials')
parser.add_argument('--refresh-curriculum', action='store_true', help='Re-extract the bundled PDF (requires PyMuPDF)')
parser.add_argument('--curriculum', type=Path, default=ROOT/'dist'/'assets'/'curriculum-2025.pdf')
args = parser.parse_args()
source_root = args.source_root.resolve()
notes = source_root / '高中教资科目一二备考资料'
book = source_root / '高中信息科技教资_科目三+面试_微型教材.md'
if not notes.is_dir() or not book.is_file():
    parser.error('Source materials missing. Keep sources/materials with the project or provide --source-root.')
docs = []
for path in sorted(notes.rglob('*.md')):
    rel = path.relative_to(source_root).as_posix()
    text = path.read_text(encoding='utf-8-sig')
    subject = 1 if '科目一-' in rel else 2 if '科目二-' in rel else 0
    docs.append(dict(id=f'd{len(docs)+1}', subject=subject, title=path.stem, path=rel, text=text))
text = book.read_text(encoding='utf-8-sig')
parts = re.split(r'(?m)(?=^# 第[一二三四五六七八九十]+篇|^## (?:第[一二三四五六七八九十]+章|写在前面|最后))', text)
pending_part = ''
for part in parts:
    if re.match(r'^# 第[一二三四五六七八九十]+篇', part):
        pending_part = part.strip()
        continue
    title = re.search(r'^## (.+)', part, re.M)
    if not title: continue
    title = re.sub(r'\s*\{.*?\}', '', title.group(1))
    chapter_text = part.strip()
    if pending_part:
        chapter_text = pending_part + '\n\n' + chapter_text
        pending_part = ''
    docs.append(dict(id=f'd{len(docs)+1}',subject=4 if '第八章' in title else 3,title=title,path=book.name,text=chapter_text))
# Supplement: retain exact PDF pages and the uploaded version label.
# A checked-in extraction lets deployments build without PDF dependencies.
standard = args.curriculum.resolve()
cache = ROOT / 'sources' / 'curriculum.json'
if args.refresh_curriculum or not cache.exists():
    if not standard.is_file():
        parser.error('Curriculum PDF missing; restore dist/assets/curriculum-2025.pdf or specify --curriculum.')
    try:
        import pymupdf
    except ImportError:
        parser.error('PDF extraction requires PyMuPDF. Install it with: python -m pip install pymupdf')
    pdf = pymupdf.open(standard)
    def display_page(page, number):
        """Recover visible paragraphs and headings from PDF geometry; keep raw text for citations."""
        tables = list(page.find_tables().tables)
        blocks = [b for b in page.get_text('dict')['blocks'] if 'lines' in b]
        items = []
        for block in blocks:
            x, y, right, bottom = block['bbox']
            if y >= 665 or any(y >= t.bbox[1]-2 and bottom <= t.bbox[3]+2
                               and x >= t.bbox[0]-2 and right <= t.bbox[2]+2 for t in tables):
                continue
            spans = [span for line in block['lines'] for span in line['spans']]
            value = ''.join(span['text'] for span in spans).strip()
            if not value or value == '续表' or value.startswith('│') or value.startswith('普通高中信息科技课程标准（'):
                continue
            size = max(span['size'] for span in spans)
            title_font = any('FZXBS' in span['font'] or 'FZDBS' in span['font']
                             or 'TimesNewRomanPS-Bold' in span['font'] for span in spans)
            is_title = size >= 13 or (title_font and len(value) <= 48)
            if re.fullmatch(r'【[^】]+】', value): is_title = True
            items.append((y, 'heading' if is_title else 'body', value, x))
        for table in tables:
            rows = table.extract()
            table_lines = ['**本页表格（排版和合并单元格请以 PDF 原页为准）**']
            for row in rows:
                cells = [re.sub(r'\s+', '', cell or '') for cell in row]
                if not any(cells): continue
                if cells[0] in ('水平','类别'):
                    table_lines.append('**'+' · '.join(filter(None, cells))+'**')
                else:
                    if cells[0]: table_lines.append('#### '+cells[0])
                    for cell in filter(None, cells[1:]):
                        entries = [item for item in re.split(r'(?=模块\d+\s*：|\d+-\d+\.\s*|（\d+）)', cell) if item]
                        table_lines.extend('- '+item for item in entries)
            items.append((table.bbox[1], 'table', '\n'.join(table_lines), 0))
        items.sort(key=lambda item:item[0])
        output = [f'### PDF 第 {number} 页（正文第 {number-3} 页）']
        paragraph = ''
        previous_y = None
        previous_x = None
        def flush():
            nonlocal paragraph
            if paragraph.strip(): output.append(paragraph.strip()); paragraph = ''
        for y, kind, value, x in items:
            if kind != 'body':
                flush()
                if kind == 'table': output.append(value)
                else: output.append(('### ' if re.match(r'^[一二三四五六七八九十]+、|^附录$', value) else '#### ')+value)
            else:
                if (paragraph and previous_y is not None and
                    (y-previous_y > 27 or (x-(previous_x or 0)>15 and paragraph.endswith(('。','！','？','；'))))):
                    flush()
                paragraph += value
            previous_y, previous_x = y, x
        flush()
        return '\n\n'.join(output)
    sections = [('课程性质',4,4),('课程理念',5,6),('课程目标与核心素养',7,10),
                ('课程结构与学分',11,13),('课程内容·必修',14,20),
                ('课程内容·选择性必修',20,35),('课程内容·选修',35,39),
                ('学业质量',40,43),('教学与评价建议',44,49),
                ('学业水平考试建议',49,53),('教材与课程实施建议',53,58),
                ('附录·核心素养水平划分',59,63)]
    # A shared PDF page can contain the end of one topic and the start of the next.
    # Divide both reading text and citation text at the real subsection heading.
    boundaries = {20:'（二）选择性必修课程',35:'（三）选修课程',
                  49:'（二）学业水平考试建议',53:'（三）教材编写建议'}
    page_text = {}
    page_display = {}
    for p in range(4,64):
        page = pdf[p-1]
        raw = page.get_text().strip()
        page_text[p] = re.sub(r'(?<=[\u4e00-\u9fff，、；：])\n(?=[\u4e00-\u9fff])','',raw)
        page_display[p] = display_page(page,p).split('\n\n',1)[1]
    page_parts = {}
    for p, heading in boundaries.items():
        display_match = re.search(r'(?m)^#### '+re.escape(heading)+r'\s*$',page_display[p])
        raw_matches = list(re.finditer(re.escape(heading),page_text[p]))
        if not display_match or len(raw_matches)!=1:
            raise ValueError(f'PDF page {p}: cannot uniquely locate subsection {heading}')
        raw_match = raw_matches[0]
        page_parts[p] = ((page_text[p][:raw_match.start()].strip(),page_text[p][raw_match.start():].strip()),
                         (page_display[p][:display_match.start()].strip(),page_display[p][display_match.start():].strip()))
    extracted=[]
    for title,start,end in sections:
        pages=[];display_pages=[]
        for p in range(start,end+1):
            raw,display=page_text[p],page_display[p]
            if p in page_parts:
                if p not in (start,end):
                    raise ValueError(f'PDF page {p}: shared-page boundary is not at a topic edge')
                side=1 if p==start else 0
                raw=page_parts[p][0][side]
                display=page_parts[p][1][side]
            page_label=f'### PDF 第 {p} 页（正文第 {p-3} 页）\n\n'
            pages.append(page_label+raw)
            display_pages.append(page_label+display)
        extracted.append(dict(id=f'curriculum-{start}',subject=3,title=f'课标补充｜{title}',
            path='信息技术最新版课程标准.pdf',text='## '+title+'\n\n'+'\n\n'.join(pages),
            displayText='## '+title+'\n\n'+'\n\n'.join(display_pages),
            sourceType='curriculum',priority=10,version='2017年版2025年修订·日常修订版',
            pdfUrl=f'./assets/curriculum-2025.pdf#page={start}',startPage=start,endPage=end))
    cache.parent.mkdir(exist_ok=True)
    cache.write_text(json.dumps(extracted,ensure_ascii=False),encoding='utf-8')
    (ROOT/'dist'/'assets').mkdir(exist_ok=True)
    target = ROOT/'dist'/'assets'/'curriculum-2025.pdf'
    if standard != target.resolve():
        shutil.copyfile(standard,target)
if cache.exists():
    docs.extend(json.loads(cache.read_text(encoding='utf-8')))
(ROOT / 'dist' / 'content.json').write_text(json.dumps(docs,ensure_ascii=False),encoding='utf-8')
print(f'Bundled {len(docs)} source documents/chapters, {sum(len(d["text"]) for d in docs):,} characters')
