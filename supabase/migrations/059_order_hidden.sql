-- A user can take a paid order off their own "Your orders" list. The payment
-- row stays (it is the receipt and feeds the revenue figures); it is only hidden.
alter table public.manual_payments add column if not exists hidden_at timestamptz;
