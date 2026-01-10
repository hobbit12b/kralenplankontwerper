const StorageProvider = (() => {
  const DB_NAME = "kralenplank_db";
  const DB_VERSION = 1;
  const STORE = "designs";

  let db = null;

  function openDB(){
    if(db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if(!d.objectStoreNames.contains(STORE)){
          const os = d.createObjectStore(STORE, { keyPath:"id" });
          os.createIndex("updatedAt", "updatedAt", { unique:false });
          os.createIndex("pinned", "pinned", { unique:false });
        }
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode){
    return openDB().then(d => d.transaction(STORE, mode).objectStore(STORE));
  }

  async function listDesigns(limit = 18){
    const store = await tx("readonly");
    const designs = [];
    return new Promise((resolve, reject) => {
      const index = store.index("updatedAt");
      const req = index.openCursor(null, "prev");
      req.onsuccess = () => {
        const cur = req.result;
        if(cur && designs.length < limit){
          designs.push(cur.value);
          cur.continue();
        } else resolve(designs);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getDesign(id){
    const store = await tx("readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveDesign(design){
    const store = await tx("readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(design);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteDesign(id){
    const store = await tx("readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function exportPack(){
    const store = await tx("readonly");
    const all = [];
    return new Promise((resolve, reject) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if(cur){ all.push(cur.value); cur.continue(); }
        else resolve({
          version: 1,
          exportedAt: new Date().toISOString(),
          designs: all
        });
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function importPack(pack){
    if(!pack || !Array.isArray(pack.designs)) return 0;
    let count = 0;
    for(const d of pack.designs){
      if(d && d.id) { await saveDesign(d); count++; }
    }
    return count;
  }

  return { listDesigns, getDesign, saveDesign, deleteDesign, exportPack, importPack };
})();
