-- V6: multi-product cart, inventory costing, giveaways and admin financial dashboard.
-- Run once after migration_v5.sql. Safe to rerun.
begin;

alter table public.products add column if not exists cost_price numeric(10,2) not null default 0 check (cost_price >= 0);
alter table public.order_items add column if not exists unit_cost numeric(10,2) not null default 0 check (unit_cost >= 0);

create table if not exists public.stock_giveaways (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  product_name text not null,
  size_label text not null,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(10,2) not null check (unit_cost >= 0),
  retail_price numeric(10,2) not null check (retail_price >= 0),
  total_cost numeric(10,2) not null check (total_cost >= 0),
  retail_value numeric(10,2) not null check (retail_value >= 0),
  recipient text not null,
  note text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists stock_giveaways_created_idx on public.stock_giveaways(created_at desc);
alter table public.stock_giveaways enable row level security;
revoke all on public.stock_giveaways from anon, authenticated;
grant select on public.stock_giveaways to authenticated;
drop policy if exists stock_giveaways_admin_select on public.stock_giveaways;
create policy stock_giveaways_admin_select on public.stock_giveaways for select to authenticated using (public.is_admin());

revoke update on public.products from authenticated;
grant update(price,cost_price,available_quantity,active) on public.products to authenticated;

create or replace function public.backfill_first_cost_price() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.cost_price=0 and new.cost_price>0 then
    update public.order_items set unit_cost=new.cost_price where product_id=new.id and unit_cost=0;
  end if;
  return new;
end; $$;
revoke all on function public.backfill_first_cost_price() from public,anon,authenticated;
drop trigger if exists products_backfill_first_cost on public.products;
create trigger products_backfill_first_cost after update of cost_price on public.products for each row execute function public.backfill_first_cost_price();

create or replace function public.normalized_cart(p_items jsonb)
returns table(product_id uuid, quantity integer)
language sql immutable set search_path=public as $$
  select x.product_id, sum(x.quantity)::integer
  from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(product_id uuid,quantity integer)
  group by x.product_id
$$;
revoke all on function public.normalized_cart(jsonb) from public,anon,authenticated;

create or replace function public.quote_cart(p_items jsonb,p_mobile text,p_coupon_code text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r record; item_count integer; subtotal numeric(10,2):=0; eligible numeric(10,2):=0;
  discount numeric(10,2):=0; delivery numeric(10,2):=0; coupon_product uuid; result_items jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Please log in.'; end if;
  if coalesce(p_mobile,'') !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit mobile number.'; end if;
  select count(*) into item_count from public.normalized_cart(p_items);
  if item_count < 1 or item_count > 3 then raise exception 'Choose between 1 and 3 honey sizes.'; end if;
  if exists(select 1 from public.normalized_cart(p_items) where product_id is null or quantity is null or quantity<1 or quantity>100) then raise exception 'Each quantity must be between 1 and 100.'; end if;
  for r in
    select p.*,c.quantity from public.normalized_cart(p_items) c join public.products p on p.id=c.product_id order by p.id
  loop
    if r.grams not in (250,500,1000) or r.price<=0 or not r.active or r.available_quantity<r.quantity then raise exception 'Requested stock is unavailable for %.',r.size_label; end if;
    subtotal:=subtotal+(r.price*r.quantity);
    result_items:=result_items||jsonb_build_array(jsonb_build_object('product_id',r.id,'size_label',r.size_label,'quantity',r.quantity,'rate',r.price,'amount',r.price*r.quantity));
  end loop;
  if nullif(trim(p_coupon_code),'') is not null then
    select product_id into coupon_product from public.coupons where code=upper(trim(p_coupon_code));
    select p.price*c.quantity into eligible from public.normalized_cart(p_items) c join public.products p on p.id=c.product_id where p.id=coupon_product;
    if eligible is null then raise exception 'This coupon is for a honey size that is not in your cart.'; end if;
    discount:=public.coupon_amount(p_coupon_code,eligible,p_mobile,coupon_product);
  end if;
  select coalesce(delivery_charge,0) into delivery from public.business_settings where id=1;
  return jsonb_build_object('items',result_items,'subtotal',subtotal,'discount_amount',discount,'delivery_charge',delivery,'grand_total',subtotal-discount+delivery,'coupon_code',nullif(upper(trim(p_coupon_code)),''));
end; $$;
revoke all on function public.quote_cart(jsonb,text,text) from public,anon;
grant execute on function public.quote_cart(jsonb,text,text) to authenticated;

create or replace function public.place_cart_order(
  p_items jsonb,p_customer_name text,p_mobile text,p_address text,p_coupon_code text default null,
  p_request_id uuid default null,p_expected_total numeric default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r record; item_count integer; v_order_id uuid; v_invoice public.invoices%rowtype; v_order_number text;
  v_subtotal numeric(10,2):=0; v_eligible numeric(10,2):=0; v_delivery numeric(10,2):=0;
  v_total numeric(10,2); v_discount numeric(10,2):=0; v_coupon_id uuid; v_coupon_product uuid; v_coupon_code text;
begin
  if auth.uid() is null then raise exception 'Please log in.'; end if;
  if p_request_id is null then raise exception 'Request ID required.'; end if;
  if coalesce(length(trim(p_customer_name)),0) not between 2 and 100 or coalesce(p_mobile,'') !~ '^[0-9]{10}$' or coalesce(length(trim(p_address)),0) not between 10 and 500 then raise exception 'Enter your name, 10-digit mobile and full address.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select id into v_order_id from public.orders where request_id=p_request_id and customer_id=auth.uid();
  if found then return jsonb_build_object('id',v_order_id); end if;
  select count(*) into item_count from public.normalized_cart(p_items);
  if item_count<1 or item_count>3 or exists(select 1 from public.normalized_cart(p_items) where product_id is null or quantity is null or quantity<1 or quantity>100) then raise exception 'Choose 1 to 3 sizes with valid quantities.'; end if;
  for r in
    select p.*,c.quantity from public.normalized_cart(p_items) c join public.products p on p.id=c.product_id order by p.id for update of p
  loop
    if r.grams not in (250,500,1000) or r.price<=0 or not r.active or r.available_quantity<r.quantity then raise exception 'Requested stock is unavailable for %.',r.size_label; end if;
    v_subtotal:=v_subtotal+(r.price*r.quantity);
  end loop;
  v_coupon_code:=nullif(upper(trim(p_coupon_code)),'');
  if v_coupon_code is not null then
    select id,product_id into v_coupon_id,v_coupon_product from public.coupons where code=v_coupon_code;
    select p.price*c.quantity into v_eligible from public.normalized_cart(p_items) c join public.products p on p.id=c.product_id where p.id=v_coupon_product;
    if v_eligible is null then raise exception 'This coupon is for a honey size that is not in your cart.'; end if;
    v_discount:=public.coupon_amount(v_coupon_code,v_eligible,p_mobile,v_coupon_product);
  end if;
  select coalesce(delivery_charge,0) into v_delivery from public.business_settings where id=1;
  v_total:=v_subtotal-v_discount+v_delivery;
  if p_expected_total is null or p_expected_total<>v_total then raise exception 'Total changed. Please review the order again.'; end if;
  v_order_number:='HON-'||(select repeat('0',greatest(0,4-length(n)))||n from (select nextval('public.honey_order_seq')::text n) s);
  insert into public.orders(customer_id,request_id,order_number,customer_name,mobile,whatsapp,address,city,state,pin_code,subtotal,delivery_charge,grand_total,status,stock_deducted,coupon_id,coupon_code,discount_amount)
  values(auth.uid(),p_request_id,v_order_number,trim(p_customer_name),p_mobile,p_mobile,trim(p_address),'','','',v_subtotal,v_delivery,v_total,'New',true,v_coupon_id,v_coupon_code,v_discount) returning id into v_order_id;
  for r in
    select p.*,c.quantity from public.normalized_cart(p_items) c join public.products p on p.id=c.product_id order by p.id
  loop
    update public.products set available_quantity=available_quantity-r.quantity where id=r.id;
    insert into public.order_items(order_id,product_id,product_name,size_label,quantity,rate,amount,unit_cost)
    values(v_order_id,r.id,r.name,r.size_label,r.quantity,r.price,r.price*r.quantity,r.cost_price);
  end loop;
  insert into public.invoices(invoice_number,order_id,subtotal,delivery_charge,grand_total,coupon_code,discount_amount)
  values('INV-'||(select repeat('0',greatest(0,4-length(n)))||n from (select nextval('public.honey_invoice_seq')::text n) s),v_order_id,v_subtotal,v_delivery,v_total,v_coupon_code,v_discount) returning * into v_invoice;
  return jsonb_build_object('id',v_order_id,'order_number',v_order_number,'grand_total',v_total,'invoice',to_jsonb(v_invoice));
end; $$;
revoke all on function public.place_cart_order(jsonb,text,text,text,text,uuid,numeric) from public,anon;
grant execute on function public.place_cart_order(jsonb,text,text,text,text,uuid,numeric) to authenticated;

create or replace function public.record_giveaway(p_product_id uuid,p_quantity integer,p_recipient text,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.products%rowtype; g public.stock_giveaways%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  if p_quantity is null or p_quantity<1 or coalesce(length(trim(p_recipient)),0)<2 then raise exception 'Enter a valid quantity and recipient.'; end if;
  select * into p from public.products where id=p_product_id for update;
  if not found or p.available_quantity<p_quantity then raise exception 'Not enough stock for this giveaway.'; end if;
  update public.products set available_quantity=available_quantity-p_quantity where id=p.id;
  insert into public.stock_giveaways(product_id,product_name,size_label,quantity,unit_cost,retail_price,total_cost,retail_value,recipient,note,created_by)
  values(p.id,p.name,p.size_label,p_quantity,p.cost_price,p.price,p.cost_price*p_quantity,p.price*p_quantity,trim(p_recipient),left(coalesce(p_note,''),500),auth.uid()) returning * into g;
  return to_jsonb(g);
end; $$;
revoke all on function public.record_giveaway(uuid,integer,text,text) from public,anon;
grant execute on function public.record_giveaway(uuid,integer,text,text) to authenticated;

create or replace function public.admin_dashboard_data()
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  with valid_orders as (select * from public.orders where status<>'Cancelled'),
  sales as (
    select coalesce(sum(o.subtotal-o.discount_amount),0) product_sales,coalesce(sum(o.delivery_charge),0) delivery_charged,
      coalesce(sum(o.grand_total),0) order_value,count(*) order_count
    from valid_orders o
  ),
  costs as (select coalesce(sum(i.unit_cost*i.quantity),0) sold_cost from public.order_items i join valid_orders o on o.id=i.order_id),
  money as (select coalesce(sum(case when p.kind='payment' then p.amount else -p.amount end),0) received from public.payments p join valid_orders o on o.id=p.order_id),
  gifts as (select coalesce(sum(total_cost),0) gift_cost,coalesce(sum(retail_value),0) gift_retail,coalesce(sum(quantity),0) gift_units from public.stock_giveaways),
  inventory as (select coalesce(sum(cost_price*available_quantity),0) stock_cost,coalesce(sum(price*available_quantity),0) stock_retail,coalesce(sum(available_quantity),0) stock_units from public.products where grams in(250,500,1000)),
  performance as (
    select p.id,p.size_label,
      coalesce(sum(i.quantity) filter(where o.id is not null),0) sold_units,
      coalesce(sum(i.amount-case when c.product_id=i.product_id then o.discount_amount else 0 end) filter(where o.id is not null),0) net_sales,
      coalesce(sum(i.unit_cost*i.quantity) filter(where o.id is not null),0) cost_of_sales
    from public.products p
    left join public.order_items i on i.product_id=p.id
    left join valid_orders o on o.id=i.order_id
    left join public.coupons c on c.id=o.coupon_id
    where p.grams in(250,500,1000)
    group by p.id,p.size_label,p.grams order by p.grams
  )
  select jsonb_build_object(
    'summary',jsonb_build_object('product_sales',sales.product_sales,'delivery_charged',sales.delivery_charged,'order_value',sales.order_value,'order_count',sales.order_count,'sold_cost',costs.sold_cost,'giveaway_cost',gifts.gift_cost,'giveaway_retail',gifts.gift_retail,'giveaway_units',gifts.gift_units,'estimated_net_profit',sales.product_sales-costs.sold_cost-gifts.gift_cost,'received',money.received,'outstanding',greatest(sales.order_value-money.received,0),'stock_cost_value',inventory.stock_cost,'stock_retail_value',inventory.stock_retail,'stock_units',inventory.stock_units),
    'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.grams) from public.products p where grams in(250,500,1000)),'[]'::jsonb),
    'product_performance',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('gross_profit',x.net_sales-x.cost_of_sales)) from performance x),'[]'::jsonb),
    'giveaways',coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at desc) from (select * from public.stock_giveaways order by created_at desc limit 50) g),'[]'::jsonb),
    'recent_orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from (select id,order_number,customer_name,status,grand_total,created_at from public.orders order by created_at desc limit 8) o),'[]'::jsonb)
  ) into result from sales,costs,money,gifts,inventory;
  return result;
end; $$;
revoke all on function public.admin_dashboard_data() from public,anon;
grant execute on function public.admin_dashboard_data() to authenticated;

notify pgrst,'reload schema';
commit;
