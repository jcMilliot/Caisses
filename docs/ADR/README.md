# ADR — Architecture Decision Records

Un ADR capture une décision structurante avec son contexte, les alternatives écartées, et les
conséquences acceptées — pour qu'une session future (soi-même dans 6 mois, ou un agent IA) ne
remette pas en question un choix déjà tranché consciemment, ou du moins le remette en question
en connaissance de cause plutôt qu'en le redécouvrant depuis zéro.

**Seuil** : pas besoin d'ADR pour un renommage de variable, l'ajout d'un champ, ou une
correction de bug. ADR conseillé quand la question "pourquoi n'a-t-on pas fait X à la place ?"
mérite une réponse écrite plutôt qu'un "il faudra que je m'en souvienne" — typiquement : choix de
stack, modèle de données structurant, politique de sécurité/verrouillage, ou renoncement
explicite à une solution par ailleurs "évidente".

Numérotation séquentielle, jamais réutilisée même si un ADR est plus tard remplacé (le
remplaçant référence l'ancien plutôt que de réutiliser son numéro).

## Index

- [0001 — SQLite + verrouillage applicatif plutôt qu'un serveur central](0001-sqlite-et-verrouillage-applicatif.md)
- [0002 — Pas de signature Authenticode de l'installeur](0002-pas-de-signature-authenticode.md)
