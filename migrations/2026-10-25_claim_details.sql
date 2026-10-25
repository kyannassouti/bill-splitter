-- Remember how each claim was entered, not just its size, so the item card can
-- show it back exactly: "2 pizzas, split 3 ways, covering 2 shares".
-- Additive only: proportion stays the source of truth for every total.

alter table item_shares
  add column units_count integer check (units_count >= 0),     -- how many of the item
  add column split_ways integer check (split_ways >= 1),       -- people splitting them (1 = just me; null = custom percent)
  add column shares_covered integer check (shares_covered >= 1); -- shares of that split this person pays for
