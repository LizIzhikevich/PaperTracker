const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('paperTracker', {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  updateDiscoveryVenues: (venueIds) => ipcRenderer.invoke('discovery:updateVenues', venueIds),
  createDiscoveryVenue: (venue) => ipcRenderer.invoke('discovery:createVenue', venue),
  refreshDiscovery: () => ipcRenderer.invoke('discovery:refresh'),
  setDiscoveryFeedback: (candidateId, value) => ipcRenderer.invoke('discovery:setFeedback', candidateId, value),
  importDiscoveryCandidate: (candidateId, bucketId) => ipcRenderer.invoke('discovery:importCandidate', candidateId, bucketId),
  openDiscoverySource: (url) => ipcRenderer.invoke('discovery:openSource', url),
  createPaper: (paper) => ipcRenderer.invoke('paper:create', paper),
  importPdf: (bucketId) => ipcRenderer.invoke('paper:importPdf', bucketId),
  importPdfPath: (filePath, bucketId) => ipcRenderer.invoke('paper:importPdfPath', filePath, bucketId),
  importUrlDoi: (input, bucketId) => ipcRenderer.invoke('paper:importUrlDoi', input, bucketId),
  updatePaper: (id, patch) => ipcRenderer.invoke('paper:update', id, patch),
  deletePaper: (id) => ipcRenderer.invoke('paper:delete', id),
  openPdf: (id) => ipcRenderer.invoke('paper:openPdf', id),
  openSource: (id) => ipcRenderer.invoke('paper:openSource', id),
  createBucket: (bucket) => ipcRenderer.invoke('bucket:create', bucket),
  updateBucket: (id, patch) => ipcRenderer.invoke('bucket:update', id, patch),
  reorderBuckets: (orderedIds) => ipcRenderer.invoke('bucket:reorder', orderedIds),
  deleteBucket: (id) => ipcRenderer.invoke('bucket:delete', id),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  openUpdateUrl: (url) => ipcRenderer.invoke('app:openUpdateUrl', url),
  getFilePath: (file) => webUtils.getPathForFile(file)
});
