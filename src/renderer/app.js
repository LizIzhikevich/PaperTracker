const statusLabels = {
  'to-read': 'To Read',
  reading: 'Reading',
  read: 'Read'
};

const statusOrder = ['to-read', 'reading', 'read'];
const allReadTab = { id: 'all', label: 'All' };
const createsFields = [
  {
    id: 'claim',
    label: 'Claim',
    prompt: 'What is the paper saying or arguing?'
  },
  {
    id: 'reasoning',
    label: 'Reasoning',
    prompt: 'Why do the authors think this is true?'
  },
  {
    id: 'evidence',
    label: 'Evidence',
    prompt: 'What data, proof, evaluation, or examples support it?'
  },
  {
    id: 'assumptions',
    label: 'Assumptions',
    prompt: 'What has to be true for this to hold?'
  },
  {
    id: 'threats',
    label: 'Threats',
    prompt: 'What could break the claim or limit it?'
  },
  {
    id: 'extensions',
    label: 'Extensions',
    prompt: 'What could I build, test, compare, or ask next?'
  }
];
const priorityScore = { high: 2, normal: 1 };
const defaultBucketId = 'general';
const binderColors = [
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
const paperDragType = 'application/x-paper-tracker-paper';
const binderDragType = 'application/x-paper-tracker-binder';

const state = {
  buckets: [],
  papers: [],
  selectedId: '',
  selectedBucketId: 'library',
  readTab: 'all',
  query: '',
  contextMenu: null,
  isCreatingBinder: false,
  renamingBucketId: '',
  coloringBucketId: '',
  updateStatus: {
    currentVersion: '',
    latestVersion: '',
    hasUpdate: false,
    checking: false,
    checked: false,
    error: '',
    releaseUrl: '',
    downloadUrl: '',
    assetName: ''
  }
};

const app = document.querySelector('#app');
const paperApi = window.paperTracker || createBrowserPaperApi();

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pathToFileUrl(value) {
  const filePath = String(value || '').trim();

  if (!filePath) {
    return '';
  }

  if (filePath.startsWith('file://')) {
    return filePath;
  }

  const normalized = filePath.replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${encodeURI(withLeadingSlash)}`;
}

function formatDate(value) {
  if (!value) {
    return 'No date';
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function getDaysUntil(value) {
  if (!value) {
    return null;
  }

  const today = new Date();
  const deadline = new Date(`${value}T00:00:00`);
  today.setHours(0, 0, 0, 0);

  if (Number.isNaN(deadline.getTime())) {
    return null;
  }

  return Math.ceil((deadline - today) / 86400000);
}

function getPaperUrgency(paper) {
  const days = getDaysUntil(paper.deadline);

  if (days !== null && days <= 3 && paper.status !== 'read') {
    return 'urgent';
  }

  if (paper.priority === 'high') {
    return 'focused';
  }

  return 'steady';
}

function sortPapers(papers) {
  return [...papers].sort((a, b) => {
    const deadlineA = getDeadlineTime(a.deadline) ?? Infinity;
    const deadlineB = getDeadlineTime(b.deadline) ?? Infinity;
    return deadlineA - deadlineB || priorityScore[b.priority] - priorityScore[a.priority] || a.title.localeCompare(b.title);
  });
}

function getDeadlineTime(value) {
  if (!value) {
    return null;
  }

  const deadline = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(deadline) ? null : deadline;
}

function getCurrentBucket() {
  if (state.selectedBucketId === 'library') {
    return { id: 'library', name: 'Library' };
  }

  return state.buckets.find((bucket) => bucket.id === state.selectedBucketId) || state.buckets[0] || { id: defaultBucketId, name: 'General Reading' };
}

function getVisiblePapers() {
  const query = state.query.trim().toLowerCase();

  return sortPapers(state.papers).filter((paper) => {
    const matchesBucket = state.selectedBucketId === 'library' || paper.bucketId === state.selectedBucketId;
    const createsText = createsFields.map((field) => paper.creates?.[field.id] || '').join(' ');
    const haystack = [paper.title, paper.authors, paper.institutions, paper.venue, paper.year, paper.abstract, paper.notes, createsText, paper.tags.join(' ')]
      .join(' ')
      .toLowerCase();

    return matchesBucket && (!query || haystack.includes(query));
  });
}

function getSelectedPaper() {
  return state.papers.find((paper) => paper.id === state.selectedId) || null;
}

function getBucketCount(bucketId) {
  if (bucketId === 'library') {
    return state.papers.length;
  }

  return state.papers.filter((paper) => paper.bucketId === bucketId).length;
}

function getAllTags() {
  return [...new Set(state.papers.flatMap((paper) => paper.tags || []))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function getBinderColor(bucketId) {
  const bucket = state.buckets.find((item) => item.id === bucketId);
  return normalizeColor(bucket?.color) || getDefaultBinderColor(bucketId);
}

function getBucketCategory(bucket) {
  return bucket?.category === 'archived' ? 'archived' : 'active';
}

function getBucketReadTabs(bucket) {
  return normalizeReadTabs(bucket?.readTabs);
}

function normalizeBucket(input = {}) {
  const now = new Date().toISOString();
  const id = input.id || slugify(input.name || 'binder');

  return {
    id,
    name: String(input.name || 'New Binder').trim(),
    category: getBucketCategory(input),
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
  return binderColors.includes(normalized) ? normalized : '';
}

function getDefaultBinderColor(value) {
  const key = String(value || 'binder');
  const hash = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return binderColors[hash % binderColors.length];
}

function getBucketSummary(bucket) {
  const papers = state.papers.filter((paper) => paper.bucketId === bucket.id);

  return {
    bucket,
    total: papers.length,
    toRead: papers.filter((paper) => paper.status === 'to-read').length,
    reading: papers.filter((paper) => paper.status === 'reading').length,
    read: papers.filter((paper) => paper.status === 'read').length
  };
}

function rollupSummaries(summaries) {
  return {
    total: summaries.reduce((sum, item) => sum + item.total, 0),
    toRead: summaries.reduce((sum, item) => sum + item.toRead, 0),
    reading: summaries.reduce((sum, item) => sum + item.reading, 0),
    read: summaries.reduce((sum, item) => sum + item.read, 0)
  };
}

function getLibrarySummary() {
  const summaries = state.buckets.map(getBucketSummary);
  const active = summaries.filter((item) => getBucketCategory(item.bucket) === 'active');
  const archived = summaries.filter((item) => getBucketCategory(item.bucket) === 'archived');

  return {
    total: state.papers.length,
    toRead: summaries.reduce((sum, item) => sum + item.toRead, 0),
    reading: summaries.reduce((sum, item) => sum + item.reading, 0),
    read: summaries.reduce((sum, item) => sum + item.read, 0),
    active,
    archived,
    activeTotals: rollupSummaries(active),
    archivedTotals: rollupSummaries(archived),
    summaries
  };
}

function getRecommendedPaper() {
  const toReadPapers = state.papers.filter((paper) => paper.status === 'to-read');
  const withDeadlines = toReadPapers.filter((paper) => getDeadlineTime(paper.deadline) !== null);

  if (withDeadlines.length) {
    return sortPapers(withDeadlines)[0];
  }

  if (!toReadPapers.length) {
    return null;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const index =
    [...todayKey].reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    toReadPapers.length;

  return sortPapers(toReadPapers)[index];
}

function getBucketName(bucketId) {
  return state.buckets.find((bucket) => bucket.id === bucketId)?.name || 'Library';
}

function getActivityDays() {
  const days = [];
  const today = new Date();

  for (let index = 83; index >= 0; index -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - index);
    const key = day.toISOString().slice(0, 10);
    const readPapers = state.papers.filter((paper) => paper.status === 'read' && paper.finishedAt?.slice(0, 10) === key);
    const count = readPapers.length;

    days.push({
      key,
      count,
      label: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      level: getActivityLevel(count)
    });
  }

  return days;
}

function getActivityLevel(count) {
  if (count >= 4) {
    return 4;
  }

  if (count >= 3) {
    return 3;
  }

  if (count >= 2) {
    return 2;
  }

  return count >= 1 ? 1 : 0;
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `paper-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || createId();
}

function getStarterBuckets() {
  const now = new Date().toISOString();

  return [
    { id: 'usenix-reviews', name: 'USENIX Reviews', category: 'active', color: '#526f96', createdAt: now },
    { id: 'ml-foundations', name: 'ML Foundations', category: 'active', color: '#4e6f86', createdAt: now },
    { id: defaultBucketId, name: 'General Reading', category: 'active', color: '#6b5b7d', createdAt: now }
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
  const status = statusLabels[input.status] ? input.status : statusLabels[existing.status] ? existing.status : 'to-read';
  const priority = normalizePriority(input.priority || existing.priority);
  const rating = Number(input.rating || existing.rating || 0);

  return {
    id: existing.id || input.id || createId(),
    title: String(input.title || existing.title || 'Untitled paper').trim(),
    authors: String(input.authors || existing.authors || '').trim(),
    institutions: String(input.institutions || existing.institutions || '').trim(),
    venue: String(input.venue || existing.venue || '').trim(),
    year: String(input.year || existing.year || '').trim(),
    tags: normalizeTags(input.tags === undefined ? existing.tags || [] : input.tags),
    status,
    priority,
    bucketId: String(input.bucketId || existing.bucketId || defaultBucketId),
    readTab: normalizeReadTab(input.readTab === undefined ? existing.readTab : input.readTab),
    deadline: String(input.deadline || existing.deadline || '').trim(),
    rating: Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0,
    localPath: String(input.localPath || existing.localPath || '').trim(),
    pageSnapshotPath: String(input.pageSnapshotPath || existing.pageSnapshotPath || '').trim(),
    thumbnailPath: String(input.thumbnailPath || existing.thumbnailPath || '').trim(),
    abstract: input.abstract === undefined ? String(existing.abstract || '').trim() : String(input.abstract || '').trim(),
    notes: String(input.notes || existing.notes || ''),
    creates: normalizeCreates(input.creates, existing.creates),
    addedAt: existing.addedAt || input.addedAt || now,
    updatedAt: now,
    lastOpenedAt: existing.lastOpenedAt || input.lastOpenedAt || '',
    finishedAt: status === 'read' ? existing.finishedAt || now : ''
  };
}

function normalizeCreates(input = {}, existing = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const previous = existing && typeof existing === 'object' ? existing : {};
  const creates = {
    enabled: source.enabled === undefined ? Boolean(previous.enabled) : Boolean(source.enabled)
  };

  for (const field of createsFields) {
    creates[field.id] = source[field.id] === undefined ? String(previous[field.id] || '') : String(source[field.id] || '');
  }

  return creates;
}

function normalizePriority(priority) {
  return priority === 'high' ? 'high' : 'normal';
}

function normalizeReadTab(value) {
  const text = String(value || '').trim();
  return text ? slugify(text) : '';
}

function createBrowserPaperApi() {
  const storageKey = 'paper-tracker-browser-library';

  function readLibrary() {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      const library = JSON.parse(stored);
      return migrateBrowserLibrary(library);
    }

    const library = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      buckets: getStarterBuckets(),
      papers: getStarterPapers()
    };
    writeLibrary(library);
    return library;
  }

  function writeLibrary(library) {
    window.localStorage.setItem(storageKey, JSON.stringify(library));
  }

  function migrateBrowserLibrary(library) {
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
      const migrated = normalizeBucket({
        ...bucket,
        category: bucket.category || inferBrowserBucketCategory(bucket.id, library.papers)
      });

      if (migrated.category !== bucket.category || migrated.name !== bucket.name || migrated.color !== bucket.color) {
        changed = true;
      }

      return migrated;
    });

    library.papers = library.papers.map((paper) => {
      const migrated = normalizePaper(
        {
          ...paper,
          status: migrateStatus(paper.status),
          bucketId: paper.bucketId || library.buckets[0]?.id || defaultBucketId
        },
        paper
      );

      if (migrated.status !== paper.status || migrated.priority !== paper.priority || migrated.bucketId !== paper.bucketId) {
        changed = true;
      }

      return migrated;
    });

    if (changed) {
      writeLibrary(library);
    }

    return library;
  }

  return {
    async getLibrary() {
      return readLibrary();
    },
    async createPaper(input) {
      const library = readLibrary();
      const paper = normalizePaper(input);
      library.papers.unshift(paper);
      writeLibrary(library);
      return paper;
    },
    async importPdf(bucketId) {
      return this.createPaper({
        title: 'Browser preview paper',
        status: 'to-read',
        priority: 'normal',
        bucketId: bucketId || state.buckets[0]?.id || defaultBucketId,
        notes: 'PDF importing works in the Electron app. This browser preview uses localStorage only.'
      });
    },
    async importPdfPath(_filePath, bucketId) {
      return this.importPdf(bucketId);
    },
    async updatePaper(id, patch) {
      const library = readLibrary();
      const index = library.papers.findIndex((paper) => paper.id === id);

      if (index === -1) {
        throw new Error(`Paper not found: ${id}`);
      }

      const updated = normalizePaper(patch, library.papers[index]);
      library.papers[index] = updated;
      writeLibrary(library);
      return updated;
    },
    async deletePaper(id) {
      const library = readLibrary();
      const target = library.papers.find((paper) => paper.id === id);
      library.papers = library.papers.filter((paper) => paper.id !== id);
      writeLibrary(library);
      return { deleted: Boolean(target) };
    },
    async openPdf() {
      return { opened: false };
    },
    async createBucket(input) {
      const library = readLibrary();
      const bucket = normalizeBucket(input);
      const existingIds = new Set(library.buckets.map((item) => item.id));
      let suffix = 2;

      while (existingIds.has(bucket.id)) {
        bucket.id = `${slugify(bucket.name)}-${suffix}`;
        suffix += 1;
      }

      library.buckets.push(bucket);
      writeLibrary(library);
      return bucket;
    },
    async updateBucket(id, patch) {
      const library = readLibrary();
      const index = library.buckets.findIndex((bucket) => bucket.id === id);

      if (index === -1) {
        throw new Error(`Binder not found: ${id}`);
      }

      library.buckets[index] = normalizeBucket({ ...library.buckets[index], ...patch, id });
      writeLibrary(library);
      return library.buckets[index];
    },
    async reorderBuckets(orderedIds) {
      const library = readLibrary();
      const byId = new Map(library.buckets.map((bucket) => [bucket.id, bucket]));
      const reordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
      const remaining = library.buckets.filter((bucket) => !orderedIds.includes(bucket.id));
      library.buckets = [...reordered, ...remaining];
      writeLibrary(library);
      return library.buckets;
    },
    async deleteBucket(id) {
      const library = readLibrary();
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
      writeLibrary(library);
      return { deleted: true, fallbackBucketId, papersMoved, buckets: library.buckets, papers: library.papers };
    },
    async getAppVersion() {
      return 'browser-preview';
    },
    async checkForUpdates() {
      return {
        currentVersion: 'browser-preview',
        latestVersion: '',
        hasUpdate: false,
        releaseUrl: 'https://github.com/LizIzhikevich/PaperTracker/releases/latest',
        downloadUrl: 'https://github.com/LizIzhikevich/PaperTracker/releases/latest',
        assetName: '',
        browserPreview: true
      };
    },
    async openUpdateUrl(url) {
      window.open(url || 'https://github.com/LizIzhikevich/PaperTracker/releases/latest', '_blank', 'noopener');
      return { opened: true };
    }
  };
}

