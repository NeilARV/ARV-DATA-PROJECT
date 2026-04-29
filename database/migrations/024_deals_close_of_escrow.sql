-- Add close_of_escrow column to deals table
ALTER TABLE deals
ADD COLUMN close_of_escrow NUMERIC(15, 2);
