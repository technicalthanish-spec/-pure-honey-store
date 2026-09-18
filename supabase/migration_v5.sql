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
