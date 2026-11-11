# Transfert — `last-horizon-transfer`

Export / import d'une partie complète, et conversion des anciennes fiches CSB (`fiche-manhwa`) vers la Fiche - Manhwa.

La documentation détaillée du module est dans `DOCUMENTATION.md`.

Code de la version **1.3.1** (dernière release), pour Foundry VTT v13.

## Liens avec la suite Manhwa

La suite compte un système (Fiche - Manhwa) et 11 modules. La Fiche est le centre : les données partagées y vivent et les modules les lisent via `globalThis.MANHWA`.

- Utilise `MANHWA.config` de la Fiche pour la conversion.
- Règle commune : un module ne plante jamais si un autre est absent (vérifier `game.modules.get(id)?.active` avant d'appeler son API).

## Livraison

1. Augmenter `version` dans `module.json` (jamais deux livraisons au même numéro).
2. Construire le zip, qui doit contenir le dossier `last-horizon-transfer/` :
   ```bash
   mkdir -p build/last-horizon-transfer && git archive HEAD | tar -x -C build/last-horizon-transfer
   cd build && zip -qr last-horizon-transfer.zip last-horizon-transfer
   ```
3. Créer la release GitHub `vX.Y.Z` avec **exactement 2 fichiers** : `module.json` et `last-horizon-transfer.zip`. Le manifeste pointe vers `releases/latest/download/…`.
4. The Forge : Bazaar → *Install From Manifest* avec l'URL versionnée `https://github.com/blendbastien/last-horizon-transfer/releases/download/vX.Y.Z/module.json`. Ne jamais utiliser *Update All Packages*.
5. Redémarrer le monde de test, vérifier la version installée et tester.
