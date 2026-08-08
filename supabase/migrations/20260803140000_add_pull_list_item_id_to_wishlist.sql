ALTER TABLE wishlist
  ADD COLUMN IF NOT EXISTS pull_list_item_id uuid REFERENCES pull_list_items(id) ON DELETE SET NULL;
