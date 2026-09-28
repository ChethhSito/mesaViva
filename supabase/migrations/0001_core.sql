-- Run in the Supabase SQL editor. Browser clients receive no direct table grants.
create extension if not exists pgcrypto;

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  currency text not null default 'PEN',
  timezone text not null default 'America/Lima',
  created_at timestamptz not null default now()
);
create table public.restaurant_members (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('ADMIN','WAITER','KITCHEN','CASHIER','FINANCE')),
  created_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  qr_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, name)
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (restaurant_id, name)
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  name text not null,
  description text not null default '',
  image_url text,
  allergens text not null default '',
  price numeric(12,2) not null check (price >= 0),
  available boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  table_id uuid not null references public.restaurant_tables(id),
  customer_name text,
  status text not null default 'OPEN' check (status in ('OPEN','IN_SERVICE','BILL_REQUESTED','PAYMENT_PENDING','PAID','CLOSED','CANCELLED')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users(id)
);
create unique index one_active_session_per_table on public.table_sessions(table_id)
  where status not in ('CLOSED','CANCELLED');
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  table_session_id uuid not null references public.table_sessions(id),
  order_number bigint generated always as identity,
  source text not null check (source in ('QR','WAITER')),
  status text not null default 'NEW' check (status in ('NEW','PREPARING','READY','DELIVERED','CANCELLED')),
  idempotency_key uuid not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (restaurant_id, idempotency_key)
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  product_id uuid not null references public.products(id),
  product_name_snapshot text not null,
  unit_price numeric(12,2) not null,
  quantity integer not null check (quantity between 1 and 99),
  notes text not null default '',
  status text not null default 'PENDING' check (status in ('PENDING','PREPARING','READY','DELIVERED','CANCELLED')),
  created_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  table_session_id uuid not null unique references public.table_sessions(id),
  amount numeric(12,2) not null check (amount >= 0),
  method text not null check (method in ('CASH','PHYSICAL_POS','YAPE','PLIN','OTHER')),
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now()
);
create table public.financial_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  payment_id uuid not null unique references public.payments(id),
  type text not null check (type in ('SALE','REFUND','ADJUSTMENT')),
  amount numeric(12,2) not null,
  description text not null,
  created_at timestamptz not null default now()
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id),
  actor_user_id uuid references auth.users(id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index on public.restaurant_tables(restaurant_id);
create index on public.products(restaurant_id, category_id);
create index on public.orders(table_session_id, created_at);
create index on public.order_items(order_id);
create index on public.table_sessions(restaurant_id, status);
create index on public.financial_movements(restaurant_id, created_at);

-- All access goes through authenticated Next.js routes. The service key stays on the server.
do $$ declare t text; begin
  foreach t in array array['restaurants','restaurant_members','restaurant_tables','categories','products','table_sessions','orders','order_items','payments','financial_movements','audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

create or replace function public.place_order(
  p_slug text, p_token text, p_customer_name text, p_items jsonb,
  p_idempotency_key uuid, p_source text, p_actor uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_restaurant uuid; v_table uuid; v_session uuid; v_order uuid;
  v_item jsonb; v_product record; v_quantity integer; v_notes text;
begin
  if p_source not in ('QR','WAITER') then raise exception 'Invalid order source'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception 'Order must have 1 to 50 items';
  end if;
  select r.id, t.id into v_restaurant, v_table
    from public.restaurants r join public.restaurant_tables t on t.restaurant_id = r.id
    where r.slug = p_slug and t.qr_token = p_token and t.enabled
    for update of t;
  if v_table is null then raise exception 'Table not found'; end if;
  select id into v_order from public.orders
    where restaurant_id = v_restaurant and idempotency_key = p_idempotency_key;
  if v_order is not null then
    if not exists (
      select 1 from public.orders o join public.table_sessions s on s.id = o.table_session_id
      where o.id = v_order and s.table_id = v_table
    ) then raise exception 'Idempotency key belongs to another table'; end if;
    return v_order;
  end if;
  select id into v_session from public.table_sessions
    where table_id = v_table and status in ('OPEN','IN_SERVICE') for update;
  if v_session is null then
    if exists (select 1 from public.table_sessions where table_id = v_table and status not in ('CLOSED','CANCELLED')) then
      raise exception 'This table is awaiting payment';
    end if;
    insert into public.table_sessions(restaurant_id, table_id, customer_name)
      values (v_restaurant, v_table, nullif(left(trim(p_customer_name),80),'')) returning id into v_session;
  end if;
  insert into public.orders(restaurant_id, table_session_id, source, idempotency_key, created_by)
    values (v_restaurant, v_session, p_source, p_idempotency_key, p_actor) returning id into v_order;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if not (v_item ? 'productId') or not (v_item ? 'quantity') then raise exception 'Invalid item'; end if;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 99 then raise exception 'Invalid quantity'; end if;
    v_notes := left(coalesce(v_item->>'notes',''),300);
    select id, name, price into v_product from public.products
      where id = (v_item->>'productId')::uuid and restaurant_id = v_restaurant and available and active;
    if not found then raise exception 'A product is unavailable'; end if;
    insert into public.order_items(order_id,product_id,product_name_snapshot,unit_price,quantity,notes)
      values (v_order,v_product.id,v_product.name,v_product.price,v_quantity,v_notes);
  end loop;
  update public.table_sessions set status = 'IN_SERVICE' where id = v_session;
  return v_order;
end $$;

create or replace function public.request_bill(p_slug text, p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_session uuid;
begin
  select s.id into v_session from public.table_sessions s
    join public.restaurant_tables t on t.id = s.table_id
    join public.restaurants r on r.id = s.restaurant_id
    where r.slug = p_slug and t.qr_token = p_token and t.enabled
      and s.status in ('OPEN','IN_SERVICE','BILL_REQUESTED','PAYMENT_PENDING')
    for update of s;
  if v_session is null then raise exception 'No open account'; end if;
  if not exists (select 1 from public.orders where table_session_id = v_session) then raise exception 'No orders on this account'; end if;
  update public.table_sessions set status = 'BILL_REQUESTED' where id = v_session and status in ('OPEN','IN_SERVICE');
  return v_session;
end $$;

create or replace function public.confirm_payment(p_session uuid, p_method text, p_actor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_session record; v_total numeric(12,2); v_payment uuid;
begin
  select * into v_session from public.table_sessions where id = p_session for update;
  if not found or v_session.status not in ('BILL_REQUESTED','PAYMENT_PENDING') then raise exception 'Account is not ready for payment'; end if;
  if p_method not in ('CASH','PHYSICAL_POS','YAPE','PLIN','OTHER') then raise exception 'Invalid payment method'; end if;
  select coalesce(sum(i.unit_price * i.quantity),0) into v_total
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.table_session_id = p_session and i.status <> 'CANCELLED' and o.status <> 'CANCELLED';
  insert into public.payments(restaurant_id, table_session_id, amount, method, confirmed_by)
    values (v_session.restaurant_id,p_session,v_total,p_method,p_actor) returning id into v_payment;
  insert into public.financial_movements(restaurant_id,payment_id,type,amount,description)
    values (v_session.restaurant_id,v_payment,'SALE',v_total,'Venta de mesa');
  update public.table_sessions set status = 'PAID' where id = p_session;
  insert into public.audit_logs(restaurant_id,actor_user_id,event_type,entity_type,entity_id)
    values (v_session.restaurant_id,p_actor,'PAYMENT_CONFIRMED','payment',v_payment);
  return v_payment;
end $$;

create or replace function public.close_table(p_session uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_restaurant uuid;
begin
  update public.table_sessions set status = 'CLOSED', closed_at = now(), closed_by = p_actor
    where id = p_session and status = 'PAID' returning restaurant_id into v_restaurant;
  if v_restaurant is null then raise exception 'Payment must be confirmed before closing'; end if;
  insert into public.audit_logs(restaurant_id,actor_user_id,event_type,entity_type,entity_id)
    values (v_restaurant,p_actor,'TABLE_CLOSED','table_session',p_session);
end $$;

revoke all on function public.place_order(text,text,text,jsonb,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.request_bill(text,text) from public, anon, authenticated;
revoke all on function public.confirm_payment(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.close_table(uuid,uuid) from public, anon, authenticated;
grant execute on function public.place_order(text,text,text,jsonb,uuid,text,uuid) to service_role;
grant execute on function public.request_bill(text,text) to service_role;
grant execute on function public.confirm_payment(uuid,text,uuid) to service_role;
grant execute on function public.close_table(uuid,uuid) to service_role;
