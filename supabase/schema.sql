-- Honey Order + Invoice Management App
-- Run this in Supabase SQL Editor on a new project.

create extension if not exists pgcrypto;

-- Number sequences
create sequence if not exists public.honey_order_seq start 1;
create sequence if not exists public.honey_invoice_seq start 1;

-- Profiles / admin users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Business settings
create table if not exists public.business_settings (
  id smallint primary key default 1 check (id = 1),
  business_name text not null default 'Pure Honey',
  phone text,
  email text,
  address text,
  delivery_charge numeric(10,2) not null default 0 check (delivery_charge >= 0),
  updated_at timestamptz not null default now()
);

insert into public.business_settings (id, business_name, delivery_charge)
values (1, 'Pure Honey', 0)
on conflict (id) do nothing;

-- Three product variants only
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null default 'Pure Honey',
  size_label text not null,
  grams integer not null check (grams > 0),
  price numeric(10,2) not null check (price >= 0),
  available_quantity integer not null default 0 check (available_quantity >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.products (sku, name, size_label, grams, price, available_quantity, active, sort_order)
values
  ('HONEY-250', 'Pure Honey', '250 g', 250, 200, 0, true, 1),
  ('HONEY-500', 'Pure Honey', '500 g', 500, 350, 0, true, 2),
  ('HONEY-1000', 'Pure Honey', '1 kg', 1000, 600, 0, true, 3)
on conflict (sku) do nothing;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_name text not null,
  mobile text not null,
  whatsapp text not null,
  address text not null,
  city text not null,
  state text not null,
  pin_code text not null,
  subtotal numeric(10,2) not null default 0,
  delivery_charge numeric(10,2) not null default 0,
  grand_total numeric(10,2) not null default 0,
  status text not null default 'New' check (status in ('New','Confirmed','Packed','Shipped','Delivered','Cancelled')),
  stock_deducted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  size_label text not null,
  quantity integer not null check (quantity > 0),
  rate numeric(10,2) not null check (rate >= 0),
  amount numeric(10,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on public.order_items(order_id);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  issued_at timestamptz not null default now(),
  subtotal numeric(10,2) not null,
  delivery_charge numeric(10,2) not null,
  grand_total numeric(10,2) not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists invoices_created_at_idx on public.invoices(created_at desc);

-- Generic updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists business_settings_set_updated_at on public.business_settings;
create trigger business_settings_set_updated_at before update on public.business_settings
for each row execute function public.set_updated_at();

-- Create a profile automatically for every Supabase Auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Admin helper. Security definer avoids recursive RLS checks.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Public customer order RPC. Customers never insert directly into tables.
create or replace function public.place_order(
  p_product_id uuid,
  p_quantity integer,
  p_customer_name text,
  p_mobile text,
  p_whatsapp text,
  p_address text,
  p_city text,
  p_state text,
  p_pin_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_order_id uuid;
  v_invoice public.invoices%rowtype;
  v_order_number text;
  v_subtotal numeric(10,2);
  v_delivery numeric(10,2);
  v_total numeric(10,2);
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1.';
  end if;

  if nullif(trim(p_customer_name), '') is null
     or coalesce(p_mobile, '') !~ '^[0-9]{10}$'
     or coalesce(p_whatsapp, '') !~ '^[0-9]{10}$'
     or nullif(trim(p_address), '') is null
     or nullif(trim(p_city), '') is null
     or nullif(trim(p_state), '') is null
     or coalesce(p_pin_code, '') !~ '^[0-9]{6}$' then
    raise exception 'Please provide valid customer and delivery details.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;
  if not v_product.active or v_product.available_quantity <= 0 then
    raise exception 'This size is currently out of stock.';
  end if;
  if p_quantity > v_product.available_quantity then
    raise exception 'Only % bottle(s) are currently available.', v_product.available_quantity;
  end if;

  v_order_number := 'HON-' || (select repeat('0', greatest(0, 4 - length(n))) || n from (select nextval('public.honey_order_seq')::text n) seq);
  v_subtotal := v_product.price * p_quantity;
  select delivery_charge into v_delivery from public.business_settings where id = 1;
  v_delivery := coalesce(v_delivery, 0);
  v_total := v_subtotal + v_delivery;

  -- Reserve stock immediately when the customer places the order.
  -- The row lock above prevents two customers from overselling the same stock.
  update public.products
  set available_quantity = available_quantity - p_quantity
  where id = v_product.id;

  insert into public.orders (
    order_number, customer_name, mobile, whatsapp, address, city, state, pin_code,
    subtotal, delivery_charge, grand_total, status, stock_deducted
  ) values (
    v_order_number, trim(p_customer_name), p_mobile, p_whatsapp, trim(p_address), trim(p_city), trim(p_state), p_pin_code,
    v_subtotal, v_delivery, v_total, 'New', true
  ) returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, size_label, quantity, rate, amount)
  values (v_order_id, v_product.id, v_product.name, v_product.size_label, p_quantity, v_product.price, v_subtotal);

  -- Same transaction as the order and stock reservation: failure rolls everything back.
  insert into public.invoices (invoice_number, order_id, subtotal, delivery_charge, grand_total)
  values ('INV-' || (select repeat('0', greatest(0, 4 - length(n))) || n from (select nextval('public.honey_invoice_seq')::text n) seq),
          v_order_id, v_subtotal, v_delivery, v_total)
  returning * into v_invoice;

  return jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'order', (select to_jsonb(o) || jsonb_build_object('order_items',
      (select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id = v_order_id))
      from public.orders o where o.id = v_order_id),
    'settings', (select to_jsonb(s) from public.business_settings s where s.id = 1),
    'id', v_order_id,
    'order_number', v_order_number,
    'grand_total', v_total
  );
end;
$$;

revoke all on function public.place_order(uuid,integer,text,text,text,text,text,text,text) from public;
grant execute on function public.place_order(uuid,integer,text,text,text,text,text,text,text) to anon, authenticated;

-- Stock is reserved immediately when place_order creates the order.
-- This trigger restores stock if an order is cancelled, and re-deducts it only if a cancelled order is reopened.
create or replace function public.handle_order_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_available integer;
begin
  if new.status in ('Confirmed','Packed','Shipped','Delivered') and old.stock_deducted = false then
    for v_item in select product_id, quantity from public.order_items where order_id = old.id loop
      select available_quantity into v_available
      from public.products
      where id = v_item.product_id
      for update;

      if v_available < v_item.quantity then
        raise exception 'Insufficient stock to confirm this order.';
      end if;

      update public.products
      set available_quantity = available_quantity - v_item.quantity
      where id = v_item.product_id;
    end loop;
    new.stock_deducted := true;
  elsif new.status = 'Cancelled' and old.stock_deducted = true then
    for v_item in select product_id, quantity from public.order_items where order_id = old.id loop
      update public.products
      set available_quantity = available_quantity + v_item.quantity
      where id = v_item.product_id;
    end loop;
    new.stock_deducted := false;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_manage_stock on public.orders;
create trigger orders_manage_stock
before update of status on public.orders
for each row execute function public.handle_order_stock();

-- Admin-only invoice creation; idempotent (one invoice per order).
create or replace function public.create_invoice(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_invoice public.invoices%rowtype;
  v_number text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;

  -- Serialize concurrent admin requests before checking for an existing invoice.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;
  select * into v_invoice from public.invoices where order_id = p_order_id;
  if found then
    return to_jsonb(v_invoice);
  end if;
  if v_order.status = 'Cancelled' then
    raise exception 'Cancelled orders cannot be invoiced.';
  end if;

  v_number := 'INV-' || (select repeat('0', greatest(0, 4 - length(n))) || n from (select nextval('public.honey_invoice_seq')::text n) seq);

  insert into public.invoices (invoice_number, order_id, subtotal, delivery_charge, grand_total, created_by)
  values (v_number, v_order.id, v_order.subtotal, v_order.delivery_charge, v_order.grand_total, auth.uid())
  returning * into v_invoice;

  return to_jsonb(v_invoice);
end;
$$;

revoke all on function public.create_invoice(uuid) from public;
grant execute on function public.create_invoice(uuid) to authenticated;

-- Minimal API grants. RLS policies below still decide which rows are visible or writable.
grant select on public.products, public.business_settings to anon, authenticated;
grant select on public.profiles, public.orders, public.order_items, public.invoices to authenticated;
grant update on public.products, public.business_settings, public.orders, public.profiles to authenticated;

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.business_settings enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.invoices enable row level security;

-- Profiles: a signed-in user can see own role; admin can see all. Only admin can update.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Business settings: public read, admin update.
drop policy if exists settings_public_read on public.business_settings;
create policy settings_public_read on public.business_settings for select to anon, authenticated using (true);

drop policy if exists settings_admin_update on public.business_settings;
create policy settings_admin_update on public.business_settings for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Products: public read, admin update. No public insert/delete needed.
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select to anon, authenticated using (true);

drop policy if exists products_admin_update on public.products;
create policy products_admin_update on public.products for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Orders and items: admin can read/update; customers use place_order RPC and cannot read rows.
drop policy if exists orders_admin_select on public.orders;
create policy orders_admin_select on public.orders for select to authenticated using (public.is_admin());

drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists items_admin_select on public.order_items;
create policy items_admin_select on public.order_items for select to authenticated using (public.is_admin());

-- Invoices: admin only.
drop policy if exists invoices_admin_select on public.invoices;
create policy invoices_admin_select on public.invoices for select to authenticated using (public.is_admin());

drop policy if exists invoices_admin_insert on public.invoices;
create policy invoices_admin_insert on public.invoices for insert to authenticated with check (public.is_admin());

drop policy if exists invoices_admin_update on public.invoices;
create policy invoices_admin_update on public.invoices for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Realtime orders for the admin dashboard.
do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then null;
end $$;

-- After running this schema:
-- 1) Create your admin user in Supabase Dashboard -> Authentication -> Users.
-- 2) Promote that user by running:
--    update public.profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
--
-- If the admin auth user existed BEFORE this schema/trigger, run once:
-- insert into public.profiles (id, full_name, role)
-- select id, coalesce(raw_user_meta_data->>'full_name','Admin'), 'admin'
-- from auth.users where email = 'YOUR_ADMIN_EMAIL'
-- on conflict (id) do update set role = 'admin';

