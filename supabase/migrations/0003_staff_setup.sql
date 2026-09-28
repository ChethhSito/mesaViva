create or replace function public.create_restaurant(p_name text, p_slug text, p_actor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if length(trim(p_name)) < 2 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Invalid restaurant details';
  end if;
  if exists (select 1 from public.restaurant_members where user_id = p_actor) then
    raise exception 'User already belongs to a restaurant';
  end if;
  insert into public.restaurants(name,slug) values (trim(p_name),p_slug) returning id into v_id;
  insert into public.restaurant_members(restaurant_id,user_id,role) values (v_id,p_actor,'ADMIN');
  return v_id;
end $$;
revoke all on function public.create_restaurant(text,text,uuid) from public, anon, authenticated;
grant execute on function public.create_restaurant(text,text,uuid) to service_role;
