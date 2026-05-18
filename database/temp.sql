-- Null out existing values first (they're decimal numbers, not valid dates)
UPDATE deals SET close_of_escrow = NULL WHERE close_of_escrow IS NOT NULL;

-- Then change the column type
ALTER TABLE deals ALTER COLUMN close_of_escrow TYPE date USING NULL;
