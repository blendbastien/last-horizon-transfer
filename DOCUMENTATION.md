# Last Horizon Transfer 1.2.1

Exporte tout le contenu d'une partie Foundry (v13) dans un fichier `.json`, puis l'importe dans une autre partie.
Pensé pour passer d'une partie Forge à une autre, même quand les deux n'utilisent pas le même système
(par exemple Custom System Builder → Manhwa Sheet).

## Utilisation
1. Activer le module dans les deux parties.
2. Partie source : Paramètres → « Exporter cette partie » (ou le bouton en bas de l'onglet Paramètres). Cocher les types voulus, télécharger le `.json`.
3. Partie de destination : créer d'abord les comptes des joueurs (Paramètres › Joueurs), puis « Importer dans cette partie », choisir le fichier, vérifier l'écran de confirmation (types, correspondance des types, **correspondance des joueurs**, conflits, réglages), importer.
4. Recharger la page (F5).

## Ce qui passe
Acteurs (avec leurs objets et effets), objets, journaux (pages comprises), scènes (tokens, tuiles, murs, lumières, notes, sons…), tables aléatoires, macros, playlists, paquets de cartes, messages de chat (décochés par défaut) ou seulement la messagerie et les échanges Manhwa (cochés par défaut), dossiers (hiérarchie conservée), réglages de monde des modules et du système (configuration Manhwa Sheet, catalogue, scénarios…), liste des joueurs.

## Correspondance des joueurs (1.2.0)
L'export contient la liste des joueurs (nom, rôle, couleur, personnage, préférences des modules). À l'import, chaque joueur d'origine est associé à un compte de la nouvelle partie (même nom proposé par défaut, le MJ d'origine → toi). Tous les identifiants de joueur sont alors réécrits partout : permissions des fiches, propriétaire et droits des véhicules, niveaux de boutique par joueur, destinataires des annonces et des messages privés, amis, flags. Les préférences des modules (amis, carnet…) et le personnage attitré sont copiés sur le compte associé.

## Ce qui ne passe pas
- Les fichiers eux-mêmes (images, musiques) : seuls les chemins sont copiés. Sur Forge la bibliothèque d'assets est commune à toutes tes parties, donc rien à faire.
- Les comptes eux-mêmes (mots de passe) : on les crée dans la nouvelle partie, puis on les associe à l'import.
- Les compendiums, les combats, les réglages client.

## Entre deux systèmes différents
Les données `system` des acteurs et objets ne sont pas compatibles d'un système à l'autre. Elles sont conservées intactes dans
`flags.last-horizon-transfer.source` (système d'origine, type d'origine, données) : rien n'est perdu. Les types « template » de CSB
(`_template`, `subTemplate`, …) ne sont pas créés dans la destination (ils servent seulement à classer les objets).

## Conversion CSB (fiche-manhwa) → Manhwa Sheet
Quand la source est Custom System Builder et la destination Manhwa Sheet, l'écran d'import propose la conversion (cochée par défaut),
qui lit la configuration réelle de la partie de destination :
- Personnage : niveau, rang, éveil (`classe`), monde → origine, constellation → sponsor, stats et monnaies (table de correspondance
  préremplie et modifiable à l'écran), identité (≈ 55 champs), titre équipé, cadrage du portrait.
- Objets : catégorie (d'après le template CSB puis le `type` de l'objet), rang, rareté, quantité, valeur, niveau, élément, coût, portée,
  exécution, monde, constructeur, places, description, lore, cadrage, équipable ; le reste des propriétés va dans `extra`.
- Les valeurs qui n'existent pas dans la config de destination (un rang F absent, une rareté inconnue…) sont listées dans le rapport
  final : ajoute-les dans la config Manhwa Sheet puis réimporte en mode « Écraser ».
Pour que les objets soient bien classés, l'acteur `_template` de la fiche doit être dans le fichier (coche « Acteurs » à l'export) ;
les identifiants des templates de la fiche « Fiche Manhwa » sont aussi connus en repli.

## Recréer la fiche CSB dans la configuration Manhwa Sheet
À l'import (case cochée par défaut si l'acteur `_template` est dans le fichier), ou via Paramètres → « Config Manhwa Sheet depuis la fiche CSB »
(fichier Transfert ou export JSON de l'acteur `_template` ; télécharger la config ou l'appliquer). Généré depuis le template :
stats (clés, libellés, minimum), monnaies de l'en-tête, rangs (menu `rang`), éveils (valeurs de `classe`),
sections d'identité (sous-onglets, champs, types court / riche / liste), et les listes de raretés, éléments, coûts, portées, exécutions
d'après les valeurs réellement utilisées par les objets du fichier. L'arbre des catégories, le mode de jeu, les jauges et l'XP sont conservés.
L'ancienne configuration est sauvegardée dans les sauvegardes de Manhwa Sheet. Avec cette config, la conversion est 1 pour 1.

## Conflits d'identifiants
Par défaut les identifiants sont conservés (les tokens des scènes retrouvent leurs acteurs). Si un document existe déjà avec le même
identifiant : Ignorer (défaut ; le document est gardé mais replacé dans son dossier si besoin, donc un réimport ne crée jamais de doublon), Écraser, ou Dupliquer (nouvel identifiant ; les références des scènes sont remappées).

## API
`game.modules.get("last-horizon-transfer").api.export()` / `.import()`.

## Historique
- **1.3.0** : avant l'import, avertissement si des joueurs (ou un autre MJ actif) sont connectés — l'import réécrit des réglages entiers et pourrait écraser ce qu'ils font. Mode « remplacer » : une copie du document supprimé est gardée et rétablie si sa recréation échoue (avant : document perdu).
- **1.2.1** : préférences des joueurs copiées seulement pour les modules actifs dans la partie de destination (export depuis une partie CSB sans erreur à l'import).
- **1.2.0** : liste des joueurs exportée et correspondance à l'import (permissions, véhicules, boutique, messages, amis réécrits) ; réglages du système cochés par défaut ; option « Messagerie et échanges Manhwa ».
