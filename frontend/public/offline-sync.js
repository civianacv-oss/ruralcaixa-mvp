// public/offline-sync.js
// Sincronização de eventos ovinos registrados offline

const DB_NAME = 'ruralcaixa-offline';
const STORE_NAME = 'eventos-pendentes';
const API = 'https://ruralcaixa-mvp-production.up.railway.app';

// Abre o IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Salva evento offline
async function salvarEventoOffline(tipo, payload) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).add({
    tipo,
    payload,
    timestamp: new Date().toISOString(),
    tentativas: 0,
  });
  return new Promise((res) => (tx.oncomplete = res));
}

// Sincroniza eventos pendentes
async function sincronizarEventos() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const eventos = await new Promise((res) => {
    const req = store.getAll();
    req.onsuccess = () => res(req.result);
  });

  let sincronizados = 0;
  for (const evento of eventos) {
    const endpoint = {
      pesagem: '/ovino/pesagens',
      vacina: '/ovino/sanitario/aplicar',
      morte: '/ovino/mortalidade',
      cadastro: '/ovino/animais',
    }[evento.tipo];

    if (!endpoint) continue;

    try {
      const resp = await fetch(API + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evento.payload),
      });
      if (resp.ok) {
        store.delete(evento.id);
        sincronizados++;
      }
    } catch (e) {
      console.warn('Falha ao sincronizar:', evento.tipo, e);
    }
  }
  return sincronizados;
}

// Expõe funções globais
window.RuralCaixaOffline = { salvarEventoOffline, sincronizarEventos };

// Sincroniza automaticamente quando voltar internet
window.addEventListener('online', async () => {
  const n = await sincronizarEventos();
  if (n > 0) {
    console.log(`RuralCaixa: ${n} evento(s) sincronizado(s)`);
  }
});