function inferBrowserBucketCategory(bucketId, papers) {
  const bucketPapers = papers.filter((paper) => paper.bucketId === bucketId);

  if (bucketPapers.length && bucketPapers.every((paper) => migrateStatus(paper.status) === 'read')) {
    return 'archived';
  }

  return 'active';
}

function migrateStatus(status) {
  if (status === 'need-notes') {
    return 'reading';
  }

  if (status === 'skimmed') {
    return 'read';
  }

  return statusLabels[status] ? status : 'to-read';
}

function renderSidebar() {
  const summary = getLibrarySummary();

  return `
    <aside class="sidebar">
      <div class="window-spacer"></div>
      <div class="brand-row">
        <span>Paper Tracker</span>
      </div>

      <label class="search-box">
        <span>Search</span>
        <input type="search" value="${escapeHtml(state.query)}" placeholder="Filter: title, author, tag">
      </label>

      <nav class="library-nav" aria-label="Library">
        <button class="bucket-item ${state.selectedBucketId === 'library' ? 'is-active' : ''}" data-bucket-id="library">
          <span class="nav-icon">${renderIcon('library')}</span>
          <span>Library</span>
          <small>${getBucketCount('library')}</small>
        </button>
        ${renderBinderGroup('active', 'Active', summary.activeTotals)}
        ${renderBinderGroup('archived', 'Archived', summary.archivedTotals)}
      </nav>

      <div class="add-actions" aria-label="Add to library">
        <button class="add-action" data-action="import">
          <span class="add-action-mark">
            <span class="action-icon">${renderIcon('paper')}</span>
            <span class="add-plus">+</span>
          </span>
          <span>Paper</span>
        </button>
        <button class="add-action" data-action="new-bucket">
          <span class="add-action-mark">
            <span class="action-icon">${renderIcon('binder')}</span>
            <span class="add-plus">+</span>
          </span>
          <span>Binder</span>
        </button>
      </div>
      ${state.isCreatingBinder ? renderCreateBinderForm() : ''}

      <section class="progress-panel">
        <div class="panel-title">
          <span>Reading Progress</span>
          <strong>${state.papers.filter((paper) => paper.status === 'read').length}</strong>
        </div>
        <div class="activity-grid" aria-label="Reading activity">
          ${getActivityDays()
            .map((day) => {
              const levelClass = day.level ? ` level-${day.level}` : '';
              const paperLabel = day.count === 1 ? 'paper' : 'papers';
              return `<span class="activity-cell${levelClass}" title="${escapeHtml(`${day.label}: ${day.count} ${paperLabel} read`)}"></span>`;
            })
            .join('')}
        </div>
        <div class="activity-months">
          <span>Jun</span>
          <span>Jul</span>
          <span>Aug</span>
        </div>
      </section>
      ${renderUpdatePanel()}
    </aside>
  `;
}

