-- V7: private admin sales, operating expenses, stock purchases and backup.
-- Run after V6 in Supabase SQL Editor. Transactional and safe to rerun.
begin;
create table if not exists public.admin_requests (
 id uuid primary key, actor uuid not null, operation text not null,
 payload jsonb not null, result jsonb, created_at timestamptz not null default now()
);
create table if not exists public.business_expenses (
 id uuid primary key default gen_random_uuid(), request_id uuid unique not null,
 category text not null check(category in ('Packaging','Courier','Travel','Other')),
 amount numeric(12,2) not null check(amount>0), spent_on date not null,
 note text not null, created_by uuid not null, created_at timestamptz not null default now()
);
create table if not exists public.stock_purchases (
 id uuid primary key default gen_random_uuid(), request_id uuid unique not null,
 product_id uuid not null references public.products(id), product_name text not null, size_label text not null,
 quantity integer not null check(quantity>0), unit_cost numeric(12,2) not null check(unit_cost>=0),
 total_cost numeric(12,2) not null, supplier text not null, purchased_on date not null,
 note text not null default '', created_by uuid not null, created_at timestamptz not null default now()
);
alter table public.admin_requests enable row level security;
alter table public.business_expenses enable row level security;
alter table public.stock_purchases enable row level security;
revoke all on public.admin_requests,public.business_expenses,public.stock_purchases from anon,authenticated;
grant select on public.business_expenses,public.stock_purchases to authenticated;
drop policy if exists expenses_admin on public.business_expenses;
create policy expenses_admin on public.business_expenses for select to authenticated using(public.is_admin());
drop policy if exists purchases_admin on public.stock_purchases;
create policy purchases_admin on public.stock_purchases for select to authenticated using(public.is_admin());
alter table public.orders add column if not exists sale_source text not null default 'shop';
alter table public.orders add column if not exists sale_note text not null default '';
alter table public.order_items add column if not exists allocated_discount numeric(10,2) not null default 0;
-- Purchase cost changes must never rewrite historic order cost snapshots.
drop trigger if exists products_backfill_first_cost on public.products;

create or replace function public.admin_tools_version() returns integer
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required.'; end if;
 return 7;
end; $$;

