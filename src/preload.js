const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('paperTracker', {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  createPaper: (paper) => ipcRenderer.invoke('paper:create', paper),
  importPdf: (bucketId) => ipcRenderer.invoke('paper:importPdf', bucketId),
  importPdfPath: (filePath, bucketId) => ipcRenderer.invoke('paper:importPdfPath', filePath, bucketId),
  updatePaper: (id, patch) => ipcRenderer.invoke('paper:update', id, patch),
  deletePaper: (id) => ipcRenderer.invoke('paper:delete', id),
  openPdf: (id) => ipcRenderer.invoke('paper:openPdf', id),
  createBucket: (bucket) => ipcRenderer.invoke('bucket:create', bucket),
  updateBucket: (id, patch) => ipcRenderer.invoke('bucket:update', id, patch),
  reorderBuckets: (orderedIds) => ipcRenderer.invoke('bucket:reorder', orderedIds),
  deleteBucket: (id) => ipcRenderer.invoke('bucket:delete', id),
  getFilePath: (file) => webUtils.getPathForFile(file)
});