function renderUpdatePanel() {
  const update = state.updateStatus;
  const versionLabel = update.currentVersion ? `v${escapeHtml(update.currentVersion)}` : 'Version';
  const status = update.error
    ? update.error
    : update.hasUpdate
      ? `v${escapeHtml(update.latestVersion)} is available`
      : update.checked
        ? 'Up to date'
        : '';

  return `
    <section class="update-panel">
      <div class="update-copy">
        <span>Updates</span>
        <small>${versionLabel}</small>
      </div>
      <div class="update-actions">
        <button data-action="check-updates" ${update.checking ? 'disabled' : ''}>${update.checking ? 'Checking...' : 'Check'}</button>
        ${
          update.hasUpdate
            ? `<button class="primary-update" data-action="open-update">${update.assetName ? 'Download' : 'Open'}</button>`
            : ''
        }
      </div>
      ${status ? `<p class="${update.error ? 'is-error' : ''}">${status}</p>` : ''}
    </section>
  `;
}

function renderBinderGroup(category, label, totals) {
  const binders = state.buckets.filter((bucket) => getBucketCategory(bucket) === category);
  const icon = category === 'archived' ? 'archive' : 'active';

  return `
    <section class="binder-group" data-binder-category="${category}">
      <div class="binder-group-title" data-category-drop="${category}">
        <span><span class="nav-icon">${renderIcon(icon)}</span>${label}</span>
        <small>${totals.toRead + totals.reading} queued / ${totals.read} read</small>
      </div>
      <div class="binder-sublist">
        ${
          binders.length
            ? binders.map(renderBinderNavItem).join('')
            : `<div class="binder-empty" data-category-drop="${category}">Drop binders here</div>`
        }
      </div>
    </section>
  `;
}

function renderBinderNavItem(bucket) {
  const colorPicker = state.coloringBucketId === bucket.id ? renderColorPicker(bucket.id, getBinderColor(bucket.id)) : '';
  const summary = getBucketSummary(bucket);
  const progress = getReadProgress(summary);
  const color = getBinderColor(bucket.id);

  if (state.renamingBucketId === bucket.id) {
    return `
      <form class="binder-rename-form" data-binder-rename="${escapeHtml(bucket.id)}">
        <input name="binderName" value="${escapeHtml(bucket.name)}" aria-label="Rename binder">
        <button type="submit">Save</button>
        <button type="button" data-action="cancel-rename">Cancel</button>
      </form>
      ${colorPicker}
    `;
  }

  return `
    <div class="binder-nav-wrap">
      <button class="bucket-item ${state.selectedBucketId === bucket.id ? 'is-active' : ''}" data-bucket-id="${escapeHtml(bucket.id)}" data-binder-id="${escapeHtml(bucket.id)}" draggable="true">
        <span class="nav-icon binder-icon" style="color: ${color}">${renderIcon('binder')}</span>
        <span class="binder-nav-main">
          <span>${escapeHtml(bucket.name)}</span>
          <span class="mini-progress" title="${summary.read} read out of ${summary.total}">
            <span style="width: ${progress}%; background: ${color}"></span>
          </span>
        </span>
        <small>${summary.read}/${summary.total}</small>
      </button>
      ${colorPicker}
    </div>
  `;
}

function renderCreateBinderForm() {
  const selectedColor = binderColors[0];

  return `
    <form class="binder-create-form" data-binder-create>
      <input name="binderName" placeholder="Binder name" aria-label="Binder name">
      ${renderColorPicker('new', selectedColor, 'binderColor')}
      <div class="binder-create-actions">
        <button type="submit">Create</button>
        <button type="button" data-action="cancel-new-binder">Cancel</button>
      </div>
    </form>
  `;
}

function renderColorPicker(bucketId, selectedColor, inputName = '') {
  const name = inputName || `binderColor-${bucketId}`;

  return `
    <div class="binder-color-picker" data-color-picker-for="${escapeHtml(bucketId)}">
      ${binderColors
        .map(
          (color) => `
            <label class="color-choice ${color === selectedColor ? 'is-selected' : ''}" style="--swatch: ${color}">
              <input type="radio" ${name ? `name="${name}"` : ''} value="${color}" ${color === selectedColor ? 'checked' : ''} data-binder-color="${escapeHtml(bucketId)}">
              <span></span>
            </label>
          `
        )
        .join('')}
    </div>
  `;
}

