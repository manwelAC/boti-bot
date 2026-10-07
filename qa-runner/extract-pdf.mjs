#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

if (process.argv.length < 4) throw new Error('Usage: extract-pdf.mjs ATTACHMENT OUTPUT_DIR');
const [source, output] = process.argv.slice(2).map(path => resolve(path));
mkdirSync(output, { recursive: true });

function execute(binary, args, timeout = 300000) {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${binary}: ${(result.stderr || result.error?.message || result.status).toString().trim().slice(0, 400)}`);
  return result.stdout;
}

const extension = extname(source).toLowerCase();
if (['.txt', '.md', '.csv'].includes(extension)) {
  const textPath = join(output, 'page-1.txt');
  copyFileSync(source, textPath);
  const fullTextPath = join(output, 'full-text.txt');
  copyFileSync(source, fullTextPath);
  const textChars = readFileSync(textPath, 'utf8').trim().length;
  console.log(JSON.stringify({ pageCount: 1, textPath: fullTextPath, pages: [{ page: 1, textPath, ocrPath: null, imagePath: null, textChars, ocrChars: 0, status: textChars ? 'readable' : 'unreadable', reason: '' }] }));
  process.exit(0);
}
if (['.png', '.jpg', '.jpeg', '.tif', '.tiff'].includes(extension)) {
  const imagePath = join(output, `page-1${extension}`);
  copyFileSync(source, imagePath);
  const ocrPath = join(output, 'page-1.ocr.txt');
  let reason = '';
  try { writeFileSync(ocrPath, execute('tesseract', [imagePath, 'stdout', '-l', 'eng'], 60000)); }
  catch (error) { reason = error.message; writeFileSync(ocrPath, ''); }
  const textPath = join(output, 'full-text.txt');
  copyFileSync(ocrPath, textPath);
  const ocrChars = readFileSync(ocrPath, 'utf8').trim().length;
  console.log(JSON.stringify({ pageCount: 1, textPath, pages: [{ page: 1, textPath, ocrPath, imagePath, textChars: 0, ocrChars, status: ocrChars ? 'readable' : 'unreadable', reason }] }));
  process.exit(0);
}
let pdf = source;
if (['.doc', '.docx', '.odt'].includes(extension)) {
  execute('libreoffice', ['-env:UserInstallation=file:///tmp/botibot-lo', '--headless', '--convert-to', 'pdf', '--outdir', output, source], 120000);
  pdf = join(output, `${basename(source, extension)}.pdf`);
  if (!existsSync(pdf)) throw new Error('Office document conversion did not produce a PDF');
} else if (extension !== '.pdf') throw new Error(`Unsupported attachment format: ${extension || 'none'}`);

const info = execute('pdfinfo', [pdf]);
const count = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
if (!Number.isInteger(count) || count < 1) throw new Error('Could not determine PDF page count');
const pagePrefix = join(output, 'page');
execute('pdftoppm', ['-png', '-scale-to', '1400', pdf, pagePrefix], 600000);
const images = readdirSync(output).filter(name => /^page-\d+\.png$/.test(name)).sort((a, b) => Number(/\d+/.exec(a)[0]) - Number(/\d+/.exec(b)[0]));
const pages = [];
for (let page = 1; page <= count; page++) {
  const imageName = images[page - 1];
  const imagePath = imageName ? join(output, imageName) : null;
  const textPath = join(output, `page-${page}.txt`);
  const ocrPath = join(output, `page-${page}.ocr.txt`);
  let textError = null, ocrError = null;
  try { execute('pdftotext', ['-f', String(page), '-l', String(page), '-layout', pdf, textPath], 30000); }
  catch (error) { textError = error.message; writeFileSync(textPath, ''); }
  try { if (!imagePath) throw new Error('Page image missing'); writeFileSync(ocrPath, execute('tesseract', [imagePath, 'stdout', '-l', 'eng'], 60000)); }
  catch (error) { ocrError = error.message; writeFileSync(ocrPath, ''); }
  const textChars = readFileSync(textPath, 'utf8').trim().length;
  const ocrChars = readFileSync(ocrPath, 'utf8').trim().length;
  pages.push({ page, textPath, ocrPath, imagePath, textChars, ocrChars, status: textChars || ocrChars ? 'readable' : 'unreadable', reason: textError && ocrError ? `${textError}; ${ocrError}` : textError || ocrError || '' });
}
const wholeTextPath = join(output, 'full-text.txt');
try { execute('pdftotext', ['-layout', pdf, wholeTextPath]); }
catch { writeFileSync(wholeTextPath, pages.map(item => readFileSync(item.textPath, 'utf8')).join('\n\f\n')); }
console.log(JSON.stringify({ pageCount: count, textPath: wholeTextPath, pages }));
