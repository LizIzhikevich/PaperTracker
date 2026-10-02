const { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const pdfParse = require('pdf-parse');

const execFileAsync = promisify(execFile);

const STATUSES = new Set(['to-read', 'reading', 'read']);
const PRIORITIES = new Set(['normal', 'high']);
const CREATES_FIELDS = ['claim', 'reasoning', 'evidence', 'assumptions', 'threats', 'extensions'];
const BINDER_COLORS = [
  '#46385f',
  '#275f9b',
  '#526f96',
  '#6f86a5',
  '#6782a8',
  '#8da3bd',
  '#9aa9bb',
  '#34495f',
  '#566579',
  '#6b5b7d',
  '#4e6f86',
  '#3d5f7c',
  '#5f7f6a',
  '#879b73',
  '#b28a54',
  '#a66f5b',
  '#9a6570',
  '#7a6654'
];

let mainWindow;

const APP_NAME = 'PaperTracker';
const STABLE_USER_DATA_DIR_NAME = 'PaperTracker';
const LEGACY_USER_DATA_DIR_NAMES = ['paper-tracker'];

configureUserDataPath();

function configureUserDataPath() {
  app.setName(APP_NAME);
  app.setPath('userData', path.join(app.getPath('appData'), STABLE_USER_DATA_DIR_NAME));
}

function getStorePaths() {
  const root = app.getPath('userData');
  return {
    root,
    libraryFile: path.join(root, 'library.json'),
    papersDir: path.join(root, 'papers'),
    thumbnailsDir: path.join(root, 'thumbnails')
  };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function migrateLegacyStoreIfNeeded() {
  const { root, libraryFile } = getStorePaths();

  await fs.mkdir(root, { recursive: true });

  if (await pathExists(libraryFile)) {
    return;
  }

  const appDataRoot = app.getPath('appData');

  for (const legacyName of LEGACY_USER_DATA_DIR_NAMES) {
    const legacyRoot = path.join(appDataRoot, legacyName);
    const legacyLibraryFile = path.join(legacyRoot, 'library.json');

    if (legacyRoot === root || !(await pathExists(legacyLibraryFile))) {
      continue;
    }

    await fs.cp(legacyRoot, root, {
      recursive: true,
      force: false,
      errorOnExist: false
    });

    await fs.writeFile(path.join(root, 'migrated-from.txt'), `${legacyRoot}\n`, 'utf8').catch(() => {});
    return;
  }
}

async function ensureStore() {
  const { libraryFile, papersDir, thumbnailsDir } = getStorePaths();
  await fs.mkdir(papersDir, { recursive: true });
  await fs.mkdir(thumbnailsDir, { recursive: true });

  try {
    const raw = await fs.readFile(libraryFile, 'utf8');
    const library = JSON.parse(raw);
    let changed = false;

    if (!Array.isArray(library.buckets)) {
      library.buckets = getStarterBuckets();
      changed = true;
    }

    if (!Array.isArray(library.papers)) {
      library.papers = [];
      changed = true;
    }

    library.buckets = library.buckets.map((bucket) => {
      const normalized = normalizeBucket({
        ...bucket,
        category: bucket.category || inferBucketCategory(bucket.id, library.papers)
      });

      if (normalized.category !== bucket.category || normalized.name !== bucket.name || normalized.color !== bucket.color) {
        changed = true;
      }

      return normalized;
    });

    for (const paper of library.papers) {
      const normalized = normalizePaper(
        {
          ...paper,
          status: migrateStatus(paper.status),
          bucketId: paper.bucketId || library.buckets[0]?.id || 'general'
        },
        paper
      );

      if (normalized.localPath && shouldEnrichPaper(normalized)) {
        const metadata = await extractPdfMetadata(normalized.localPath, `${normalized.sourceFilename} ${normalized.title}`);
        const metadataUpdate = mergeExtractedMetadata(normalized, metadata);

        if (Object.keys(metadataUpdate).length) {
          Object.assign(normalized, metadataUpdate);
          changed = true;
        }
      }

      if (normalized.localPath && (!normalized.pageSnapshotPath || shouldRefreshPageSnapshot(normalized.pageSnapshotPath))) {
        const previousPageSnapshotPath = normalized.pageSnapshotPath;
        normalized.pageSnapshotPath = await createPdfPageSnapshot(normalized.localPath, normalized.id);
        if (previousPageSnapshotPath && previousPageSnapshotPath !== normalized.thumbnailPath && previousPageSnapshotPath !== normalized.pageSnapshotPath) {
          await fs.unlink(previousPageSnapshotPath).catch(() => {});
        }
        changed = true;
      }

      if (normalized.localPath && (!normalized.thumbnailPath || normalized.thumbnailPath === normalized.pageSnapshotPath || shouldRefreshFigureThumbnail(normalized.thumbnailPath))) {
        const previousThumbnailPath = normalized.thumbnailPath;
        const figureThumbnailPath = await createFigureOneThumbnail(normalized.localPath, normalized.id);

        if (figureThumbnailPath) {
          normalized.thumbnailPath = figureThumbnailPath;
          if (previousThumbnailPath && previousThumbnailPath !== normalized.pageSnapshotPath && previousThumbnailPath !== figureThumbnailPath) {
            await fs.unlink(previousThumbnailPath).catch(() => {});
          }
          changed = true;
        } else if (normalized.thumbnailPath === normalized.pageSnapshotPath) {
          normalized.thumbnailPath = '';
          changed = true;
        }
      }

      if (
        normalized.status !== paper.status ||
        normalized.priority !== paper.priority ||
        normalized.bucketId !== paper.bucketId ||
        normalized.readTab !== paper.readTab ||
        normalized.institutions !== paper.institutions ||
        normalized.abstract !== paper.abstract ||
        JSON.stringify(normalized.creates) !== JSON.stringify(paper.creates || {}) ||
        normalized.pageSnapshotPath !== paper.pageSnapshotPath ||
        normalized.thumbnailPath !== paper.thumbnailPath ||
        !Array.isArray(paper.tags)
      ) {
        changed = true;
      }

      Object.assign(paper, normalized);
    }

    if (changed) {
      await writeLibrary(library);
    }
  } catch (error) {
    await recoverOrCreateLibrary(error);
  }
}

async function recoverOrCreateLibrary(error) {
  const { libraryFile } = getStorePaths();

  if (error?.code === 'ENOENT') {
    await writeLibrary(createStarterLibrary());
    return;
  }

  const backupLibrary = await readBackupLibrary();

  if (backupLibrary) {
    await writeLibrary(backupLibrary);
    return;
  }

  if (await pathExists(libraryFile)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.copyFile(libraryFile, `${libraryFile}.corrupt-${timestamp}`).catch(() => {});
  }

  await writeLibrary(createStarterLibrary());
}

async function readBackupLibrary() {
  const { libraryFile } = getStorePaths();

  try {
    const raw = await fs.readFile(`${libraryFile}.backup`, 'utf8');
    const backup = JSON.parse(raw);
    return backup && Array.isArray(backup.papers) && Array.isArray(backup.buckets) ? backup : null;
  } catch {
    return null;
  }
}

function createStarterLibrary() {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    buckets: getStarterBuckets(),
    papers: getStarterPapers()
  };
}

async function readLibrary() {
  await ensureStore();
  const { libraryFile } = getStorePaths();
  const raw = await fs.readFile(libraryFile, 'utf8');
  return JSON.parse(raw);
}

async function writeLibrary(library) {
  const { libraryFile } = getStorePaths();
  const tempFile = `${libraryFile}.${process.pid}.tmp`;
  const backupFile = `${libraryFile}.backup`;

  await fs.mkdir(path.dirname(libraryFile), { recursive: true });

  if (await pathExists(libraryFile)) {
    await fs.copyFile(libraryFile, backupFile).catch(() => {});
  }

  await fs.writeFile(tempFile, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
  await fs.rename(tempFile, libraryFile);
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString('hex');
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }

  return String(tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizePaper(input = {}, existing = {}) {
  const now = new Date().toISOString();
  const status = STATUSES.has(input.status) ? input.status : STATUSES.has(existing.status) ? existing.status : 'to-read';
  const priority = normalizePriority(input.priority || existing.priority);
  const rating = Number(input.rating || existing.rating || 0);

  return {
    id: existing.id || input.id || createId(),
    title: coalesceText(input.title, existing.title, 'Untitled paper'),
    authors: coalesceText(input.authors, existing.authors, ''),
    institutions: coalesceText(input.institutions, existing.institutions, ''),
    venue: coalesceText(input.venue, existing.venue, ''),
    year: coalesceText(input.year, existing.year, ''),
    tags: normalizeTags(input.tags === undefined ? existing.tags || [] : input.tags),
    status,
    priority,
    bucketId: String(input.bucketId || existing.bucketId || 'general'),
    readTab: normalizeReadTab(input.readTab === undefined ? existing.readTab : input.readTab),
    deadline: coalesceText(input.deadline, existing.deadline, ''),
    rating: Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0,
    localPath: coalesceText(input.localPath, existing.localPath, ''),
    pageSnapshotPath: coalesceText(input.pageSnapshotPath, existing.pageSnapshotPath, ''),
    thumbnailPath: coalesceText(input.thumbnailPath, existing.thumbnailPath, ''),
    sourceFilename: coalesceText(input.sourceFilename, existing.sourceFilename, ''),
    abstract: input.abstract === undefined ? coalesceText(existing.abstract, '') : String(input.abstract || '').trim(),
    notes: input.notes === undefined ? String(existing.notes || '') : String(input.notes || ''),
    creates: normalizeCreates(input.creates, existing.creates),
    addedAt: existing.addedAt || input.addedAt || now,
    updatedAt: now,
    lastOpenedAt: existing.lastOpenedAt || input.lastOpenedAt || '',
    finishedAt: status === 'read' ? existing.finishedAt || now : ''
  };
}

function normalizeReadTab(value) {
  const text = String(value || '').trim();
  return text ? slugify(text) : '';
}

function normalizeCreates(input = {}, existing = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const previous = existing && typeof existing === 'object' ? existing : {};
  const creates = {
    enabled: source.enabled === undefined ? Boolean(previous.enabled) : Boolean(source.enabled)
  };

  for (const field of CREATES_FIELDS) {
    creates[field] = source[field] === undefined ? String(previous[field] || '') : String(source[field] || '');
  }

  return creates;
}

function coalesceText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return '';
}

function migrateStatus(status) {
  if (status === 'need-notes') {
    return 'reading';
  }

  if (status === 'skimmed') {
    return 'read';
  }

  return STATUSES.has(status) ? status : 'to-read';
}

function normalizePriority(priority) {
  return priority === 'high' ? 'high' : 'normal';
}

function titleFromFile(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/[-_]+/g, ' ');
}

function normalizeBucket(input = {}) {
  const now = new Date().toISOString();
  const id = input.id || slugify(input.name || 'binder');
  const category = input.category === 'archived' ? 'archived' : 'active';

  return {
    id,
    name: String(input.name || 'New Binder').trim(),
    category,
    color: normalizeColor(input.color) || getDefaultBinderColor(id),
    readTabs: normalizeReadTabs(input.readTabs),
    createdAt: input.createdAt || now
  };
}

function normalizeReadTabs(tabs = []) {
  const seen = new Set();
  return (Array.isArray(tabs) ? tabs : [])
    .map((tab) => {
      const name = String(tab?.name || tab?.label || '').trim();
      const id = name || tab?.id ? slugify(tab?.id || name) : '';
      return { id, name: name || id };
    })
    .filter((tab) => {
      if (!tab.id || seen.has(tab.id)) {
        return false;
      }

      seen.add(tab.id);
      return true;
    });
}

function normalizeColor(value) {
  const color = String(value || '').trim();
  const normalized = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '';
  return BINDER_COLORS.includes(normalized) ? normalized : '';
}

function getDefaultBinderColor(value) {
  const key = String(value || 'binder');
  const hash = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return BINDER_COLORS[hash % BINDER_COLORS.length];
}

function inferBucketCategory(bucketId, papers) {
  const bucketPapers = papers.filter((paper) => paper.bucketId === bucketId);

  if (bucketPapers.length && bucketPapers.every((paper) => migrateStatus(paper.status) === 'read')) {
    return 'archived';
  }

  return 'active';
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || createId();
}

async function copyPaperIntoLibrary(sourcePath, id) {
  const { papersDir } = getStorePaths();
  const extension = path.extname(sourcePath) || '.pdf';
  const targetPath = path.join(papersDir, `${id}${extension}`);
  await fs.copyFile(sourcePath, targetPath);
  return targetPath;
}

async function createPdfPageSnapshot(filePath, id) {
  const renderedPagePath = await renderPdfPage(filePath, `${id}-page1-source-v2`, 1, 125);

  if (!renderedPagePath) {
    return '';
  }

  try {
    const image = nativeImage.createFromPath(renderedPagePath);
    const size = image.getSize();

    if (!size.width || !size.height) {
      return '';
    }

    const cropRect = detectPageContentRect(image) || constrainRect({
      x: Math.round(size.width * 0.12),
      y: Math.round(size.height * 0.08),
      width: Math.round(size.width * 0.76),
      height: Math.round(size.height * 0.84)
    }, size);
    const cropped = image.crop(cropRect).resize({ width: 720 });
    const { thumbnailsDir } = getStorePaths();
    const outputPath = path.join(thumbnailsDir, `${id}-page1-v2.png`);

    await fs.writeFile(outputPath, cropped.toPNG());
    return outputPath;
  } catch {
    return '';
  } finally {
    await fs.unlink(renderedPagePath).catch(() => {});
  }
}

async function createFigureOneThumbnail(filePath, id) {
  const region = await findFigureOneRegion(filePath);

  if (!region) {
    return '';
  }

  const renderedPagePath = await renderPdfPage(filePath, `${id}-figure-page-${region.pageNumber}`, region.pageNumber, 160);

  if (!renderedPagePath) {
    return '';
  }

  try {
    const image = nativeImage.createFromPath(renderedPagePath);
    const size = image.getSize();

    if (!size.width || !size.height) {
      return '';
    }

    const cropRect = getFigureCropRect(region, image);
    const cropped = image.crop(cropRect).resize({ width: 420 });
    const { thumbnailsDir } = getStorePaths();
    const outputPath = path.join(thumbnailsDir, `${id}-figure1-v7.png`);

    await fs.writeFile(outputPath, cropped.toPNG());
    return outputPath;
  } catch {
    return '';
  } finally {
    await fs.unlink(renderedPagePath).catch(() => {});
  }
}

async function renderPdfPage(filePath, outputName, pageNumber = 1, resolution = 110) {
  const command = await findExecutable('pdftoppm', [
    '/Users/liz/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm',
    '/opt/homebrew/bin/pdftoppm',
    '/usr/local/bin/pdftoppm'
  ]);

  if (!command) {
    return '';
  }

  const { thumbnailsDir } = getStorePaths();
  await fs.mkdir(thumbnailsDir, { recursive: true });
  const outputBase = path.join(thumbnailsDir, outputName);
  const outputPath = `${outputBase}.png`;

  try {
    await execFileAsync(command, ['-f', String(pageNumber), '-l', String(pageNumber), '-singlefile', '-png', '-r', String(resolution), filePath, outputBase], {
      timeout: 15000
    });
    await fs.access(outputPath);
    return outputPath;
  } catch {
    return '';
  }
}

async function findFigureOneRegion(filePath) {
  let pdfjs;

  try {
    pdfjs = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
  } catch {
    return null;
  }

  try {
    const data = await fs.readFile(filePath);
    const document = await pdfjs.getDocument(new Uint8Array(data)).promise;
    const maxPages = Math.min(document.numPages || 1, 8);

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const viewport = page.getViewport(1);
      const lines = getTextLines(content.items || []);
      const caption = lines.find((line) => /(?:^|\b)(?:fig\.?|figure)\s*1\s*[:.]/i.test(line.text));

      if (caption) {
        return {
          pageNumber,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
          caption
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function getTextLines(items) {
  const lines = [];

  for (const item of items) {
    const text = cleanText(item.str);

    if (!text) {
      continue;
    }

    const x = item.transform?.[4] || 0;
    const y = item.transform?.[5] || 0;
    const width = item.width || text.length * 5;
    const height = Math.abs(item.height || item.transform?.[3] || 10);
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 4);

    if (!line) {
      line = { y, xMin: x, xMax: x + width, height, parts: [] };
      lines.push(line);
    }

    line.xMin = Math.min(line.xMin, x);
    line.xMax = Math.max(line.xMax, x + width);
    line.height = Math.max(line.height, height);
    line.parts.push({ x, width, text });
  }

  return lines
    .flatMap(splitLineByColumnGap)
    .sort((a, b) => b.y - a.y);
}

function splitLineByColumnGap(line) {
  const sortedParts = line.parts.sort((a, b) => a.x - b.x);
  const segments = [];
  let current = [];
  let currentXMin = Infinity;
  let currentXMax = -Infinity;
  let previousXMax = null;

  for (const part of sortedParts) {
    const gap = previousXMax === null ? 0 : part.x - previousXMax;

    if (current.length && gap > 18) {
      segments.push(createTextLineSegment(line, current, currentXMin, currentXMax));
      current = [];
      currentXMin = Infinity;
      currentXMax = -Infinity;
    }

    current.push(part);
    currentXMin = Math.min(currentXMin, part.x);
    currentXMax = Math.max(currentXMax, part.x + part.width);
    previousXMax = part.x + part.width;
  }

  if (current.length) {
    segments.push(createTextLineSegment(line, current, currentXMin, currentXMax));
  }

  return segments;
}

function createTextLineSegment(line, parts, xMin, xMax) {
  return {
    y: line.y,
    xMin,
    xMax,
    height: line.height,
    text: parts
      .map((part) => part.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  };
}

function getFigureCropRect(region, image) {
  const imageSize = image.getSize();
  const scaleX = imageSize.width / region.pageWidth;
  const scaleY = imageSize.height / region.pageHeight;
  const captionCenterX = ((region.caption.xMin + region.caption.xMax) / 2) * scaleX;
  const captionWidth = (region.caption.xMax - region.caption.xMin) * scaleX;
  const isColumnFigure = captionWidth < imageSize.width * 0.52;
  const marginX = Math.round(imageSize.width * 0.06);
  const columnGap = Math.round(imageSize.width * 0.025);
  let x = marginX;
  let width = imageSize.width - marginX * 2;

  if (isColumnFigure) {
    const midpoint = imageSize.width / 2;

    if (captionCenterX < midpoint) {
      x = marginX;
      width = Math.max(80, Math.round(midpoint - marginX - columnGap));
    } else {
      x = Math.round(midpoint + columnGap);
      width = Math.max(80, imageSize.width - x - marginX);
    }
  }

  const captionTop = Math.max(0, Math.round((region.pageHeight - (region.caption.y + region.caption.height)) * scaleY));
  const figureBottom = Math.max(0, captionTop - Math.round(imageSize.height * 0.018));
  const preferredHeight = Math.round(imageSize.height * 0.34);
  const fallbackRect = constrainRect({
    x: Math.max(0, Math.min(x, imageSize.width - 1)),
    y: Math.max(Math.round(imageSize.height * 0.05), figureBottom - preferredHeight),
    width,
    height: preferredHeight
  }, imageSize);

  return detectFigureInkRect(image, {
    ...fallbackRect,
    height: Math.max(80, figureBottom - fallbackRect.y)
  }) || fallbackRect;
}

function shouldRefreshFigureThumbnail(value) {
  return Boolean(value && /-figure1(?:-v[23456])?\.png$/.test(path.basename(value)));
}

function shouldRefreshPageSnapshot(value) {
  return Boolean(value && !/-page1-v2\.png$/.test(path.basename(value)));
}

function detectPageContentRect(image) {
  const imageSize = image.getSize();
  const bitmap = image.toBitmap();
  const minRowInk = Math.max(8, Math.floor(imageSize.width * 0.006));
  const minColumnInk = Math.max(8, Math.floor(imageSize.height * 0.006));
  let top = imageSize.height;
  let bottom = 0;
  let left = imageSize.width;
  let right = 0;

  for (let y = 0; y < imageSize.height; y += 1) {
    if (countRowInk(bitmap, imageSize, 0, y, imageSize.width) >= minRowInk) {
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  for (let x = 0; x < imageSize.width; x += 1) {
    if (countColumnInk(bitmap, imageSize, x, 0, imageSize.height) >= minColumnInk) {
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }

  if (right - left < 80 || bottom - top < 120) {
    return null;
  }

  const horizontalPad = Math.max(34, Math.round((right - left) * 0.08));
  const verticalPad = Math.max(34, Math.round((bottom - top) * 0.06));

  return constrainRect({
    x: left - horizontalPad,
    y: top - verticalPad,
    width: right - left + horizontalPad * 2,
    height: bottom - top + verticalPad * 2
  }, imageSize);
}

function detectFigureInkRect(image, searchRect) {
  const imageSize = image.getSize();
  const bitmap = image.toBitmap();
  const rect = constrainRect(searchRect, imageSize);
  const minRowInk = Math.max(8, Math.floor(rect.width * 0.012));
  const maxGap = Math.max(20, Math.floor(imageSize.height * 0.024));
  let seen = false;
  let top = rect.y + rect.height - 1;
  let bottom = top;
  let gap = 0;

  for (let y = rect.y + rect.height - 1; y >= rect.y; y -= 1) {
    const active = countRowInk(bitmap, imageSize, rect.x, y, rect.width) >= minRowInk;

    if (active) {
      if (!seen) {
        bottom = y;
      }

      top = y;
      gap = 0;
      seen = true;
      continue;
    }

    if (seen) {
      gap += 1;

      if (gap > maxGap) {
        top = Math.min(bottom, top + gap);
        break;
      }
    }
  }

  if (!seen || bottom - top < 42) {
    return null;
  }

  const verticalPadding = 10;
  const yMin = Math.max(rect.y, top - verticalPadding);
  const yMax = Math.min(rect.y + rect.height - 1, bottom + verticalPadding);
  const minColumnInk = Math.max(4, Math.floor((yMax - yMin) * 0.01));
  let left = rect.x + rect.width - 1;
  let right = rect.x;

  for (let x = rect.x; x < rect.x + rect.width; x += 1) {
    if (countColumnInk(bitmap, imageSize, x, yMin, yMax - yMin + 1) >= minColumnInk) {
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }

  if (right - left < 42) {
    return null;
  }

  const horizontalPadding = 12;

  return constrainRect({
    x: left - horizontalPadding,
    y: yMin,
    width: right - left + horizontalPadding * 2,
    height: yMax - yMin + 1
  }, imageSize);
}

function countRowInk(bitmap, imageSize, startX, y, width) {
  let count = 0;
  const step = Math.max(1, Math.floor(width / 420));

  for (let x = startX; x < startX + width; x += step) {
    if (isInkPixel(bitmap, imageSize, x, y)) {
      count += 1;
    }
  }

  return count;
}

function countColumnInk(bitmap, imageSize, x, startY, height) {
  let count = 0;
  const step = Math.max(1, Math.floor(height / 420));

  for (let y = startY; y < startY + height; y += step) {
    if (isInkPixel(bitmap, imageSize, x, y)) {
      count += 1;
    }
  }

  return count;
}

function isInkPixel(bitmap, imageSize, x, y) {
  const safeX = Math.max(0, Math.min(imageSize.width - 1, Math.round(x)));
  const safeY = Math.max(0, Math.min(imageSize.height - 1, Math.round(y)));
  const index = (safeY * imageSize.width + safeX) * 4;
  const blue = bitmap[index];
  const green = bitmap[index + 1];
  const red = bitmap[index + 2];
  const alpha = bitmap[index + 3];

  if (alpha < 24) {
    return false;
  }

  const whiteDistance = Math.abs(255 - red) + Math.abs(255 - green) + Math.abs(255 - blue);
  return whiteDistance > 38;
}

function constrainRect(rect, imageSize) {
  const x = Math.max(0, Math.min(Math.round(rect.x), imageSize.width - 1));
  const y = Math.max(0, Math.min(Math.round(rect.y), imageSize.height - 1));
  const width = Math.max(1, Math.min(Math.round(rect.width), imageSize.width - x));
  const height = Math.max(1, Math.min(Math.round(rect.height), imageSize.height - y));

  return { x, y, width, height };
}

async function findExecutable(name, candidates = []) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Keep looking.
    }
  }

  return name;
}

async function extractPdfMetadata(filePath, filenameHint = '') {
  const buffer = await fs.readFile(filePath);
  const head = buffer.subarray(0, Math.min(buffer.length, 1024 * 1024)).toString('latin1');
  const filenameTitle = titleFromFile(filePath);
  let parsed = {};

  try {
    parsed = await pdfParse(buffer, { max: 1 });
  } catch {
    parsed = {};
  }

  const textMetadata = extractMetadataFromText(parsed.text || '');
  const title =
    textMetadata.title ||
    cleanText(parsed.info?.Title) ||
    decodePdfValue(findPdfInfoValue(head, 'Title')) ||
    decodeXmpValue(head, 'dc:title') ||
    filenameTitle;
  const authors =
    textMetadata.authors ||
    cleanText(parsed.info?.Author) ||
    decodePdfValue(findPdfInfoValue(head, 'Author')) ||
    decodeXmpCreators(head);

  return {
    title,
    authors,
    institutions: textMetadata.institutions,
    abstract: textMetadata.abstract,
    year: textMetadata.year,
    venue: textMetadata.venue,
    tags: []
  };
}

function mergeExtractedMetadata(paper, metadata) {
  const update = {};
  const existingLooksLikeFilename = paper.title && /^[a-z0-9_. -]{4,40}$/i.test(paper.title) && !paper.authors;

  if (metadata.title && (!paper.title || paper.title === 'Untitled paper' || existingLooksLikeFilename || looksTitleContainsAuthor(paper.title, metadata.authors))) {
    update.title = metadata.title;
  }

  if (metadata.authors && (!paper.authors || looksContaminatedAuthors(paper.authors) || looksSupersetAuthors(paper.authors, metadata.authors) || hasMoreAuthors(metadata.authors, paper.authors))) {
    update.authors = metadata.authors;
  }

  if (metadata.institutions && (!paper.institutions || looksContaminatedInstitutions(paper.institutions))) {
    update.institutions = metadata.institutions;
  }

  if (metadata.abstract && !paper.abstract) {
    update.abstract = metadata.abstract;
  }

  for (const field of ['venue', 'year']) {
    if (metadata[field] && !paper[field]) {
      update[field] = metadata[field];
    }
  }

  if (!metadata.year && looksAutoExtractedYear(paper.year)) {
    update.year = '';
  }

  if (!metadata.venue && paper.venue && looksAutoExtractedVenueTag(paper)) {
    update.venue = '';
    update.tags = (paper.tags || []).filter((tag) => tag.toLowerCase() !== paper.venue.toLowerCase());
  }

  return update;
}

function shouldEnrichPaper(paper) {
  return !paper.authors || !paper.institutions || !paper.venue || !paper.year || !paper.abstract || paper.title === 'Untitled paper' || /^[a-z0-9_. -]{4,40}$/i.test(paper.title) || looksContaminatedAuthors(paper.authors) || looksContaminatedInstitutions(paper.institutions);
}

function extractMetadataFromText(text) {
  const normalized = String(text || '')
    .replace(/[\u2217\u2020\u2021]/g, '')
    .replace(/\r/g, '\n');
  const abstractIndex = normalized.search(/(^|\n)\s*abstract\s*($|\n|[\u2014:-])/i);
  const frontMatter = (abstractIndex > 0 ? normalized.slice(0, abstractIndex) : normalized.slice(0, 2400))
    .split('\n')
    .map(cleanText)
    .filter(Boolean)
    .filter((line) => !/^[,;]+$/.test(line))
    .filter((line) => !/^\d+$/.test(line));
  const titleEnd = findTitleEnd(frontMatter);
  const titleLines = frontMatter.slice(0, titleEnd).slice(0, 4);
  const bylineLines = frontMatter.slice(titleEnd);
  const authors = [];
  const institutions = [];

  for (const line of bylineLines) {
    const cleaned = cleanBylineLine(line);

    if (!cleaned || isBylineMarker(cleaned)) {
      continue;
    }

    if (looksLikeAffiliation(cleaned)) {
      institutions.push(...cleanInstitutionLine(cleaned));
      continue;
    }

    if (looksLikeAuthorLine(cleaned)) {
      authors.push(...splitAuthorLine(cleaned));
    }
  }

  const explicitVenueYear = inferVenueYearFromFrontMatter(frontMatter.join(' '));
  const abstract = extractAbstractFromText(normalized);

  return {
    title: cleanText(titleLines.join(' ')),
    authors: cleanAuthors(authors.join(', ')),
    institutions: uniqueClean(institutions).join(', '),
    abstract,
    venue: explicitVenueYear.venue,
    year: explicitVenueYear.year
  };
}

function extractAbstractFromText(text) {
  const normalized = String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  const match = normalized.match(/(?:^|\n)\s*abstract\s*(?:[\u2014:-]\s*|\n)([\s\S]{120,4000}?)(?=\n\s*(?:1\.?\s+)?(?:introduction|keywords?|index terms|background|related work|i\.?\s+introduction)\b|\n\s*[A-Z][A-Z\s]{6,}\n|$)/i);

  if (!match) {
    return '';
  }

  return cleanText(match[1])
    .replace(/^abstract\s*/i, '')
    .slice(0, 2000)
    .trim();
}

function findTitleEnd(lines) {
  for (let index = 1; index < Math.min(lines.length, 8); index += 1) {
    const line = cleanBylineLine(lines[index]);
    const next = cleanBylineLine(lines[index + 1] || '');

    if (!looksLikeAuthorLine(line)) {
      continue;
    }

    if (index === 1 && line.length < 32 && looksLikeAuthorLine(next) && !looksLikeAffiliation(next)) {
      continue;
    }

    return index;
  }

  return Math.min(1, lines.length);
}

function cleanBylineLine(value) {
  return cleanText(value)
    .replace(/[*\u2217\u2020\u2021\u00a7]+/g, ' ')
    .replace(/^[,;\s]+|[,;\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBylineMarker(value) {
  return !value || /^[,;*\d\s]+$/.test(value);
}

function looksLikeAuthorLine(line) {
  if (!line || looksLikeAffiliation(line) || line.includes('@') || /:/.test(line)) {
    return false;
  }

  const parts = splitAuthorLine(line);
  return parts.length > 0 && parts.every(looksLikePersonName);
}

function splitAuthorLine(line) {
  return cleanBylineLine(line)
    .replace(/^\s*and\s+/i, '')
    .replace(/\s+and\s+/gi, ', ')
    .split(/\s*,\s*/)
    .map(cleanBylineLine)
    .filter(Boolean);
}

function looksLikePersonName(value) {
  const words = value.split(/\s+/).filter(Boolean);

  if (words.length < 2 || words.length > 5) {
    return false;
  }

  return words.every((word) => /^[A-Z][A-Za-z.'-]*$/.test(word));
}

function looksLikeAffiliation(line) {
  return /university|institute|department|school of|computer science|laborator|college|kaist|virginia tech|tsinghua|zhongguancun|@/i.test(line);
}

function cleanInstitutionLine(value) {
  const line = cleanText(value);

  if (!line || line.includes('@')) {
    return [];
  }

  const parts = line
    .split(/\s*,\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter(looksLikeInstitutionName);

  if (parts.length) {
    return uniqueClean(parts);
  }

  return looksLikeInstitutionName(line) ? [line] : [];
}

function looksLikeInstitutionName(value) {
  const text = cleanText(value);
  const lower = text.toLowerCase();

  if (!text || /@/.test(text)) {
    return false;
  }

  if (/^(computer science|department|school|college of|los angeles|tucson|usa|united states)$/i.test(text)) {
    return false;
  }

  return /university|institute|laborator|college|tech/i.test(text) || /^[A-Z]{2,8}$/.test(text);
}

function cleanAuthors(value) {
  return uniqueClean(
    cleanText(value)
      .replace(/[\u2217\u2020\u2021\u00a7]+/g, '')
      .split(/\s*,\s*/)
  )
    .join(', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+and\s+/gi, ' and ')
    .replace(/^,\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueClean(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const cleaned = cleanText(value);
    const key = cleaned.toLowerCase();

    if (!cleaned || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function looksContaminatedAuthors(value) {
  return /university|institute|department|school of|computer science|laborator|college|kaist|virginia tech|tsinghua|zhongguancun|[\u2020\u2021\u00a7]/i.test(value || '');
}

function looksContaminatedInstitutions(value) {
  return /@|computer science|department|school of|\busa\b|los angeles|tucson/i.test(value || '');
}

function looksSupersetAuthors(currentAuthors, extractedAuthors) {
  const current = cleanAuthors(currentAuthors);
  const extracted = cleanAuthors(extractedAuthors);

  return Boolean(current && extracted && current !== extracted && current.startsWith(extracted));
}

function hasMoreAuthors(extractedAuthors, currentAuthors) {
  const extracted = cleanAuthors(extractedAuthors).split(',').filter(Boolean);
  const current = cleanAuthors(currentAuthors).split(',').filter(Boolean);

  return extracted.length > current.length && current.every((author) => extracted.includes(author));
}

function looksTitleContainsAuthor(title, authors) {
  const firstAuthor = cleanAuthors(authors).split(',')[0]?.trim();

  return Boolean(firstAuthor && title.endsWith(` ${firstAuthor}`));
}

function looksAutoExtractedYear(value) {
  const year = Number(value);
  const currentYear = new Date().getFullYear();

  return Number.isInteger(year) && (year < 1990 || year > currentYear + 1);
}

function looksAutoExtractedVenueTag(paper) {
  const venue = String(paper.venue || '').toLowerCase();
  return Boolean(venue) && (paper.tags || []).some((tag) => String(tag).toLowerCase() === venue);
}

function inferVenueYearFromFrontMatter(value) {
  const text = String(value || '');
  const venue = inferVenue(text);

  if (!venue) {
    return { venue: '', year: '' };
  }

  const venueIndex = text.toLowerCase().search(new RegExp(`\\b${venue.toLowerCase()}\\b`));
  const nearby = venueIndex >= 0 ? text.slice(Math.max(0, venueIndex - 80), venueIndex + 100) : '';
  const year = inferYear(nearby);

  return { venue, year };
}

function findPdfInfoValue(raw, key) {
  const hexPattern = new RegExp(`/${key}\\s*<([0-9a-fA-F\\s]+)>`);
  const textPattern = new RegExp(`/${key}\\s*\\(([^)]*)\\)`);
  const hexMatch = raw.match(hexPattern);
  const textMatch = raw.match(textPattern);

  if (hexMatch) {
    return { type: 'hex', value: hexMatch[1] };
  }

  if (textMatch) {
    return { type: 'text', value: textMatch[1] };
  }

  return null;
}

function decodePdfValue(match) {
  if (!match) {
    return '';
  }

  if (match.type === 'hex') {
    const compact = match.value.replace(/\s+/g, '');
    const buffer = Buffer.from(compact, 'hex');
    const decoded = compact.startsWith('feff') ? buffer.subarray(2).toString('utf16le') : buffer.toString('utf8');
    return cleanText(decoded);
  }

  return cleanText(match.value.replace(/\\([()\\])/g, '$1'));
}

function decodeXmpValue(raw, tag) {
  const tagPattern = tag.replace(':', '\\:');
  const match = raw.match(new RegExp(`<${tagPattern}[^>]*>[\\s\\S]*?<rdf:li[^>]*>([\\s\\S]*?)<\\/rdf:li>`, 'i'));
  return match ? cleanText(match[1]) : '';
}

function decodeXmpCreators(raw) {
  const match = raw.match(/<dc:creator[^>]*>[\s\S]*?<rdf:Seq[^>]*>([\s\S]*?)<\/rdf:Seq>/i);

  if (!match) {
    return '';
  }

  return [...match[1].matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/gi)]
    .map((item) => cleanText(item[1]))
    .filter(Boolean)
    .join(', ');
}

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferYear(value) {
  const match = String(value).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : '';
}

function inferVenue(value) {
  const venues = ['USENIX', 'ICNP', 'NeurIPS', 'ICML', 'ICLR', 'CVPR', 'SOSP', 'OSDI', 'CHI', 'ACL', 'EMNLP', 'SIGCOMM'];
  const text = String(value);
  return venues.find((venue) => new RegExp(`\\b${venue}\\b`, 'i').test(text)) || '';
}

function inferCompactConferenceYear(value) {
  const match = String(value).match(/\b(usenix|icnp|neurips|icml|iclr|cvpr|sosp|osdi|chi|acl|emnlp|sigcomm)[-_ ]?(\d{2})\b/i);

  if (!match) {
    return { venue: '', year: '' };
  }

  return {
    venue: match[1].toUpperCase(),
    year: `20${match[2]}`
  };
}

function getStarterBuckets() {
  return [
    { id: 'usenix-reviews', name: 'USENIX Reviews', category: 'active', color: '#526f96', createdAt: new Date().toISOString() },
    { id: 'ml-foundations', name: 'ML Foundations', category: 'active', color: '#4e6f86', createdAt: new Date().toISOString() },
    { id: 'general', name: 'General Reading', category: 'active', color: '#6b5b7d', createdAt: new Date().toISOString() }
  ];
}

function getStarterPapers() {
  const now = new Date().toISOString();

  return [
    {
      id: createId(),
      title: 'Attention Is All You Need',
      authors: 'Vaswani et al.',
      venue: 'NeurIPS',
      year: '2017',
      tags: ['transformers', 'foundations'],
      status: 'reading',
      priority: 'high',
      bucketId: 'ml-foundations',
      deadline: '2026-09-04',
      rating: 0,
      localPath: '',
      notes: 'Skim architecture diagrams, then write a concise note on positional encoding.',
      addedAt: now,
      updatedAt: now,
      lastOpenedAt: '',
      finishedAt: ''
    },
    {
      id: createId(),
      title: 'Deep Residual Learning for Image Recognition',
      authors: 'He, Zhang, Ren, Sun',
      venue: 'CVPR',
      year: '2016',
      tags: ['vision', 'architecture'],
      status: 'read',
      priority: 'normal',
      bucketId: 'ml-foundations',
      deadline: '',
      rating: 4,
      localPath: '',
      notes: 'Capture why skip connections helped optimization, not just representational depth.',
      addedAt: now,
      updatedAt: now,
      lastOpenedAt: '',
      finishedAt: ''
    },
    {
      id: createId(),
      title: 'Denoising Diffusion Probabilistic Models',
      authors: 'Ho, Jain, Abbeel',
      venue: 'NeurIPS',
      year: '2020',
      tags: ['generative models', 'diffusion'],
      status: 'to-read',
      priority: 'high',
      bucketId: 'ml-foundations',
      deadline: '2026-09-12',
      rating: 0,
      localPath: '',
      notes: '',
      addedAt: now,
      updatedAt: now,
      lastOpenedAt: '',
      finishedAt: ''
    }
  ];
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    title: 'Paper Tracker',
    backgroundColor: '#f6f5f1',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  await migrateLegacyStoreIfNeeded();
  await ensureStore();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('library:get', async () => {
  return readLibrary();
});

ipcMain.handle('paper:create', async (_event, input) => {
  const library = await readLibrary();
  const paper = normalizePaper(input);
  library.papers.unshift(paper);
  await writeLibrary(library);
  return paper;
});

ipcMain.handle('paper:importPdf', async (_event, bucketId) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add paper',
    properties: ['openFile'],
    filters: [{ name: 'PDF files', extensions: ['pdf'] }]
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  const library = await readLibrary();
  const id = createId();
  const localPath = await copyPaperIntoLibrary(result.filePaths[0], id);
  const metadata = await extractPdfMetadata(result.filePaths[0]);
  const pageSnapshotPath = await createPdfPageSnapshot(localPath, id);
  const thumbnailPath = await createFigureOneThumbnail(localPath, id);
  const paper = normalizePaper({
    id,
    ...metadata,
    localPath,
    pageSnapshotPath,
    thumbnailPath,
    sourceFilename: path.basename(result.filePaths[0]),
    status: 'to-read',
    bucketId: library.buckets.some((bucket) => bucket.id === bucketId) ? bucketId : library.buckets[0]?.id || 'general'
  });

  library.papers.unshift(paper);
  await writeLibrary(library);
  return paper;
});

ipcMain.handle('paper:importPdfPath', async (_event, filePath, bucketId) => {
  if (!filePath || path.extname(filePath).toLowerCase() !== '.pdf') {
    return null;
  }

  const library = await readLibrary();
  const id = createId();
  const localPath = await copyPaperIntoLibrary(filePath, id);
  const metadata = await extractPdfMetadata(filePath);
  const pageSnapshotPath = await createPdfPageSnapshot(localPath, id);
  const thumbnailPath = await createFigureOneThumbnail(localPath, id);
  const paper = normalizePaper({
    id,
    ...metadata,
    localPath,
    pageSnapshotPath,
    thumbnailPath,
    sourceFilename: path.basename(filePath),
    status: 'to-read',
    bucketId: library.buckets.some((bucket) => bucket.id === bucketId) ? bucketId : library.buckets[0]?.id || 'general'
  });

  library.papers.unshift(paper);
  await writeLibrary(library);
  return paper;
});

ipcMain.handle('paper:update', async (_event, id, patch) => {
  const library = await readLibrary();
  const index = library.papers.findIndex((paper) => paper.id === id);

  if (index === -1) {
    throw new Error(`Paper not found: ${id}`);
  }

  const updated = normalizePaper(patch, library.papers[index]);
  library.papers[index] = updated;
  await writeLibrary(library);
  return updated;
});

ipcMain.handle('bucket:create', async (_event, input) => {
  const library = await readLibrary();
  const existingIds = new Set(library.buckets.map((bucket) => bucket.id));
  const bucket = normalizeBucket(input);
  let suffix = 2;

  while (existingIds.has(bucket.id)) {
    bucket.id = `${slugify(bucket.name)}-${suffix}`;
    suffix += 1;
  }

  library.buckets.push(bucket);
  await writeLibrary(library);
  return bucket;
});

ipcMain.handle('bucket:update', async (_event, id, patch) => {
  const library = await readLibrary();
  const index = library.buckets.findIndex((bucket) => bucket.id === id);

  if (index === -1) {
    throw new Error(`Binder not found: ${id}`);
  }

  library.buckets[index] = normalizeBucket({ ...library.buckets[index], ...patch, id });
  await writeLibrary(library);
  return library.buckets[index];
});

ipcMain.handle('bucket:reorder', async (_event, orderedIds) => {
  const library = await readLibrary();
  const order = Array.isArray(orderedIds) ? orderedIds : [];
  const byId = new Map(library.buckets.map((bucket) => [bucket.id, bucket]));
  const reordered = order.map((id) => byId.get(id)).filter(Boolean);
  const remaining = library.buckets.filter((bucket) => !order.includes(bucket.id));

  library.buckets = [...reordered, ...remaining];
  await writeLibrary(library);
  return library.buckets;
});

ipcMain.handle('bucket:delete', async (_event, id) => {
  const library = await readLibrary();
  const target = library.buckets.find((bucket) => bucket.id === id);

  if (!target || library.buckets.length <= 1) {
    return { deleted: false, fallbackBucketId: '', papersMoved: 0, buckets: library.buckets, papers: library.papers };
  }

  const remainingBuckets = library.buckets.filter((bucket) => bucket.id !== id);
  const fallbackBucketId = remainingBuckets[0].id;
  let papersMoved = 0;

  library.papers = library.papers.map((paper) => {
    if (paper.bucketId !== id) {
      return paper;
    }

    papersMoved += 1;
    return normalizePaper({ ...paper, bucketId: fallbackBucketId }, paper);
  });
  library.buckets = remainingBuckets;
  await writeLibrary(library);

  return { deleted: true, fallbackBucketId, papersMoved, buckets: library.buckets, papers: library.papers };
});

ipcMain.handle('paper:delete', async (_event, id) => {
  const library = await readLibrary();
  const target = library.papers.find((paper) => paper.id === id);
  library.papers = library.papers.filter((paper) => paper.id !== id);
  await writeLibrary(library);

  if (target?.thumbnailPath) {
    await fs.unlink(target.thumbnailPath).catch(() => {});
  }

  if (target?.pageSnapshotPath && target.pageSnapshotPath !== target.thumbnailPath) {
    await fs.unlink(target.pageSnapshotPath).catch(() => {});
  }

  return { deleted: Boolean(target) };
});

ipcMain.handle('paper:openPdf', async (_event, id) => {
  const library = await readLibrary();
  const paper = library.papers.find((item) => item.id === id);

  if (!paper || !paper.localPath) {
    return { opened: false };
  }

  await shell.openPath(paper.localPath);
  paper.lastOpenedAt = new Date().toISOString();
  paper.updatedAt = paper.lastOpenedAt;
  await writeLibrary(library);

  return { opened: true };
});
