-- Migration 010: Add arv and notes columns to deals table
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS potential_arv DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS notes TEXT;
