// Remettre un fichier à la personne : feuille de partage là où elle existe (iPhone, iPad), sinon téléchargement direct (Mac, ordinateur).
// Détection par fonctionnalité (navigator.share), jamais par navigateur.
export function telecharger(fichier) {
  console.log(`[V2/PDF] téléchargement : ${fichier.name}, ${fichier.size} octets, ${fichier.type}`);
  const url = URL.createObjectURL(fichier);
  const a = document.createElement('a'); a.href = url; a.download = fichier.name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function livrer(fichier) {
  if (typeof navigator.share === 'function' && navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: fichier.name }); return; }
    catch (x) { if (x && x.name === 'AbortError') return; /* partage impossible : on télécharge */ }
  }
  telecharger(fichier);
}
