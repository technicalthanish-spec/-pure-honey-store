-- Run after migration_v2.sql on an existing V2 database. Safe to rerun.
-- Keep the existing sequences; never reset issued invoice numbers.
begin;
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
revoke all on function public.place_order(uuid,integer,text,text,text,text,text,text,text) from public;
grant execute on function public.place_order(uuid,integer,text,text,text,text,text,text,text) to anon, authenticated;
revoke all on function public.create_invoice(uuid) from public, anon;
grant execute on function public.create_invoice(uuid) to authenticated;
-- Customers receive only their newly created record through place_order.
alter table public.invoices enable row level security;
revoke all on public.invoices, public.orders, public.order_items from anon;
-- Existing authenticated admin-only RLS policies remain unchanged.
-- Cancellation only updates order status/restores stock; invoice records are retained.
commit;