create or replace function public.admin_save_record(p_request_id uuid,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 prior public.admin_requests%rowtype; product public.products%rowtype; item record;
 result jsonb; order_id uuid; invoice_id uuid; order_no text; invoice_no text; entry_id uuid;
 subtotal numeric:=0; discount numeric:=0; delivery numeric:=0; total numeric:=0; paid numeric:=0;
 discount_value numeric; discount_kind text; qty integer; rate numeric; allocated numeric:=0; line_discount numeric;
 item_count integer; seen integer:=0; payment_method text; customer_name text; mobile text; address text;
 status_value text; note text; amount numeric; entry_date date; supplier text; average_cost numeric; stock_qty integer;
begin
 if not public.is_admin() then raise exception 'Admin access required.'; end if;
 if p_request_id is null or p_operation is null or p_operation not in ('sale','expense','purchase') or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid request.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from public.admin_requests where id=p_request_id;
 if found then
  if prior.actor<>auth.uid() or prior.operation<>p_operation or prior.payload<>p_data then raise exception 'Request already used for different details.'; end if;
  return prior.result;
 end if;
 insert into public.admin_requests(id,actor,operation,payload) values(p_request_id,auth.uid(),p_operation,p_data);
 note:=left(coalesce(p_data->>'note',''),500);
 if p_operation='sale' then
  customer_name:=trim(p_data->>'name'); mobile:=trim(p_data->>'mobile'); address:=trim(coalesce(p_data->>'address',''));
  status_value:=p_data->>'status'; payment_method:=p_data->>'method';
  if coalesce(length(customer_name),0) not between 2 and 100 or coalesce(mobile,'')!~'^[0-9]{10}$' or length(address)>500 then raise exception 'Enter customer name and 10-digit mobile.'; end if;
  if status_value is null or status_value not in ('New','Delivered') then raise exception 'Choose New or Delivered.'; end if;
  if jsonb_typeof(p_data->'items') is distinct from 'array' then raise exception 'Choose honey items.'; end if;
  item_count:=jsonb_array_length(p_data->'items');
  if item_count not between 1 and 3 then raise exception 'Choose 1 to 3 honey sizes.'; end if;
  if (select count(distinct x->>'product_id') from jsonb_array_elements(p_data->'items') x)<>item_count then raise exception 'Duplicate or missing product.'; end if;
  -- All writers lock products in UUID order, preventing stock races.
  for item in select x from jsonb_array_elements(p_data->'items') x order by (x->>'product_id')::uuid loop
   qty:=(item.x->>'quantity')::integer; rate:=(item.x->>'rate')::numeric;
   if qty is null or qty<1 or qty>10000 or rate is null or rate<0 or rate>1000000 or rate<>round(rate,2) then raise exception 'Invalid quantity or rate.'; end if;
   select * into product from public.products where id=(item.x->>'product_id')::uuid for update;
   if not found then raise exception 'Product not found.'; end if;
   if not product.active or product.grams not in (250,500,1000) or product.available_quantity<qty then raise exception 'Not enough active stock for %.',product.size_label; end if;
   subtotal:=subtotal+qty*rate;
  end loop;
  discount_kind:=p_data->>'discount_kind'; discount_value:=(p_data->>'discount_value')::numeric;
  delivery:=(p_data->>'delivery')::numeric; paid:=(p_data->>'paid')::numeric;
  if discount_kind is null or discount_kind not in ('fixed','percent') or discount_value is null or discount_value<0 or discount_value<>round(discount_value,2) or (discount_kind='percent' and discount_value>100) then raise exception 'Invalid discount.'; end if;
  discount:=case when discount_kind='percent' then round(subtotal*discount_value/100,2) else discount_value end;
  if discount>subtotal or delivery is null or delivery<0 or delivery>1000000 or delivery<>round(delivery,2) then raise exception 'Discount or delivery charge is invalid.'; end if;
  total:=subtotal-discount+delivery;
  if total>99999999.99 or paid is null or paid<0 or paid>total or paid<>round(paid,2) then raise exception 'Payment must be between zero and the bill total.'; end if;
  if payment_method is null or payment_method not in ('Cash','UPI','Bank') then raise exception 'Choose payment method.'; end if;
  if (p_data->>'expected_total')::numeric is distinct from total then raise exception 'Total mismatch. Review the bill.'; end if;
  order_no:='HON-'||lpad(nextval('public.honey_order_seq')::text,10,'0');
  insert into public.orders(order_number,customer_name,mobile,whatsapp,address,city,state,pin_code,subtotal,discount_amount,delivery_charge,grand_total,status,stock_deducted,customer_id,request_id,sale_source,sale_note)
  values(order_no,customer_name,mobile,mobile,address,'','','',subtotal,discount,delivery,total,status_value,true,null,p_request_id,'admin',note) returning id into order_id;
  for item in select x from jsonb_array_elements(p_data->'items') x order by (x->>'product_id')::uuid loop
   qty:=(item.x->>'quantity')::integer; rate:=(item.x->>'rate')::numeric;
   select * into product from public.products where id=(item.x->>'product_id')::uuid;
   seen:=seen+1;
   line_discount:=case when seen=item_count then discount-allocated when subtotal=0 then 0 else least(discount-allocated,round(discount*(qty*rate)/subtotal,2)) end;
   allocated:=allocated+line_discount;
   update public.products set available_quantity=available_quantity-qty where id=product.id;
   insert into public.order_items(order_id,product_id,product_name,size_label,quantity,rate,amount,unit_cost,allocated_discount)
   values(order_id,product.id,product.name,product.size_label,qty,rate,qty*rate,product.cost_price,line_discount);
  end loop;
  invoice_no:='INV-'||lpad(nextval('public.honey_invoice_seq')::text,10,'0');
  insert into public.invoices(invoice_number,order_id,subtotal,discount_amount,delivery_charge,grand_total,created_by)
  values(invoice_no,order_id,subtotal,discount,delivery,total,auth.uid()) returning id into invoice_id;
  if paid>0 then
   insert into public.payments(request_id,order_id,kind,amount,method,paid_at,note,created_by)
   values(p_request_id,order_id,'payment',paid,payment_method,now(),'Payment recorded with admin sale',auth.uid());
  end if;
  result:=jsonb_build_object('id',order_id,'invoice_id',invoice_id,'order_number',order_no);
 elsif p_operation='expense' then
  amount:=(p_data->>'amount')::numeric; entry_date:=(p_data->>'date')::date;
  if amount is null or amount<=0 or amount>10000000 or amount<>round(amount,2) or entry_date is null or entry_date>(now() at time zone 'Asia/Kolkata')::date or length(trim(note))<2 or coalesce(p_data->>'category','') not in ('Packaging','Courier','Travel','Other') then raise exception 'Enter a valid expense, date and note.'; end if;
  insert into public.business_expenses(request_id,category,amount,spent_on,note,created_by)
  values(p_request_id,p_data->>'category',amount,entry_date,note,auth.uid()) returning id into entry_id;
  result:=jsonb_build_object('id',entry_id);
 else
  qty:=(p_data->>'quantity')::integer; rate:=(p_data->>'unit_cost')::numeric;
  entry_date:=(p_data->>'date')::date; supplier:=trim(p_data->>'supplier');
  if qty is null or qty<1 or qty>100000 or rate is null or rate<0 or rate>1000000 or rate<>round(rate,2) or entry_date is null or entry_date>(now() at time zone 'Asia/Kolkata')::date or coalesce(length(supplier),0) not between 2 and 100 then raise exception 'Enter valid purchase details.'; end if;
  select * into product from public.products where id=(p_data->>'product_id')::uuid for update;
  if not found then raise exception 'Product not found.'; end if;
  stock_qty:=product.available_quantity;
  average_cost:=round((stock_qty*product.cost_price+qty*rate)/(stock_qty+qty),2);
  insert into public.stock_purchases(request_id,product_id,product_name,size_label,quantity,unit_cost,total_cost,supplier,purchased_on,note,created_by)
  values(p_request_id,product.id,product.name,product.size_label,qty,rate,qty*rate,supplier,entry_date,note,auth.uid()) returning id into entry_id;
  update public.products set available_quantity=stock_qty+qty,cost_price=average_cost where id=product.id;
  result:=jsonb_build_object('id',entry_id,'available_quantity',stock_qty+qty,'cost_price',average_cost);
 end if;
 insert into public.activity_log(actor_id,entity,entity_id,action,details)
 values(auth.uid(),'admin_'||p_operation,coalesce(order_id,entry_id),'INSERT',result);
 update public.admin_requests set result=admin_save_record.result where id=p_request_id;
 return result;
end; $$;

create or replace function public.admin_backup_v7() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin access required.'; end if;
 return jsonb_build_object('schema_version',7,'exported_at',now(),
 'orders',coalesce((select jsonb_agg(to_jsonb(t)) from public.orders t),'[]'),
 'order_items',coalesce((select jsonb_agg(to_jsonb(t)) from public.order_items t),'[]'),
 'invoices',coalesce((select jsonb_agg(to_jsonb(t)) from public.invoices t),'[]'),
 'payments',coalesce((select jsonb_agg(to_jsonb(t)) from public.payments t),'[]'),
 'products',coalesce((select jsonb_agg(to_jsonb(t)) from public.products t),'[]'),
 'coupons',coalesce((select jsonb_agg(to_jsonb(t)) from public.coupons t),'[]'),
 'business_settings',coalesce((select jsonb_agg(to_jsonb(t)) from public.business_settings t),'[]'),
 'stock_giveaways',coalesce((select jsonb_agg(to_jsonb(t)) from public.stock_giveaways t),'[]'),
 'expenses',coalesce((select jsonb_agg(to_jsonb(t)) from public.business_expenses t),'[]'),
 'stock_purchases',coalesce((select jsonb_agg(to_jsonb(t)) from public.stock_purchases t),'[]'),
 'activity_log',coalesce((select jsonb_agg(to_jsonb(t)) from public.activity_log t),'[]'));
end; $$;
revoke all on function public.admin_tools_version() from public,anon;
revoke all on function public.admin_save_record(uuid,text,jsonb) from public,anon;
revoke all on function public.admin_backup_v7() from public,anon;
grant execute on function public.admin_tools_version(),public.admin_save_record(uuid,text,jsonb),public.admin_backup_v7() to authenticated;
create or replace function public.admin_dashboard_data()
returns jsonb language plpgsql security definer set search_path=public as $
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  with valid_orders as (select * from public.orders where status<>'Cancelled'),
  expenses as (select coalesce(sum(amount),0) spent from public.business_expenses),
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
      coalesce(sum(i.amount-case when o.sale_source='admin' then i.allocated_discount when c.product_id=i.product_id then o.discount_amount else 0 end) filter(where o.id is not null),0) net_sales,
      coalesce(sum(i.unit_cost*i.quantity) filter(where o.id is not null),0) cost_of_sales
    from public.products p
    left join public.order_items i on i.product_id=p.id
    left join valid_orders o on o.id=i.order_id
    left join public.coupons c on c.id=o.coupon_id
    where p.grams in(250,500,1000)
    group by p.id,p.size_label,p.grams order by p.grams
  )
  select jsonb_build_object(
    'summary',jsonb_build_object('product_sales',sales.product_sales,'delivery_charged',sales.delivery_charged,'order_value',sales.order_value,'order_count',sales.order_count,'sold_cost',costs.sold_cost,'giveaway_cost',gifts.gift_cost,'giveaway_retail',gifts.gift_retail,'giveaway_units',gifts.gift_units,'operating_expenses',expenses.spent,'estimated_net_profit',sales.product_sales+sales.delivery_charged-costs.sold_cost-gifts.gift_cost-expenses.spent,'received',money.received,'outstanding',greatest(sales.order_value-money.received,0),'stock_cost_value',inventory.stock_cost,'stock_retail_value',inventory.stock_retail,'stock_units',inventory.stock_units),
    'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.grams) from public.products p where grams in(250,500,1000)),'[]'::jsonb),
    'product_performance',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('gross_profit',x.net_sales-x.cost_of_sales)) from performance x),'[]'::jsonb),
    'giveaways',coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at desc) from (select * from public.stock_giveaways order by created_at desc limit 50) g),'[]'::jsonb),
    'recent_orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from (select id,order_number,customer_name,status,grand_total,created_at from public.orders order by created_at desc limit 8) o),'[]'::jsonb)
  ) into result from sales,costs,money,gifts,inventory,expenses;
  return result;
end; $;
revoke all on function public.admin_dashboard_data() from public,anon;
grant execute on function public.admin_dashboard_data() to authenticated;


notify pgrst,'reload schema';
commit;
