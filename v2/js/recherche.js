// Recherche d'un produit par son nom (ou son code) dans les produits déjà chargés : rien n'est demandé au réseau.
const cle = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

let index = null, indexSur = null;
function indexer(produits) {
  if (index && indexSur === produits) return index;
  index = Object.values(produits).map(o => ({ o, k: cle(o.lib), e: String(o.e) }));
  indexSur = produits; return index;
}

/** Tous les mots tapés doivent se trouver dans le nom (dans n'importe quel ordre). Les débuts de mot passent devant ; à égalité, ce qui se vend le plus. */
export function chercher(texte, produits, max = 40) {
  const q = cle(texte); if (q.length < 2) return [];
  const mots = q.split(' ');
  const res = [];
  for (const it of indexer(produits)) {
    if (/^\d{4,}$/.test(q)) { if (it.e.includes(q)) res.push({ o: it.o, s: it.e.endsWith(q) ? 3 : 1 }); continue; }
    if (!mots.every(m => it.k.includes(m))) continue;
    const debuts = mots.filter(m => it.k.startsWith(m) || it.k.includes(' ' + m)).length;
    res.push({ o: it.o, s: debuts + (it.k.startsWith(mots[0]) ? 1 : 0) });
  }
  res.sort((a, b) => b.s - a.s || (b.o.q || 0) - (a.o.q || 0) || String(a.o.lib).localeCompare(b.o.lib, 'fr'));
  return res.slice(0, max).map(r => r.o);
}