-- Existing V3 database: run this entire migration once (safe to rerun).
begin;
create table if not exists public.coupons (
 id uuid primary key default gen_random_uuid(),
 code text unique not null check (code = upper(trim(code)) and code ~ '^[A-Z0-9_-]{3,24}$'),
 kind text not null check (kind in ('percent','fixed')),
 value numeric(10,2) not null check (value > 0),
 min_order numeric(10,2) not null default 0 check (min_order >= 0),
 max_discount numeric(10,2) check (max_discount > 0),
 expires_at timestamptz,
 usage_limit integer check (usage_limit > 0),
 per_customer_limit integer check (per_customer_limit > 0),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 check (kind <> 'percent' or value <= 100)
);
alter table public.orders add column if not exists coupon_id uuid references public.coupons(id);
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0);
alter table public.invoices add column if not exists coupon_code text;
alter table public.invoices add column if not exists discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0);
create index if not exists orders_coupon_mobile_idx on public.orders(coupon_id,mobile);
create index if not exists orders_mobile_idx on public.orders(mobile);
create table if not exists public.payments (
 id uuid primary key default gen_random_uuid(),
 request_id uuid unique not null,
 order_id uuid not null references public.orders(id),
 kind text not null check (kind in ('payment','refund')),
 amount numeric(10,2) not null check (amount > 0),
 method text not null check (method in ('Cash','UPI','Bank')),
 paid_at timestamptz not null,
 note text not null default '',
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists payments_order_idx on public.payments(order_id);
create table if not exists public.activity_log (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid,
 entity text not null,
 entity_id uuid not null,
 action text not null,
 details jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.coupons enable row level security;
alter table public.payments enable row level security;
alter table public.activity_log enable row level security;
revoke all on public.coupons, public.payments, public.activity_log from anon, authenticated;
grant select,insert,update on public.coupons to authenticated;
grant select on public.payments, public.activity_log to authenticated;
drop policy if exists coupons_admin on public.coupons;
create policy coupons_admin on public.coupons to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists payments_admin on public.payments;
create policy payments_admin on public.payments for select to authenticated using (public.is_admin());
drop policy if exists activity_admin on public.activity_log;
create policy activity_admin on public.activity_log for select to authenticated using (public.is_admin());
-- Preserve financial/customer snapshots; clients may change only order status.
revoke update on public.orders from authenticated;
grant update(status) on public.orders to authenticated;
revoke insert,update,delete on public.invoices from authenticated;

create or replace function public.coupon_amount(p_code text,p_subtotal numeric,p_mobile text)
returns numeric language plpgsql security definer set search_path=public as $$
declare c public.coupons%rowtype; d numeric;
begin
 if nullif(trim(p_code),'') is null then return 0; end if;
 select * into c from public.coupons where code=upper(trim(p_code)) for update;
 if not found or not c.active or (c.expires_at is not null and c.expires_at <= now()) then raise exception 'Coupon is invalid or expired.'; end if;
 if p_subtotal < c.min_order then raise exception 'Minimum order amount for this coupon is Rs. %.',c.min_order; end if;
 if c.usage_limit is not null and (select count(*) from public.orders where coupon_id=c.id) >= c.usage_limit then raise exception 'Coupon usage limit reached.'; end if;
 if c.per_customer_limit is not null and (select count(*) from public.orders where coupon_id=c.id and mobile=p_mobile) >= c.per_customer_limit then raise exception 'Coupon already used for this mobile number.'; end if;
 d := case when c.kind='percent' then round(p_subtotal*c.value/100,2) else c.value end;
 return least(p_subtotal,d,coalesce(c.max_discount,d));
end; $$;
revoke all on function public.coupon_amount(text,numeric,text) from public,anon,authenticated;

create or replace function public.quote_order(p_product_id uuid,p_quantity integer,p_mobile text,p_coupon_code text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.products%rowtype; s numeric; d numeric; delivery numeric;
begin
 if p_quantity is null or p_quantity<1 or coalesce(p_mobile,'') !~ '^[0-9]{10}$' then raise exception 'Enter a valid mobile number and quantity first.'; end if;
 select * into p from public.products where id=p_product_id;
 if not found or not p.active or p.available_quantity<p_quantity then raise exception 'Requested stock is unavailable.'; end if;
 s:=p.price*p_quantity;
 d:=public.coupon_amount(p_coupon_code,s,p_mobile);
 select delivery_charge into delivery from public.business_settings where id=1;
 return jsonb_build_object('subtotal',s,'discount_amount',d,'delivery_charge',coalesce(delivery,0),'grand_total',s-d+coalesce(delivery,0),'coupon_code',nullif(upper(trim(p_coupon_code)),''));
end; $$;
revoke all on function public.quote_order(uuid,integer,text,text) from public;
grant execute on function public.quote_order(uuid,integer,text,text) to anon,authenticated;

create or replace function public.record_payment(p_request_id uuid,p_order_id uuid,p_kind text,p_amount numeric,p_method text,p_paid_at timestamptz,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype; existing public.payments%rowtype; net numeric;
begin
 if not public.is_admin() then raise exception 'Admin access required.'; end if;
 if p_request_id is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_kind is null or p_kind not in ('payment','refund') or p_method is null or p_method not in ('Cash','UPI','Bank') or p_paid_at is null or p_paid_at>now()+interval '5 minutes' then raise exception 'Enter a valid amount, method and payment date.'; end if;
 -- A request ID locks even when retries accidentally name different orders.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into existing from public.payments where request_id=p_request_id;
 if found then
  if existing.order_id<>p_order_id or existing.kind<>p_kind or existing.amount<>p_amount or existing.method<>p_method or existing.paid_at<>p_paid_at or existing.note<>coalesce(p_note,'') then raise exception 'This request was already used for different payment details. Refresh before creating another entry.'; end if;
  return to_jsonb(existing);
 end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found.'; end if;
 if p_paid_at<o.created_at-interval '5 minutes' then raise exception 'Payment date cannot precede the order.'; end if;
 select coalesce(sum(case when kind='payment' then amount else -amount end),0) into net from public.payments where order_id=o.id;
 if p_kind='payment' and (o.status='Cancelled' or net+p_amount>o.grand_total) then raise exception 'Payment exceeds the balance or order is cancelled.'; end if;
 if p_kind='refund' and p_amount>net then raise exception 'Refund exceeds money held for this order.'; end if;
 insert into public.payments(request_id,order_id,kind,amount,method,paid_at,note,created_by)
 values(p_request_id,o.id,p_kind,p_amount,p_method,p_paid_at,left(coalesce(p_note,''),500),auth.uid()) returning * into existing;
 return to_jsonb(existing);
end; $$;
revoke all on function public.record_payment(uuid,uuid,text,numeric,text,timestamptz,text) from public,anon;
grant execute on function public.record_payment(uuid,uuid,text,numeric,text,timestamptz,text) to authenticated;

create or replace function public.audit_business_change() returns trigger language plpgsql security definer set search_path=public as $$
declare detail jsonb;
begin
 if tg_table_name='orders' then
  if new.status is not distinct from old.status then return new; end if;
  detail:=jsonb_build_object('from',old.status,'to',new.status,'order_number',new.order_number);
 elsif tg_table_name='payments' then
  detail:=jsonb_build_object('kind',new.kind,'amount',new.amount,'method',new.method,'order_id',new.order_id);
 else
  detail:=jsonb_build_object('after',to_jsonb(new),'before',case when tg_op='UPDATE' then to_jsonb(old) else null end);
 end if;
 insert into public.activity_log(actor_id,entity,entity_id,action,details) values(auth.uid(),tg_table_name,new.id,tg_op,detail);
 return new;
end; $$;
revoke all on function public.audit_business_change() from public,anon,authenticated;
drop trigger if exists audit_orders on public.orders;
create trigger audit_orders after update of status on public.orders for each row execute function public.audit_business_change();
drop trigger if exists audit_payments on public.payments;
create trigger audit_payments after insert on public.payments for each row execute function public.audit_business_change();
drop trigger if exists audit_coupons on public.coupons;
create trigger audit_coupons after insert or update on public.coupons for each row execute function public.audit_business_change();

-- Protected report payload. No PostgREST 1,000-row truncation of lifetime totals.
create or replace function public.admin_business_data() returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required.'; end if;
 return jsonb_build_object(
  'orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from public.orders o),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.paid_at desc) from public.payments p),'[]'::jsonb),
  'coupons',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from public.coupons c),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order) from public.products p),'[]'::jsonb),
  'activity',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select * from public.activity_log order by created_at desc limit 200) a),'[]'::jsonb),
  'admins',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(full_name,''),id::text))) from public.profiles where role='admin'),'[]'::jsonb)
 );
