-- Matière d'une caisse en stock : « Bois » ou « Contreplaqué », choisie dans « Gérer les
-- caisses » (obligatoire à la création et à la modification, décision du 2026-10-05). Vide pour
-- les caisses existantes : elles la reçoivent à leur prochaine modification.
ALTER TABLE caisse_stock ADD COLUMN matiere TEXT NOT NULL DEFAULT '';