function renderContextMenu() {
  if (!state.contextMenu) {
    return '';
  }

  const x = Math.min(state.contextMenu.x, window.innerWidth - 166);
  const y = Math.min(state.contextMenu.y, window.innerHeight - 116);

  return `
    <div class="context-menu" style="left: ${Math.max(8, x)}px; top: ${Math.max(8, y)}px">
      <button data-context-action="rename" data-context-binder-id="${escapeHtml(state.contextMenu.bucketId)}">Rename</button>
      <button data-context-action="color" data-context-binder-id="${escapeHtml(state.contextMenu.bucketId)}">Change color</button>
      <button data-context-action="delete" data-context-binder-id="${escapeHtml(state.contextMenu.bucketId)}">Delete</button>
    </div>
  `;
}

function renderIcon(name) {
  const icons = {
    plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>',
    paper: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h5.2L12 5.3v8.2H4z"/><path d="M9 2.7V5.5h2.8"/><path d="M6 8h4M6 10.5h3"/></svg>',
    library: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.5 8 3l5 2.5-5 2.5-5-2.5Z"/><path d="m3 8 5 2.5L13 8"/><path d="m3 10.5 5 2.5 5-2.5"/></svg>',
    active: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10v7H3z"/><path d="M5.5 7h5M5.5 9.5h3"/></svg>',
    archive: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5h10v8H3z"/><path d="M2.5 3h11v2h-11z"/><path d="M6 8h4"/></svg>',
    binder: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 2.8h8.3c.7 0 1.3.6 1.3 1.3v9.1H4.5c-.7 0-1.3-.6-1.3-1.3z"/><path d="M4.5 13.2c-.7 0-1.3-.6-1.3-1.3s.6-1.3 1.3-1.3h8.3"/><path d="M5.8 2.8v7.8"/><path d="M7.3 5.1h3.2"/></svg>'
  };

  return icons[name] || '';
}

function renderWorkspace() {
  if (state.selectedBucketId === 'library') {
    return renderLibraryHome();
  }

  return renderBoard();
}

function renderLibraryHome() {
  const summary = getLibrarySummary();
  const query = state.query.trim().toLowerCase();
  const activeBinders = summary.active.filter((item) => !query || item.bucket.name.toLowerCase().includes(query));
  const archivedBinders = summary.archived.filter((item) => !query || item.bucket.name.toLowerCase().includes(query));
  const recommendation = getRecommendedPaper();

  return `
    <main class="workspace library-home">
      <header class="topbar">
        <div class="topbar-main">
          <h1>Library</h1>
        </div>
      </header>

      <section class="library-overview">
        ${renderLibraryShelf('Active', activeBinders)}
        ${renderLibraryShelf('Archived', archivedBinders)}
        ${renderReadingTicker(recommendation)}
      </section>
    </main>
  `;
}

function renderReadingTicker(paper) {
  if (!paper) {
    return `
      <section class="reading-ticker is-empty" aria-label="Recommended reading">
        <div class="ticker-queue-label">
          <strong>Read next</strong>
        </div>
        <div class="ticker-empty">No papers in To Read.</div>
      </section>
    `;
  }

  const dueText = paper.deadline ? formatDate(paper.deadline) : '-';

  return `
    <section class="reading-ticker" aria-label="Recommended reading">
      <div class="ticker-queue-label">
        <strong>Read next</strong>
      </div>
      <button class="ticker-row" data-recommended-paper-id="${escapeHtml(paper.id)}" type="button">
        <span class="ticker-field ticker-paper-field">
          <span class="ticker-label">Recommended next</span>
          <span class="ticker-title">${escapeHtml(paper.title)}</span>
        </span>
        <span class="ticker-field">
          <span class="ticker-label">Due</span>
          <span class="ticker-code ${paper.deadline ? 'is-due' : ''}">${escapeHtml(dueText)}</span>
        </span>
        <span class="ticker-field">
          <span class="ticker-label">Binder</span>
          <span class="ticker-binder">${escapeHtml(getBucketName(paper.bucketId))}</span>
        </span>
      </button>
    </section>
  `;
}

function renderLibraryShelf(label, binders) {
  const totals = rollupSummaries(binders);
  const category = label.toLowerCase() === 'archived' ? 'archived' : 'active';

  return `
    <section class="library-shelf">
      <header>
        <div>
          <span class="section-kicker">${label}</span>
        </div>
        <strong>${totals.toRead + totals.reading} queued / ${totals.read} read</strong>
      </header>
      <div class="binder-shelf">
      <div class="binder-summary-list" data-category-drop="${category}">
        ${binders.length ? binders.map(renderBinderSummary).join('') : '<div class="shelf-empty">No binders here yet. Drag one from the sidebar shelf when you are ready.</div>'}
      </div>
      </div>
    </section>
  `;
}

function renderBinderSummary(summary) {
  const color = getBinderColor(summary.bucket.id);
  const shelfLabel = getBinderShelfLabel(summary.bucket.name);
  const compactLabelClass = shelfLabel.length > 12 ? ' is-compact' : '';

  return `
    <button class="binder-summary" data-bucket-id="${escapeHtml(summary.bucket.id)}" data-binder-id="${escapeHtml(summary.bucket.id)}" draggable="true" style="--binder-color: ${color}" title="${summary.total} paper${summary.total === 1 ? '' : 's'}">
      <span class="binder-summary-main">
        <span class="binder-label-track">
          <span class="binder-name${compactLabelClass}">${escapeHtml(shelfLabel)}</span>
        </span>
      </span>
    </button>
  `;
}

function getBinderShelfLabel(name = '') {
  const cleanName = String(name || 'Binder').trim().replace(/\s+/g, ' ');
  const yearMatch = cleanName.match(/\b(19\d{2}|20\d{2})\b/);

  if (yearMatch) {
    const beforeYear = cleanName.slice(0, yearMatch.index).replace(/\b(review|reviews|paper|papers|reading|binder)\b/gi, '').trim();
    const firstLabelWord = beforeYear.split(/\s+/).find(Boolean) || cleanName.split(/\s+/).find(Boolean) || 'Binder';
    return `${firstLabelWord} ${yearMatch[1].slice(2)}`;
  }

  const words = cleanName.split(/\s+/).filter(Boolean);
  if (cleanName.length > 16 && words.length > 1) {
    return words.slice(0, 2).join(' ');
  }

  return cleanName;
}

function getReadProgress(summary) {
  return summary.total ? Math.round((summary.read / summary.total) * 100) : 0;
}

