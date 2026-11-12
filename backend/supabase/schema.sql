-- Delivery Dispatch Agent: Supabase schema
-- Run this whole file in Supabase Dashboard -> SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  vehicle_type text not null default 'bike' check (vehicle_type in ('bike','scooter','car','van')),
  capacity_kg numeric not null default 20 check (capacity_kg > 0),
  status text not null default 'available' check (status in ('available','busy','offline','on_break')),
  max_active_orders int not null default 3 check (max_active_orders > 0),
  rating numeric(2,1) not null default 4.5,
  created_at timestamptz not null default now()
);

create table if not exists driver_locations (
  id bigint generated always as identity primary key,
  driver_id uuid not null references drivers(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  speed_kmh numeric not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists idx_driver_locations_latest on driver_locations (driver_id, updated_at desc);

-- Latest known position per driver
create or replace view driver_latest_location as
  select distinct on (driver_id) driver_id, lat, lng, speed_kmh, updated_at
  from driver_locations
  order by driver_id, updated_at desc, id desc;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  customer_phone text,
  pickup_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  drop_address text not null,
  drop_lat double precision not null,
  drop_lng double precision not null,
  weight_kg numeric not null default 1 check (weight_kg > 0),
  priority text not null default 'normal' check (priority in ('normal','urgent')),
  time_window_end timestamptz,
  status text not null default 'pending'
    check (status in ('pending','assigned','picked_up','in_transit','delivered','failed','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists idx_orders_status on orders (status);

create table if not exists deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  driver_id uuid not null references drivers(id),
  status text not null default 'assigned'
    check (status in ('assigned','picked_up','in_transit','delivered','failed','cancelled','released')),
  assigned_by text not null default 'system',
  assigned_at timestamptz not null default now(),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  planned_eta timestamptz,
  eta timestamptz,
  distance_m numeric,
  duration_s numeric,
  route_polyline text,
  delay_minutes int not null default 0
);
create index if not exists idx_deliveries_status on deliveries (status);
create index if not exists idx_deliveries_driver on deliveries (driver_id);
-- An order can have only one live delivery at a time (prevents double assignment)
create unique index if not exists one_live_delivery_per_order
  on deliveries (order_id) where status in ('assigned','picked_up','in_transit');

create table if not exists delivery_events (
  id bigint generated always as identity primary key,
  type text not null,
  message text not null,
  order_id uuid references orders(id) on delete set null,
  delivery_id uuid references deliveries(id) on delete set null,
  driver_id uuid references drivers(id) on delete set null,
  created_by text not null default 'system',
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_events_created on delivery_events (created_at desc);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text,
  instruction text,
  tool_calls jsonb,
  output text,
  status text,
  created_at timestamptz not null default now()
);

-- Realtime so the React app can subscribe to live changes
alter publication supabase_realtime add table orders, deliveries, driver_locations, delivery_events;

-- Row Level Security: writes only via backend (service role bypasses RLS).
-- The frontend may READ with the anon key (needed for Realtime subscriptions).
alter table drivers enable row level security;
alter table driver_locations enable row level security;
alter table orders enable row level security;
alter table deliveries enable row level security;
alter table delivery_events enable row level security;
alter table agent_runs enable row level security;

create policy "anon read drivers" on drivers for select to anon using (true);
create policy "anon read driver_locations" on driver_locations for select to anon using (true);
create policy "anon read orders" on orders for select to anon using (true);
create policy "anon read deliveries" on deliveries for select to anon using (true);
create policy "anon read delivery_events" on delivery_events for select to anon using (true);
grant select on driver_latest_location to anon;
