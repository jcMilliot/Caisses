ALTER TABLE demande_caisse ADD COLUMN type_ouverture TEXT NOT NULL DEFAULT '';
ALTER TABLE demande_caisse ADD COLUMN stock TEXT NOT NULL DEFAULT '';
ALTER TABLE demande_caisse ADD COLUMN quantite INTEGER NOT NULL DEFAULT 1;
ALTER TABLE demande_caisse ADD COLUMN moteurs TEXT NOT NULL DEFAULT '';
ALTER TABLE demande_caisse ADD COLUMN module_lineaire TEXT NOT NULL DEFAULT '';
ALTER TABLE demande_caisse ADD COLUMN informations_supp TEXT NOT NULL DEFAULT '';
ALTER TABLE demande_caisse ADD COLUMN observations TEXT NOT NULL DEFAULT '';