function renderBoard() {
  const currentBucket = getCurrentBucket();
  const summary = getBucketSummary(currentBucket);
  const progress = getReadProgress(summary);
  const color = getBinderColor(currentBucket.id);
  const papers = getVisiblePapers();
  const readPapers = papers.filter((paper) => paper.status === 'read');
  const customReadTabs = getBucketReadTabs(currentBucket);
  const selectedReadTab = state.readTab === allReadTab.id || customReadTabs.some((tab) => tab.id === state.readTab) ? state.readTab : allReadTab.id;

  return `
    <main class="workspace binder-workspace">
      <header class="topbar">
        <div class="topbar-main">
          <div class="binder-title-block">
            <h1>${escapeHtml(currentBucket.name)}</h1>
            <span class="binder-header-progress" title="${summary.read} read out of ${summary.total}">
              <span style="width: ${progress}%; background: ${color}"></span>
            </span>
          </div>
          <button class="view-button" title="Board menu">=</button>
        </div>
      </header>

      ${renderReadTabs(readPapers, selectedReadTab)}

      <section class="board" aria-label="Reading status board">
        ${statusOrder
          .map((status) => {
            const statusPapers = papers.filter((paper) => paper.status === status);
            const visiblePapers =
              status === 'read' && selectedReadTab !== allReadTab.id ? statusPapers.filter((paper) => normalizeReadTab(paper.readTab) === selectedReadTab) : statusPapers;
            return renderColumn(status, visiblePapers);
          })
          .join('')}
      </section>
    </main>
  `;
}

function renderReadTabs(readPapers, selectedReadTab) {
  const currentBucket = getCurrentBucket();
  const customTabs = getBucketReadTabs(currentBucket);
  const tabs = [allReadTab, ...customTabs.map((tab) => ({ id: tab.id, label: tab.name }))];
  const counts = readPapers.reduce(
    (acc, paper) => {
      const tab = normalizeReadTab(paper.readTab);
      acc.all += 1;
      if (customTabs.some((item) => item.id === tab)) {
        acc[tab] = (acc[tab] || 0) + 1;
      }
      return acc;
    },
    { all: 0 }
  );

  return `
    <nav class="read-tabs" aria-label="Read paper tabs">
      ${tabs
        .map(
          (tab) => `
            <button class="read-tab ${selectedReadTab === tab.id ? 'is-active' : ''}" data-read-tab="${escapeHtml(tab.id)}" type="button">
              <span>${escapeHtml(tab.label)}</span>
              <small>${counts[tab.id] || 0}</small>
            </button>
          `
        )
        .join('')}
      <button class="read-tab read-tab-add" data-action="new-read-tab" type="button" title="Add topic tab">+</button>
    </nav>
  `;
}

function renderColumn(status, papers) {
  return `
    <section class="board-column" data-drop-status="${status}">
      <div class="column-header">
        <span>${escapeHtml(statusLabels[status])}</span>
        <small>${papers.length}</small>
      </div>
      <div class="column-stack">
        ${papers.length ? papers.map(renderPaperCard).join('') : `<div class="column-empty">Drop papers here</div>`}
      </div>
    </section>
  `;
}

function renderPaperCard(paper) {
  const selected = paper.id === state.selectedId;
  const urgency = getPaperUrgency(paper);
  const days = getDaysUntil(paper.deadline);
  const deadlineText = days === null ? '' : days < 0 ? `${Math.abs(days)}d late` : `${days}d left`;
  const publication = [paper.venue, paper.year].filter(Boolean).join(' / ');
  const thumbnailUrl = pathToFileUrl(paper.thumbnailPath);

  return `
    <article class="paper-card ${selected ? 'is-selected' : ''} ${urgency} ${thumbnailUrl ? 'has-thumbnail' : ''}" data-paper-id="${paper.id}" draggable="true">
      <div class="paper-card-main">
        <div class="card-pin"></div>
        <h3>${escapeHtml(paper.title)}</h3>
        <p>${escapeHtml(paper.authors || 'Unknown authors')}</p>
        ${paper.institutions ? `<p class="card-institutions">${escapeHtml(paper.institutions)}</p>` : ''}
        <div class="card-meta">
          ${paper.priority === 'high' ? '<span class="priority high">High priority</span>' : ''}
          ${publication ? `<span>${escapeHtml(publication)}</span>` : ''}
          ${deadlineText ? `<span>${escapeHtml(deadlineText)}</span>` : ''}
          ${paper.rating ? `<span>${paper.rating}/5</span>` : ''}
        </div>
        <div class="tag-row">
          ${(paper.tags || []).slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}
        </div>
      </div>
      ${
        thumbnailUrl
          ? `<div class="paper-card-thumb" aria-hidden="true"><img src="${escapeHtml(thumbnailUrl)}" alt=""></div>`
          : '<div class="paper-card-thumb is-empty" aria-hidden="true"></div>'
      }
    </article>
  `;
}

function renderNotesEditor(paper) {
  const creates = normalizeCreates(paper.creates);

  return `
    <section class="creates-panel">
      <label class="field notes-field">
        Notes
        <textarea data-field="notes" placeholder="Notes, review snippets, citation thoughts">${escapeHtml(paper.notes)}</textarea>
      </label>
      <label class="creates-toggle">
        <input type="checkbox" data-creates-toggle ${creates.enabled ? 'checked' : ''}>
        <span>UCLA CREATEs</span>
      </label>
      ${
        creates.enabled
          ? `
            <div class="creates-grid">
              ${createsFields
                .map(
                  (field) => `
                    <label class="field creates-field">
                      <span>${escapeHtml(field.label)}</span>
                      <small>${escapeHtml(field.prompt)}</small>
                      <textarea data-creates-field="${escapeHtml(field.id)}" placeholder="${escapeHtml(field.prompt)}">${escapeHtml(creates[field.id])}</textarea>
                    </label>
                  `
                )
                .join('')}
            </div>
          `
          : ''
      }
    </section>
  `;
}

function renderReadTabField(paper) {
  const bucket = state.buckets.find((item) => item.id === paper.bucketId);
  const tabs = getBucketReadTabs(bucket);
  const selectedTab = normalizeReadTab(paper.readTab);

  return `
    <label class="field">
      Read topic
      <select data-field="readTab">
        <option value="" ${selectedTab ? '' : 'selected'}>${tabs.length ? 'No topic' : 'No topics yet'}</option>
        ${tabs
          .map((tab) => `<option value="${escapeHtml(tab.id)}" ${selectedTab === tab.id ? 'selected' : ''}>${escapeHtml(tab.name)}</option>`)
          .join('')}
      </select>
    </label>
  `;
}