end; $$;
revoke all on function public.admin_business_data() from public,anon;
grant execute on function public.admin_business_data() to authenticated;

-- Replace the old signature to avoid ambiguous RPC overloads.
drop function if exists public.place_order(uuid,integer,text,text,text,text,text,text,text);
create or replace function public.place_order(
  p_product_id uuid,
  p_quantity integer,
  p_customer_name text,
  p_mobile text,
  p_whatsapp text,
  p_address text,
  p_city text,
  p_state text,
  p_pin_code text,
  p_coupon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_order_id uuid;
  v_invoice public.invoices%rowtype;
  v_order_number text;
  v_subtotal numeric(10,2);
  v_delivery numeric(10,2);
  v_total numeric(10,2);
  v_discount numeric(10,2);
  v_coupon_id uuid;
  v_coupon_code text;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1.';
  end if;

  if nullif(trim(p_customer_name), '') is null
     or coalesce(p_mobile, '') !~ '^[0-9]{10}$'
     or coalesce(p_whatsapp, '') !~ '^[0-9]{10}$'
     or nullif(trim(p_address), '') is null
     or nullif(trim(p_city), '') is null
     or nullif(trim(p_state), '') is null
     or coalesce(p_pin_code, '') !~ '^[0-9]{6}$' then
    raise exception 'Please provide valid customer and delivery details.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;
  if not v_product.active or v_product.available_quantity <= 0 then
    raise exception 'This size is currently out of stock.';
  end if;
  if p_quantity > v_product.available_quantity then
    raise exception 'Only % bottle(s) are currently available.', v_product.available_quantity;
  end if;

  v_order_number := 'HON-' || (select repeat('0', greatest(0, 4 - length(n))) || n from (select nextval('public.honey_order_seq')::text n) seq);
  v_subtotal := v_product.price * p_quantity;
  select delivery_charge into v_delivery from public.business_settings where id = 1;
  v_delivery := coalesce(v_delivery, 0);
  v_coupon_code := nullif(upper(trim(p_coupon_code)), '');
  v_discount := public.coupon_amount(v_coupon_code,v_subtotal,p_mobile);
  select id into v_coupon_id from public.coupons where code=v_coupon_code;
  v_total := v_subtotal - v_discount + v_delivery;

  -- Reserve stock immediately when the customer places the order.
  -- The row lock above prevents two customers from overselling the same stock.
  update public.products
  set available_quantity = available_quantity - p_quantity
  where id = v_product.id;

  insert into public.orders (
    order_number, customer_name, mobile, whatsapp, address, city, state, pin_code,
    subtotal, delivery_charge, grand_total, status, stock_deducted, coupon_id, coupon_code, discount_amount
  ) values (
    v_order_number, trim(p_customer_name), p_mobile, p_whatsapp, trim(p_address), trim(p_city), trim(p_state), p_pin_code,
    v_subtotal, v_delivery, v_total, 'New', true, v_coupon_id, v_coupon_code, v_discount
  ) returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, size_label, quantity, rate, amount)
  values (v_order_id, v_product.id, v_product.name, v_product.size_label, p_quantity, v_product.price, v_subtotal);

  -- Same transaction as the order and stock reservation: failure rolls everything back.
  insert into public.invoices (invoice_number, order_id, subtotal, delivery_charge, grand_total, coupon_code, discount_amount)
  values ('INV-' || (select repeat('0', greatest(0, 4 - length(n))) || n from (select nextval('public.honey_invoice_seq')::text n) seq),
          v_order_id, v_subtotal, v_delivery, v_total, v_coupon_code, v_discount)
  returning * into v_invoice;

  return jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'order', (select to_jsonb(o) || jsonb_build_object('order_items',
      (select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id = v_order_id))
      from public.orders o where o.id = v_order_id),
    'settings', (select to_jsonb(s) from public.business_settings s where s.id = 1),
    'id', v_order_id,
    'order_number', v_order_number,
    'grand_total', v_total
  );
