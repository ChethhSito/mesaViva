-- Tiny invalidation events carry no order or customer data. Clients refetch through authorized API routes.
create or replace function public.can_receive_restaurant_topic(p_topic text, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_topic ~ '^restaurant:[0-9a-f-]{36}$'
    and exists (
      select 1 from public.restaurant_members
      where user_id = p_user and restaurant_id::text = split_part(p_topic, ':', 2)
    );
$$;
revoke all on function public.can_receive_restaurant_topic(text,uuid) from public, anon;
grant execute on function public.can_receive_restaurant_topic(text,uuid) to authenticated;

create policy "restaurant members receive refreshes" on realtime.messages
  for select to authenticated
  using (extension = 'broadcast' and public.can_receive_restaurant_topic((select realtime.topic()), (select auth.uid())));

create or replace function public.notify_restaurant_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_restaurant uuid; v_table uuid; v_token text; v_session uuid;
begin
  if TG_TABLE_NAME = 'products' or TG_TABLE_NAME = 'categories' then
    v_restaurant := new.restaurant_id;
    perform realtime.send('{}'::jsonb, 'refresh', 'menu:' || v_restaurant::text, false);
  elsif TG_TABLE_NAME = 'restaurant_tables' then
    v_restaurant := new.restaurant_id;
    v_table := new.id;
  elsif TG_TABLE_NAME = 'table_sessions' then
    v_restaurant := new.restaurant_id;
    v_table := new.table_id;
  elsif TG_TABLE_NAME = 'orders' then
    v_restaurant := new.restaurant_id;
    v_session := new.table_session_id;
  elsif TG_TABLE_NAME = 'order_items' then
    select o.restaurant_id, o.table_session_id into v_restaurant, v_session
      from public.orders o where o.id = new.order_id;
  elsif TG_TABLE_NAME = 'payments' then
    v_restaurant := new.restaurant_id;
    v_session := new.table_session_id;
  end if;
  if v_session is not null then
    select table_id into v_table from public.table_sessions where id = v_session;
  end if;
  if v_table is not null then
    select qr_token into v_token from public.restaurant_tables where id = v_table;
    perform realtime.send('{}'::jsonb, 'refresh', 'table:' || v_token, false);
  end if;
  if v_restaurant is not null then
    perform realtime.send('{}'::jsonb, 'refresh', 'restaurant:' || v_restaurant::text, true);
  end if;
  return new;
end $$;

create trigger products_refresh after insert or update on public.products
  for each row execute function public.notify_restaurant_change();
create trigger categories_refresh after insert or update on public.categories
  for each row execute function public.notify_restaurant_change();
create trigger tables_refresh after insert or update on public.restaurant_tables
  for each row execute function public.notify_restaurant_change();
create trigger sessions_refresh after insert or update on public.table_sessions
  for each row execute function public.notify_restaurant_change();
create trigger orders_refresh after insert or update on public.orders
  for each row execute function public.notify_restaurant_change();
create trigger items_refresh after insert or update on public.order_items
  for each row execute function public.notify_restaurant_change();
create trigger payments_refresh after insert on public.payments
  for each row execute function public.notify_restaurant_change();