function renderInspector() {
  const paper = getSelectedPaper();

  if (!paper) {
    return `
      <aside class="inspector">
        <div class="empty-state">
          <h2>No paper selected</h2>
          <p>Add a paper to start building a local reading workflow.</p>
        </div>
      </aside>
    `;
  }

  const pageSnapshotUrl = pathToFileUrl(paper.pageSnapshotPath);
  const previewStatus = pageSnapshotUrl ? '' : 'No first-page snapshot path in this window.';

  return `
    <aside class="inspector">
      <div class="inspector-header">
        <div class="inspector-title-block">
          <div class="section-kicker">Details</div>
          <h2>${escapeHtml(paper.title)}</h2>
        </div>
        <button class="inspector-close" data-action="close-details" type="button" aria-label="Close details">&times;</button>
      </div>

      <button class="pdf-preview-action ${pageSnapshotUrl ? '' : 'is-missing'}" data-action="open-pdf" type="button" ${paper.localPath ? '' : 'disabled'}>
        <span class="pdf-preview-label">First page</span>
        <span class="pdf-preview-frame">
        ${
          pageSnapshotUrl
            ? `<img src="${escapeHtml(pageSnapshotUrl)}" alt="First page preview for ${escapeHtml(paper.title)}" data-preview-image>`
            : `<span class="preview-missing">${escapeHtml(previewStatus)}</span>`
        }
        </span>
        <span class="pdf-preview-open">Open PDF</span>
      </button>

      ${renderNotesEditor(paper)}

      <div class="control-row">
        <label>
          Binder
          <select data-field="bucketId">
            ${state.buckets
              .map((bucket) => `<option value="${escapeHtml(bucket.id)}" ${paper.bucketId === bucket.id ? 'selected' : ''}>${escapeHtml(bucket.name)}</option>`)
              .join('')}
          </select>
        </label>
        <label>
          Status
          <select data-field="status">
            ${statusOrder
              .map((status) => `<option value="${status}" ${paper.status === status ? 'selected' : ''}>${statusLabels[status]}</option>`)
              .join('')}
          </select>
        </label>
      </div>

      ${renderReadTabField(paper)}

      <label class="field">
        Title
        <input data-field="title" value="${escapeHtml(paper.title)}">
      </label>

      <label class="field">
        Authors
        <input data-field="authors" value="${escapeHtml(paper.authors)}">
      </label>

      <label class="field">
        Institutions
        <input data-field="institutions" value="${escapeHtml(paper.institutions)}">
      </label>

      <div class="control-row">
        <label>
          Venue
          <input data-field="venue" value="${escapeHtml(paper.venue)}">
        </label>
        <label>
          Year
          <input data-field="year" value="${escapeHtml(paper.year)}">
        </label>
      </div>

      <div class="control-row">
        <label>
          <span>High priority</span>
          <input type="checkbox" data-field="priority" ${paper.priority === 'high' ? 'checked' : ''}>
        </label>
        <label>
          Rating
          <input type="number" min="1" max="5" step="1" data-field="rating" value="${paper.rating ? escapeHtml(paper.rating) : ''}" placeholder="1-5">
        </label>
      </div>

      <label class="field">
        Deadline
        <input type="date" data-field="deadline" value="${escapeHtml(paper.deadline)}">
      </label>

      <label class="field">
        Tags
        <input list="tag-options" data-field="tags" value="${escapeHtml((paper.tags || []).join(', '))}">
        <datalist id="tag-options">
          ${getAllTags().map((tag) => `<option value="${escapeHtml(tag)}"></option>`).join('')}
        </datalist>
      </label>

      <div class="inspector-footer">
        <button class="danger-action" data-action="delete">Delete paper</button>
      </div>
    </aside>
  `;
}

function render(options = {}) {
  const selectedPaper = getSelectedPaper();

  app.innerHTML = `
    <div class="shell ${selectedPaper ? 'has-inspector' : 'no-inspector'}">
      ${renderSidebar()}
      ${renderWorkspace()}
      ${selectedPaper ? renderInspector() : ''}
    </div>
    ${renderContextMenu()}
  `;

  bindEvents();

  if (options.focusSearch) {
    const searchInput = document.querySelector('.search-box input');
    searchInput?.focus();
    searchInput?.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }

  if (options.focusNewBinder) {
    document.querySelector('[data-binder-create] input')?.focus();
  }

  if (options.focusRenameBinder) {
    const renameInput = document.querySelector('[data-binder-rename] input');
    renameInput?.focus();
    renameInput?.select();
  }

  if (options.scrollInspectorTop) {
    requestAnimationFrame(() => {
      document.querySelector('.inspector')?.scrollTo({ top: 0 });
    });
  }
}

function bindEvents() {
  window.onkeydown = (event) => {
    if (event.key !== 'Escape') {
      return;
    }

    state.contextMenu = null;
    state.isCreatingBinder = false;
    state.renamingBucketId = '';
    state.coloringBucketId = '';
    render();
  };

  if (state.contextMenu) {
    app.addEventListener(
      'click',
      (event) => {
        if (event.target.closest('.context-menu')) {
          return;
        }

        state.contextMenu = null;
        render();
      },
      { once: true }
    );
  }

  document.querySelectorAll('[data-bucket-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedBucketId = button.dataset.bucketId;
      state.selectedId = '';
      state.readTab = allReadTab.id;
      state.contextMenu = null;
      render();
    });
  });

  document.querySelectorAll('[data-recommended-paper-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const paper = state.papers.find((item) => item.id === button.dataset.recommendedPaperId);

      if (!paper) {
        return;
      }

      state.selectedBucketId = paper.bucketId || state.buckets[0]?.id || defaultBucketId;
      state.selectedId = paper.id;
      state.contextMenu = null;
      render({ scrollInspectorTop: true });
    });
  });

  document.querySelectorAll('[data-read-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const currentBucket = getCurrentBucket();
      const tabs = getBucketReadTabs(currentBucket);
      state.readTab = button.dataset.readTab === allReadTab.id || tabs.some((tab) => tab.id === button.dataset.readTab) ? button.dataset.readTab : allReadTab.id;
      render();
    });
  });

  document.querySelector('[data-action="new-read-tab"]')?.addEventListener('click', createReadTab);

  document.querySelectorAll('[data-binder-id]').forEach((button) => {
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      state.contextMenu = {
        bucketId: button.dataset.binderId,
        x: event.clientX,
        y: event.clientY
      };
      render();
    });

    button.addEventListener('dragover', (event) => {
      if (isBinderDrag(event)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        button.classList.add(getBinderDropClass(button, event));
        return;
      }

      if (!isPaperDrag(event)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      button.classList.add('is-drop-target');
    });

    button.addEventListener('dragleave', () => {
      clearDropState(button);
    });

    button.addEventListener('drop', async (event) => {
      if (isBinderDrag(event)) {
        const draggedId = event.dataTransfer.getData(binderDragType);
        const target = state.buckets.find((bucket) => bucket.id === button.dataset.binderId);

        if (!draggedId || !target) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        clearDropState(button);
        await reorderBinder(draggedId, target.id, isAfterMidpoint(button, event), getBucketCategory(target));
        return;
      }

      const paperId = event.dataTransfer.getData('text/plain');

      if (!paperId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      clearDropState(button);
      state.selectedId = '';
      await updatePaperById(paperId, { bucketId: button.dataset.binderId }, { keepSelection: false });
    });

    button.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData(binderDragType, button.dataset.binderId);
      event.dataTransfer.effectAllowed = 'move';
      button.classList.add('is-dragging');
    });

    button.addEventListener('dragend', () => {
      document.querySelectorAll('.is-dragging, .is-drop-target, .is-reorder-before, .is-reorder-after, .is-category-drop-target').forEach((element) => {
        clearDropState(element);
        element.classList.remove('is-dragging');
      });
    });
  });

  document.querySelectorAll('[data-category-drop]').forEach((dropZone) => {
    dropZone.addEventListener('dragover', (event) => {
      if (!isBinderDrag(event)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      dropZone.classList.add('is-category-drop-target');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('is-category-drop-target');
    });

    dropZone.addEventListener('drop', async (event) => {
      if (!isBinderDrag(event)) {
        return;
      }

      event.preventDefault();
      dropZone.classList.remove('is-category-drop-target');
      await reorderBinder(event.dataTransfer.getData(binderDragType), '', false, dropZone.dataset.categoryDrop);
    });
  });

  document.querySelectorAll('[data-paper-id]').forEach((card) => {
    card.addEventListener('click', () => {
      state.selectedId = card.dataset.paperId;
      render({ scrollInspectorTop: true });
    });

    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData(paperDragType, card.dataset.paperId);
      event.dataTransfer.setData('text/plain', card.dataset.paperId);
      event.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      document.querySelectorAll('.is-drop-target, .is-dragging-over, .is-reorder-before, .is-reorder-after').forEach((element) => {
        clearDropState(element);
      });
    });
  });

  document.querySelectorAll('[data-drop-status]').forEach((column) => {
    column.addEventListener('dragover', (event) => {
      if (!isPaperDrag(event)) {
        return;
      }

      event.preventDefault();
      column.classList.add('is-dragging-over');
    });

    column.addEventListener('dragleave', () => {
      column.classList.remove('is-dragging-over');
    });

    column.addEventListener('drop', async (event) => {
      if (!isPaperDrag(event)) {
        return;
      }

      event.preventDefault();
      column.classList.remove('is-dragging-over');
      const paperId = event.dataTransfer.getData('text/plain');
      if (!paperId) {
        return;
      }

      const patch = { status: column.dataset.dropStatus };

      if (column.dataset.dropStatus === 'read' && state.readTab !== allReadTab.id) {
        patch.readTab = normalizeReadTab(state.readTab);
      }

      await updatePaperById(paperId, patch);
    });
  });

  const searchInput = document.querySelector('.search-box input');
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      state.query = event.target.value;
      render({ focusSearch: true });
    });
  }

  document.querySelectorAll('[data-field]').forEach((field) => {
    field.addEventListener('keydown', (event) => saveFieldFromKeyboard(event, field));
    field.addEventListener('change', () => saveSelectedField(field));
    field.addEventListener('blur', () => saveSelectedField(field));
  });

  document.querySelector('[data-creates-toggle]')?.addEventListener('change', (event) => {
    saveCreatesToggle(event.currentTarget.checked);
  });

  document.querySelectorAll('[data-creates-field]').forEach((field) => {
    field.addEventListener('keydown', (event) => saveCreatesFieldFromKeyboard(event, field));
    field.addEventListener('change', () => saveCreatesField(field));
    field.addEventListener('blur', () => saveCreatesField(field));
  });

  document.querySelectorAll('[data-preview-image]').forEach((image) => {
    image.addEventListener('error', () => {
      const preview = image.closest('.pdf-preview-action, .paper-page-preview, .inline-page-preview');
      if (!preview) {
        return;
      }

      preview.classList.add('is-missing');
      preview.insertAdjacentHTML('beforeend', '<span class="preview-missing">First-page snapshot file could not be loaded.</span>');
      image.remove();
    });
  });

  document.querySelector('[data-action="import"]')?.addEventListener('click', importPdf);
  document.querySelector('[data-action="new-bucket"]')?.addEventListener('click', () => {
    state.isCreatingBinder = true;
    state.contextMenu = null;
    state.coloringBucketId = '';
    render({ focusNewBinder: true });
  });
  document.querySelector('[data-action="cancel-new-binder"]')?.addEventListener('click', () => {
    state.isCreatingBinder = false;
    render();
  });
  document.querySelector('[data-binder-create]')?.addEventListener('submit', createBucket);
  document.querySelectorAll('[data-binder-rename]').forEach((form) => {
    form.addEventListener('submit', renameBinderFromForm);
  });
  document.querySelectorAll('[data-action="cancel-rename"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.renamingBucketId = '';
      render();
    });
  });
  document.querySelectorAll('[data-context-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const bucketId = button.dataset.contextBinderId;

      if (button.dataset.contextAction === 'rename') {
        state.contextMenu = null;
        state.renamingBucketId = bucketId;
        state.coloringBucketId = '';
        render({ focusRenameBinder: true });
        return;
      }

      if (button.dataset.contextAction === 'color') {
        state.contextMenu = null;
        state.renamingBucketId = '';
        state.coloringBucketId = bucketId;
        render();
        return;
      }

      state.contextMenu = null;
      await deleteBinder(bucketId);
    });
  });
  document.querySelectorAll('[data-binder-color]').forEach((input) => {
    input.addEventListener('change', () => updateBinderColor(input.dataset.binderColor, input.value));
  });
  document.querySelector('[data-action="open-pdf"]')?.addEventListener('click', openSelectedPdf);
  document.querySelector('[data-action="close-details"]')?.addEventListener('click', () => {
    state.selectedId = '';
    render();
  });
  document.querySelector('[data-action="delete"]')?.addEventListener('click', deleteSelectedPaper);
  document.querySelector('[data-action="check-updates"]')?.addEventListener('click', checkForAppUpdates);
  document.querySelector('[data-action="open-update"]')?.addEventListener('click', openUpdateDownload);
}