end;
$$;
revoke all on function public.place_order(uuid,integer,text,text,text,text,text,text,text,text) from public;
grant execute on function public.place_order(uuid,integer,text,text,text,text,text,text,text,text) to anon,authenticated;
create or replace function public.create_invoice(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_invoice public.invoices%rowtype;
  v_number text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;

  -- Serialize concurrent admin requests before checking for an existing invoice.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;
  select * into v_invoice from public.invoices where order_id = p_order_id;
  if found then
    return to_jsonb(v_invoice);
  end if;
  if v_order.status = 'Cancelled' then
    raise exception 'Cancelled orders cannot be invoiced.';
  end if;

  v_number := 'INV-' || (select repeat('0', greatest(0, 4 - length(n))) || n from (select nextval('public.honey_invoice_seq')::text n) seq);

  insert into public.invoices (invoice_number, order_id, subtotal, delivery_charge, grand_total, created_by, coupon_code, discount_amount)
  values (v_number, v_order.id, v_order.subtotal, v_order.delivery_charge, v_order.grand_total, auth.uid(), v_order.coupon_code, v_order.discount_amount)
  returning * into v_invoice;

  return to_jsonb(v_invoice);
end;
$$;
notify pgrst, 'reload schema';
commit;


-- Upgrade V4: preserve historical orders and invoice snapshots.
begin;
alter table public.orders add column if not exists customer_id uuid references auth.users(id);
alter table public.orders add column if not exists request_id uuid unique;
create index if not exists orders_customer_idx on public.orders(customer_id,created_at desc);
alter table public.coupons add column if not exists product_id uuid references public.products(id);
-- Legacy unassigned coupons must be assigned by an admin before activation.
update public.coupons set active=false where product_id is null;
alter table public.coupons drop constraint if exists coupon_requires_product;
alter table public.coupons add constraint coupon_requires_product check (not active or product_id is not null);
revoke update on public.products from authenticated;
grant update(price,available_quantity,active) on public.products to authenticated;
drop policy if exists orders_customer_select on public.orders;
create policy orders_customer_select on public.orders for select to authenticated using (customer_id=auth.uid());
drop policy if exists items_customer_select on public.order_items;
create policy items_customer_select on public.order_items for select to authenticated using (exists(select 1 from public.orders o where o.id=order_id and o.customer_id=auth.uid()));
drop policy if exists invoices_customer_select on public.invoices;
create policy invoices_customer_select on public.invoices for select to authenticated using (exists(select 1 from public.orders o where o.id=order_id and o.customer_id=auth.uid()));
drop function if exists public.place_order(uuid,integer,text,text,text,text,text,text,text,text);
drop function if exists public.place_order(uuid,integer,text,text,text,text,text,text,text);
create or replace function public.coupon_amount(p_code text,p_subtotal numeric,p_mobile text,p_product_id uuid)
returns numeric language plpgsql security definer set search_path=public as $$
declare c public.coupons%rowtype; d numeric;
begin
 if nullif(trim(p_code),'') is null then return 0; end if;
 select * into c from public.coupons where code=upper(trim(p_code)) for update;
 if not found or not c.active or (c.expires_at is not null and c.expires_at <= now()) then raise exception 'Coupon is invalid or expired.'; end if;
 if c.product_id is distinct from p_product_id then raise exception 'This coupon is for a different honey size.'; end if;
 if p_subtotal < c.min_order then raise exception 'Minimum order amount for this coupon is Rs. %.',c.min_order; end if;
 if c.usage_limit is not null and (select count(*) from public.orders where coupon_id=c.id) >= c.usage_limit then raise exception 'Coupon usage limit reached.'; end if;
 if c.per_customer_limit is not null and (select count(*) from public.orders where coupon_id=c.id and mobile=p_mobile) >= c.per_customer_limit then raise exception 'Coupon already used for this mobile number.'; end if;
 d := case when c.kind='percent' then round(p_subtotal*c.value/100,2) else c.value end;
 return least(p_subtotal,d,coalesce(c.max_discount,d));
end; $$;
revoke all on function public.coupon_amount(text,numeric,text,uuid) from public,anon,authenticated;

create or replace function public.quote_order(p_product_id uuid,p_quantity integer,p_mobile text,p_coupon_code text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.products%rowtype; s numeric; d numeric; delivery numeric;
begin
 if auth.uid() is null then raise exception 'Please log in.'; end if;
 if p_quantity is null or p_quantity<1 or p_quantity>100 or coalesce(p_mobile,'') !~ '^[0-9]{10}$' then raise exception 'Enter a valid mobile number and quantity first.'; end if;
 select * into p from public.products where id=p_product_id;
 if not found or p.price<=0 or p.grams not in (250,500,1000) or not p.active or p.available_quantity<p_quantity then raise exception 'Requested stock is unavailable.'; end if;
 s:=p.price*p_quantity;
 d:=public.coupon_amount(p_coupon_code,s,p_mobile,p_product_id);
 select delivery_charge into delivery from public.business_settings where id=1;
 return jsonb_build_object('subtotal',s,'discount_amount',d,'delivery_charge',coalesce(delivery,0),'grand_total',s-d+coalesce(delivery,0),'coupon_code',nullif(upper(trim(p_coupon_code)),''));
end; $$;
revoke all on function public.quote_order(uuid,integer,text,text) from public,anon;
grant execute on function public.quote_order(uuid,integer,text,text) to authenticated;

create or replace function public.place_order(
  p_product_id uuid,
  p_quantity integer,
  p_customer_name text,
  p_mobile text,
  p_address text,
  p_coupon_code text default null,
  p_request_id uuid default null,
  p_expected_total numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_order_id uuid;
  v_invoice public.invoices%rowtype;
  v_order_number text;
  v_subtotal numeric(10,2);
  v_delivery numeric(10,2);
  v_total numeric(10,2);
  v_discount numeric(10,2);
  v_coupon_id uuid;
  v_coupon_code text;
begin
  if auth.uid() is null then raise exception 'Please log in.'; end if;
  if p_request_id is null then raise exception 'Request ID required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select id into v_order_id from public.orders where request_id=p_request_id and customer_id=auth.uid();
  if found then return jsonb_build_object('id',v_order_id); end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception 'Quantity must be at least 1.';
  end if;

  if coalesce(length(trim(p_customer_name)),0) not between 2 and 100 or coalesce(p_mobile,'') !~ '^[0-9]{10}$' or coalesce(length(trim(p_address)),0) not between 10 and 500 then raise exception 'Enter your name, 10-digit mobile and full address (10–500 characters).'; end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;
  if v_product.grams not in (250,500,1000) or v_product.price <= 0 or not v_product.active or v_product.available_quantity <= 0 then
    raise exception 'This size is currently out of stock.';
  end if;
  if p_quantity > v_product.available_quantity then
    raise exception 'Only % bottle(s) are currently available.', v_product.available_quantity;
  end if;

  v_order_number := 'HON-' || (select repeat('0', greatest(0, 4 - length(n))) || n from (select nextval('public.honey_order_seq')::text n) seq);
  v_subtotal := v_product.price * p_quantity;
  select delivery_charge into v_delivery from public.business_settings where id = 1;
  v_delivery := coalesce(v_delivery, 0);
  v_coupon_code := nullif(upper(trim(p_coupon_code)), '');
  v_discount := public.coupon_amount(v_coupon_code,v_subtotal,p_mobile,p_product_id);
  select id into v_coupon_id from public.coupons where code=v_coupon_code;
  v_total := v_subtotal - v_discount + v_delivery;
  if p_expected_total is null or p_expected_total <> v_total then raise exception 'Total changed. Please review the order again.'; end if;

  -- Reserve stock immediately when the customer places the order.
  -- The row lock above prevents two customers from overselling the same stock.
  update public.products
  set available_quantity = available_quantity - p_quantity
  where id = v_product.id;

  insert into public.orders (
    customer_id, request_id, order_number, customer_name, mobile, whatsapp, address, city, state, pin_code,
    subtotal, delivery_charge, grand_total, status, stock_deducted, coupon_id, coupon_code, discount_amount
  ) values (
    auth.uid(), p_request_id, v_order_number, trim(p_customer_name), p_mobile, p_mobile, trim(p_address), '', '', '',
    v_subtotal, v_delivery, v_total, 'New', true, v_coupon_id, v_coupon_code, v_discount
  ) returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, size_label, quantity, rate, amount)
  values (v_order_id, v_product.id, v_product.name, v_product.size_label, p_quantity, v_product.price, v_subtotal);

  -- Same transaction as the order and stock reservation: failure rolls everything back.
  insert into public.invoices (invoice_number, order_id, subtotal, delivery_charge, grand_total, coupon_code, discount_amount)
  values ('INV-' || (select repeat('0', greatest(0, 4 - length(n))) || n from (select nextval('public.honey_invoice_seq')::text n) seq),
          v_order_id, v_subtotal, v_delivery, v_total, v_coupon_code, v_discount)
  returning * into v_invoice;

  return jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'order', (select to_jsonb(o) || jsonb_build_object('order_items',
      (select jsonb_agg(to_jsonb(i)) from public.order_items i where i.order_id = v_order_id))
      from public.orders o where o.id = v_order_id),
    'settings', (select to_jsonb(s) from public.business_settings s where s.id = 1),
    'id', v_order_id,
    'order_number', v_order_number,
    'grand_total', v_total
  );
end;
$$;
revoke all on function public.place_order(uuid,integer,text,text,text,text,uuid,numeric) from public,anon;
grant execute on function public.place_order(uuid,integer,text,text,text,text,uuid,numeric) to authenticated;

create or replace function public.admin_coupon_data() returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required.'; end if;
 return jsonb_build_object('coupons',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('uses',(select count(*) from public.orders o where o.coupon_id=c.id))) from public.coupons c),'[]'::jsonb),'products',(select jsonb_agg(to_jsonb(p) order by grams) from public.products p where grams in (250,500,1000)));
end; $$;
revoke all on function public.admin_coupon_data() from public,anon;
grant execute on function public.admin_coupon_data() to authenticated;
notify pgrst, 'reload schema';
commit;
