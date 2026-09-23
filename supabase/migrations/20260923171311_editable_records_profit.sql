-- Admin corrections: atomic, optimistic concurrency checks and complete audit snapshots.
begin;
alter table public.business_expenses add column if not exists deleted_at timestamptz;
create or replace function public.admin_correct_record(p_request_id uuid,p_kind text,p_id uuid,p_action text,p_expected jsonb,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 tbl text; oldrow jsonb; newrow jsonb; prior public.admin_requests%rowtype; payload jsonb;
 prod public.products%rowtype; ord public.orders%rowtype; line public.order_items%rowtype; x jsonb;
 qty integer; cost numeric; amount numeric; net numeric; stock integer; value numeric; financial boolean;
 subtotal numeric:=0; discount numeric; delivery numeric; total numeric; allocated numeric:=0; ld numeric; count_items integer; seen integer:=0;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
 if p_request_id is null or p_id is null or p_kind is null or p_action is null or p_action not in ('edit','delete','restore') or p_expected is null or p_data is null then raise exception 'Invalid correction.'; end if;
 tbl:=case p_kind when 'expense' then 'business_expenses' when 'purchase' then 'stock_purchases' when 'giveaway' then 'stock_giveaways' when 'payment' then 'payments' when 'order' then 'orders' end;
 if tbl is null or (p_action<>'edit' and p_kind<>'expense') then raise exception 'Unsupported correction.'; end if;
 payload:=jsonb_build_object('kind',p_kind,'id',p_id,'action',p_action,'expected',p_expected,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from public.admin_requests where id=p_request_id;
 if found then
  if prior.actor<>auth.uid() or prior.operation<>'correction' or prior.payload<>payload then raise exception 'Request already used.'; end if;
  return prior.result;
 end if;
 -- Match payment writer lock order: order first, then payment.
 if p_kind='payment' then
  select o.* into ord from public.orders o join public.payments p on p.order_id=o.id where p.id=p_id for update of o;
 end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tbl) into oldrow using p_id;
 if oldrow is null then raise exception 'Record not found.'; end if;
 if not oldrow @> p_expected then raise exception 'This record changed. Refresh and review the latest values.'; end if;
 if p_expected->>'id' is distinct from p_id::text then raise exception 'Missing record version.'; end if;
 if p_kind='expense' then
  if p_action='delete' then update public.business_expenses set deleted_at=now() where id=p_id;
  elsif p_action='restore' then update public.business_expenses set deleted_at=null where id=p_id;
  else
   if oldrow->>'deleted_at' is not null then raise exception 'Restore this expense before editing.'; end if;
   amount:=(p_data->>'amount')::numeric;
   if amount is null or amount<=0 or amount>10000000 or amount<>round(amount,2) or coalesce(p_data->>'category','') not in ('Packaging','Courier','Travel','Other') or coalesce(length(trim(p_data->>'note')),0) not between 2 and 500 or (p_data->>'spent_on')::date is null or (p_data->>'spent_on')::date>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Enter valid expense details.'; end if;
   update public.business_expenses set category=p_data->>'category',amount=amount,spent_on=(p_data->>'spent_on')::date,note=trim(p_data->>'note') where id=p_id;
  end if;
 elsif p_kind in ('purchase','giveaway') then
  qty:=(p_data->>'quantity')::integer;cost:=(p_data->>'unit_cost')::numeric;
  if qty is null or qty<1 or qty>100000 or cost is null or cost<0 or cost>1000000 or cost<>round(cost,2) or length(coalesce(p_data->>'note',''))>500 then raise exception 'Enter valid quantity and cost.'; end if;
  select * into prod from public.products where id=(oldrow->>'product_id')::uuid for update;
  if p_kind='giveaway' then
   if coalesce(length(trim(p_data->>'recipient')),0) not between 2 and 100 then raise exception 'Enter the recipient name.'; end if;
   stock:=prod.available_quantity+(oldrow->>'quantity')::integer-qty;
   if stock<0 then raise exception 'Not enough stock for the corrected giveaway.'; end if;
   update public.products set available_quantity=stock where id=prod.id;
   update public.stock_giveaways set quantity=qty,unit_cost=cost,total_cost=qty*cost,retail_value=qty*retail_price,recipient=trim(p_data->>'recipient'),note=coalesce(p_data->>'note','') where id=p_id;
  else
   if coalesce(length(trim(p_data->>'supplier')),0) not between 2 and 100 or (p_data->>'purchased_on')::date is null or (p_data->>'purchased_on')::date>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Enter valid supplier and date.'; end if;
   financial:=qty<>(oldrow->>'quantity')::integer or cost<>(oldrow->>'unit_cost')::numeric;
   if financial then
    -- Do not silently recost honey already sold or gifted after this purchase.
    if exists(select 1 from public.order_items where product_id=prod.id and created_at>=(oldrow->>'created_at')::timestamptz) or exists(select 1 from public.stock_giveaways where product_id=prod.id and created_at>=(oldrow->>'created_at')::timestamptz) or exists(select 1 from public.stock_purchases where product_id=prod.id and id<>p_id and created_at>=(oldrow->>'created_at')::timestamptz) then raise exception 'Stock has moved after this purchase. Supplier, date and note remain editable. Correct historical sale/giveaway costs in those records; do not rewrite this stock receipt.'; end if;
    stock:=prod.available_quantity-(oldrow->>'quantity')::integer+qty;
    value:=prod.available_quantity*prod.cost_price-(oldrow->>'total_cost')::numeric+qty*cost;
    if stock<1 or value<0 then raise exception 'This correction cannot be reconciled with current stock.'; end if;
    update public.products set available_quantity=stock,cost_price=round(value/stock,2) where id=prod.id;
   end if;
   update public.stock_purchases set quantity=qty,unit_cost=cost,total_cost=qty*cost,supplier=trim(p_data->>'supplier'),purchased_on=(p_data->>'purchased_on')::date,note=coalesce(p_data->>'note','') where id=p_id;
  end if;
 elsif p_kind='payment' then
  amount:=(p_data->>'amount')::numeric;
  if amount is null or amount<=0 or amount>99999999.99 or amount<>round(amount,2) or coalesce(p_data->>'kind','') not in ('payment','refund') or coalesce(p_data->>'method','') not in ('UPI','Cash','Bank') or (p_data->>'paid_at')::timestamptz is null or (p_data->>'paid_at')::timestamptz>now()+interval '5 minutes' or (p_data->>'paid_at')::timestamptz<ord.created_at-interval '5 minutes' or length(coalesce(p_data->>'note',''))>500 then raise exception 'Enter valid payment details.'; end if;
  select coalesce(sum(case when kind='payment' then p.amount else -p.amount end),0) into net from public.payments p where order_id=ord.id and id<>p_id;
  net:=net+case when p_data->>'kind'='payment' then amount else -amount end;
  if net<0 or (ord.status<>'Cancelled' and net>ord.grand_total) or (ord.status='Cancelled' and p_data->>'kind'='payment' and (oldrow->>'kind'<>'payment' or amount>(oldrow->>'amount')::numeric)) then raise exception 'Correction would exceed the bill or refund more money than received.'; end if;
  update public.payments set kind=p_data->>'kind',amount=amount,method=p_data->>'method',paid_at=(p_data->>'paid_at')::timestamptz,note=coalesce(p_data->>'note','') where id=p_id;
 elsif p_kind='order' then
  if coalesce(length(trim(p_data->>'customer_name')),0) not between 2 and 100 or coalesce(p_data->>'mobile','')!~'^[0-9]{10}$' or length(coalesce(p_data->>'address',''))>500 or length(coalesce(p_data->>'sale_note',''))>500 then raise exception 'Enter valid customer details.'; end if;
  if jsonb_typeof(p_data->'items') is distinct from 'array' then raise exception 'Missing honey items.'; end if;
  count_items:=jsonb_array_length(p_data->'items');
  if count_items<>(select count(*) from public.order_items where order_id=p_id) or count_items<>(select count(distinct j->>'id') from jsonb_array_elements(p_data->'items') j) then raise exception 'All original items must be included exactly once.'; end if;
  for x in select j from jsonb_array_elements(p_data->'items') j order by (j->>'id')::uuid loop
   select * into line from public.order_items where id=(x->>'id')::uuid and order_id=p_id;
   if not found then raise exception 'Item not found.'; end if;
   qty:=(x->>'quantity')::integer;cost:=(x->>'unit_cost')::numeric;amount:=(x->>'rate')::numeric;
   if qty is null or qty<1 or qty>10000 or cost is null or cost<0 or cost>1000000 or cost<>round(cost,2) or amount is null or amount<0 or amount>1000000 or amount<>round(amount,2) then raise exception 'Invalid item quantity, rate or cost.'; end if;
   subtotal:=subtotal+qty*amount;
  end loop;
  discount:=(p_data->>'discount_amount')::numeric;delivery:=(p_data->>'delivery_charge')::numeric;
  if discount is null or discount<0 or discount>subtotal or discount<>round(discount,2) or delivery is null or delivery<0 or delivery>1000000 or delivery<>round(delivery,2) then raise exception 'Invalid discount or delivery charge.'; end if;
  total:=subtotal-discount+delivery;
  select coalesce(sum(case when kind='payment' then p.amount else -p.amount end),0) into net from public.payments p where order_id=p_id;
  if total>99999999.99 or (oldrow->>'status'<>'Cancelled' and total<net) then raise exception 'Bill cannot be lower than money held. Record any actual refund or correct an erroneous payment first.'; end if;
  -- Lock all affected products in stable order, as the sale writer does.
  perform 1 from public.products where id in(select product_id from public.order_items where order_id=p_id) order by id for update;
  oldrow:=oldrow||jsonb_build_object('items',(select jsonb_agg(to_jsonb(i) order by id) from public.order_items i where order_id=p_id));
  for x in select j from jsonb_array_elements(p_data->'items') j order by (j->>'id')::uuid loop
   select * into line from public.order_items where id=(x->>'id')::uuid;
   qty:=(x->>'quantity')::integer;amount:=(x->>'rate')::numeric;cost:=(x->>'unit_cost')::numeric;
   if (oldrow->>'stock_deducted')::boolean then
    select * into prod from public.products where id=line.product_id;
    stock:=prod.available_quantity+line.quantity-qty;
    if stock<0 then raise exception 'Not enough stock for corrected quantity.'; end if;
    update public.products set available_quantity=stock where id=prod.id;
   end if;
   seen:=seen+1;ld:=case when seen=count_items then discount-allocated when subtotal=0 then 0 else least(discount-allocated,round(discount*(qty*amount)/subtotal,2)) end;allocated:=allocated+ld;
   update public.order_items set quantity=qty,rate=amount,amount=qty*amount,unit_cost=cost,allocated_discount=ld where id=line.id;
  end loop;
  update public.orders set customer_name=trim(p_data->>'customer_name'),mobile=p_data->>'mobile',whatsapp=coalesce(nullif(p_data->>'whatsapp',''),p_data->>'mobile'),address=coalesce(p_data->>'address',''),city=coalesce(p_data->>'city',''),state=coalesce(p_data->>'state',''),pin_code=coalesce(p_data->>'pin_code',''),sale_note=coalesce(p_data->>'sale_note',''),subtotal=subtotal,discount_amount=discount,delivery_charge=delivery,grand_total=total,sale_source='admin',coupon_id=null,coupon_code=null where id=p_id;
  update public.invoices set subtotal=subtotal,discount_amount=discount,delivery_charge=delivery,grand_total=total,coupon_code=null where order_id=p_id;
 end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1',tbl) into newrow using p_id;
 if p_kind='order' then newrow:=newrow||jsonb_build_object('items',(select jsonb_agg(to_jsonb(i) order by id) from public.order_items i where order_id=p_id));end if;
 insert into public.activity_log(actor_id,entity,entity_id,action,details) values(auth.uid(),tbl,p_id,upper(p_action),jsonb_build_object('before',oldrow,'after',newrow));
 insert into public.admin_requests(id,actor,operation,payload,result) values(p_request_id,auth.uid(),'correction',payload,jsonb_build_object('id',p_id));
 return jsonb_build_object('id',p_id);
end;$$;
revoke all on function public.admin_correct_record(uuid,text,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.admin_correct_record(uuid,text,uuid,text,jsonb,jsonb) to authenticated;
create or replace function public.admin_dashboard_data()
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required.'; end if;
  with valid_orders as (select * from public.orders where status<>'Cancelled'),
  expenses as (select coalesce(sum(amount),0) spent from public.business_expenses where deleted_at is null),
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
end; $$;
revoke all on function public.admin_dashboard_data() from public,anon;
grant execute on function public.admin_dashboard_data() to authenticated;


notify pgrst,'reload schema';
commit;