function saveFieldFromKeyboard(event, field) {
  const isTextarea = field.tagName === 'TEXTAREA';
  const shouldSaveTextarea = isTextarea && event.key === 'Enter' && (event.metaKey || event.ctrlKey);
  const shouldSaveSingleLine = !isTextarea && event.key === 'Enter';

  if (!shouldSaveTextarea && !shouldSaveSingleLine) {
    return;
  }

  event.preventDefault();
  saveSelectedField(field);
}

async function saveSelectedField(field) {
  const paper = getSelectedPaper();
  if (!paper) {
    return;
  }

  const patch = { [field.dataset.field]: field.value };

  if (field.type === 'checkbox' && field.dataset.field === 'priority') {
    patch.priority = field.checked ? 'high' : 'normal';
  }

  await updatePaperById(paper.id, patch);
}

function saveCreatesFieldFromKeyboard(event, field) {
  if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) {
    return;
  }

  event.preventDefault();
  saveCreatesField(field);
}

async function saveCreatesToggle(enabled) {
  const paper = getSelectedPaper();
  if (!paper) {
    return;
  }

  await updatePaperById(paper.id, {
    creates: {
      ...normalizeCreates(paper.creates),
      enabled
    }
  });
}

async function saveCreatesField(field) {
  const paper = getSelectedPaper();
  const fieldName = field.dataset.createsField;

  if (!paper || !createsFields.some((item) => item.id === fieldName)) {
    return;
  }

  await updatePaperById(paper.id, {
    creates: {
      ...normalizeCreates(paper.creates),
      enabled: true,
      [fieldName]: field.value
    }
  });
}

async function updatePaperById(id, patch, options = {}) {
  const updated = await paperApi.updatePaper(id, patch);
  state.papers = state.papers.map((item) => (item.id === updated.id ? updated : item));
  state.selectedId = options.keepSelection === false ? '' : updated.id;
  render();
}

async function checkForAppUpdates() {
  state.updateStatus = {
    ...state.updateStatus,
    checking: true,
    checked: false,
    error: ''
  };
  render();

  try {
    const result = await paperApi.checkForUpdates();
    state.updateStatus = {
      ...state.updateStatus,
      ...result,
      checking: false,
      checked: true,
      error: result.browserPreview ? 'Open the desktop app to check updates.' : ''
    };
  } catch (error) {
    state.updateStatus = {
      ...state.updateStatus,
      checking: false,
      checked: true,
      error: `Could not check updates: ${error.message || error}`
    };
  }

  render();
}

async function openUpdateDownload() {
  const target = state.updateStatus.downloadUrl || state.updateStatus.releaseUrl;
  if (!target) {
    return;
  }

  await paperApi.openUpdateUrl(target);
}

async function importPdf() {
  const targetBucketId = state.selectedBucketId === 'library' ? state.buckets[0]?.id || defaultBucketId : state.selectedBucketId;
  const paper = await paperApi.importPdf(targetBucketId);

  if (paper) {
    state.papers.unshift(paper);
    state.selectedId = '';
    state.selectedBucketId = paper.bucketId || state.selectedBucketId;
    render();
  }
}

async function createBucket(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const name = formData.get('binderName');
  const color = formData.get('binderColor') || binderColors[0];

  if (!name?.trim()) {
    return;
  }

  const bucket = await paperApi.createBucket({ name, category: 'active', color });
  state.buckets.push(bucket);
  state.selectedBucketId = bucket.id;
  state.selectedId = '';
  state.isCreatingBinder = false;
  render();
}

async function updateBinderColor(bucketId, color) {
  if (!bucketId || bucketId === 'new' || !normalizeColor(color)) {
    return;
  }

  const updated = await paperApi.updateBucket(bucketId, { color });
  state.buckets = state.buckets.map((bucket) => (bucket.id === updated.id ? updated : bucket));
  state.coloringBucketId = '';
  render();
}

async function renameBinderFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const bucketId = form.dataset.binderRename;
  const name = new FormData(form).get('binderName');

  if (!bucketId || !name?.trim()) {
    state.renamingBucketId = '';
    render();
    return;
  }

  const updated = await paperApi.updateBucket(bucketId, { name });
  state.buckets = state.buckets.map((bucket) => (bucket.id === updated.id ? updated : bucket));
  state.selectedBucketId = state.selectedBucketId === bucketId ? updated.id : state.selectedBucketId;
  state.renamingBucketId = '';
  render();
}

async function createReadTab() {
  const bucket = getCurrentBucket();

  if (!bucket || bucket.id === 'library') {
    return;
  }

  const name = window.prompt('Name this read topic');
  const cleanName = String(name || '').trim();

  if (!cleanName) {
    return;
  }

  const existingTabs = getBucketReadTabs(bucket);
  const existingIds = new Set(existingTabs.map((tab) => tab.id));
  const baseId = slugify(cleanName);
  let id = baseId;
  let suffix = 2;

  while (existingIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const readTabs = [...existingTabs, { id, name: cleanName }];
  const updated = await paperApi.updateBucket(bucket.id, { readTabs });
  state.buckets = state.buckets.map((item) => (item.id === updated.id ? updated : item));
  state.readTab = id;
  render();
}

async function reorderBinder(draggedId, targetId, insertAfter, targetCategory = '') {
  const nextBuckets = [...state.buckets];
  const draggedIndex = nextBuckets.findIndex((bucket) => bucket.id === draggedId);

  if (draggedIndex === -1 || draggedId === targetId) {
    return;
  }

  const [dragged] = nextBuckets.splice(draggedIndex, 1);
  const desiredCategory = targetCategory === 'archived' ? 'archived' : 'active';
  dragged.category = desiredCategory;

  if (targetId) {
    const adjustedTargetIndex = nextBuckets.findIndex((bucket) => bucket.id === targetId);

    if (adjustedTargetIndex === -1) {
      return;
    }

    nextBuckets.splice(insertAfter ? adjustedTargetIndex + 1 : adjustedTargetIndex, 0, dragged);
  } else {
    const lastInCategory = nextBuckets.reduce((lastIndex, bucket, index) => {
      return getBucketCategory(bucket) === desiredCategory ? index : lastIndex;
    }, -1);
    nextBuckets.splice(lastInCategory + 1, 0, dragged);
  }

  await paperApi.updateBucket(draggedId, { category: desiredCategory });
  state.buckets = await paperApi.reorderBuckets(nextBuckets.map((bucket) => bucket.id));
  state.contextMenu = null;
  render();
}

async function deleteBinder(bucketId) {
  const bucket = state.buckets.find((item) => item.id === bucketId);

  if (!bucket) {
    return;
  }

  if (state.buckets.length <= 1) {
    window.alert('Keep at least one binder in the library.');
    return;
  }

  const paperCount = getBucketCount(bucketId);
  const confirmed = window.confirm(`Delete "${bucket.name}"? ${paperCount} paper${paperCount === 1 ? '' : 's'} will move to another binder.`);

  if (!confirmed) {
    return;
  }

  const result = await paperApi.deleteBucket(bucketId);

  if (!result.deleted) {
    return;
  }

  state.buckets = result.buckets;
  state.papers = result.papers;
  state.selectedId = '';
  state.selectedBucketId = state.selectedBucketId === bucketId ? 'library' : state.selectedBucketId;
  render();
}

function getBinderDropClass(button, event) {
  button.classList.remove('is-reorder-before', 'is-reorder-after');
  return isAfterMidpoint(button, event) ? 'is-reorder-after' : 'is-reorder-before';
}

function isAfterMidpoint(element, event) {
  const rect = element.getBoundingClientRect();
  if (element.classList.contains('binder-summary')) {
    return event.clientX > rect.left + rect.width / 2;
  }

  return event.clientY > rect.top + rect.height / 2;
}

function clearDropState(element) {
  element.classList.remove('is-drop-target', 'is-dragging-over', 'is-reorder-before', 'is-reorder-after', 'is-category-drop-target');
}

function bindFileDrop() {
  window.addEventListener('dragover', (event) => {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    document.body.classList.add('is-file-hover');
  });

  window.addEventListener('dragleave', (event) => {
    if (event.clientX === 0 && event.clientY === 0) {
      document.body.classList.remove('is-file-hover');
    }
  });

  window.addEventListener('drop', async (event) => {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    document.body.classList.remove('is-file-hover');

    const file = [...event.dataTransfer.files].find((item) => item.name.toLowerCase().endsWith('.pdf'));
    if (!file) {
      return;
    }

    const targetBucketId = state.selectedBucketId === 'library' ? state.buckets[0]?.id || defaultBucketId : state.selectedBucketId;
    const filePath = paperApi.getFilePath ? paperApi.getFilePath(file) : '';
    const paper = paperApi.importPdfPath ? await paperApi.importPdfPath(filePath, targetBucketId) : await paperApi.importPdf(targetBucketId);

    if (paper) {
      state.papers.unshift(paper);
      state.selectedId = '';
      state.selectedBucketId = paper.bucketId || state.selectedBucketId;
      render();
    }
  });
}

function isFileDrag(event) {
  return [...event.dataTransfer.types].includes('Files');
}

function isPaperDrag(event) {
  const types = [...event.dataTransfer.types];
  return types.includes(paperDragType) && !types.includes('Files');
}

function isBinderDrag(event) {
  const types = [...event.dataTransfer.types];
  return types.includes(binderDragType);
}

async function openSelectedPdf() {
  const paper = getSelectedPaper();
  if (paper) {
    await paperApi.openPdf(paper.id);
  }
}

async function deleteSelectedPaper() {
  const paper = getSelectedPaper();
  if (!paper) {
    return;
  }

  const confirmed = window.confirm(`Delete "${paper.title}" from your library?`);
  if (!confirmed) {
    return;
  }

  await paperApi.deletePaper(paper.id);
  state.papers = state.papers.filter((item) => item.id !== paper.id);
  state.selectedId = getVisiblePapers()[0]?.id || '';
  render();
}

async function boot() {
  try {
    if (paperApi.getAppVersion) {
      state.updateStatus.currentVersion = await paperApi.getAppVersion();
    }
  } catch (error) {
    state.updateStatus.currentVersion = '';
  }

  const library = await paperApi.getLibrary();
  state.buckets = (library.buckets || getStarterBuckets()).map(normalizeBucket);
  state.papers = (library.papers || []).map((paper) =>
    normalizePaper(
      {
        ...paper,
        status: migrateStatus(paper.status),
        bucketId: paper.bucketId || state.buckets[0]?.id || defaultBucketId
      },
      paper
    )
  );
  state.selectedId = '';
  render();
  bindFileDrop();
}

boot().catch((error) => {
  app.innerHTML = `<pre class="fatal-error">${escapeHtml(error.stack || error.message)}</pre>`;
});
