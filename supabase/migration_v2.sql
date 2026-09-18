-- Honey Order App V2 migration
-- Run this ONCE in Supabase SQL Editor on an existing V1 database.
-- Main fix: reserve/deduct stock immediately when an order is placed.

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

  -- Exclusive lock avoids overselling during simultaneous orders.
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

  v_order_number := 'HON-' || lpad(nextval('public.honey_order_seq')::text, 4, '0');
  v_subtotal := v_product.price * p_quantity;
  select delivery_charge into v_delivery from public.business_settings where id = 1;
  v_delivery := coalesce(v_delivery, 0);
  v_total := v_subtotal + v_delivery;

  -- Reserve stock immediately. If any later statement fails, PostgreSQL rolls this back automatically.
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

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'grand_total', v_total,
    'remaining_stock', v_product.available_quantity - p_quantity
  );
end;
$$;

revoke all on function public.place_order(uuid,integer,text,text,text,text,text,text,text) from public;
grant execute on function public.place_order(uuid,integer,text,text,text,text,text,text,text) to anon, authenticated;

-- Existing V1 orders are left unchanged on purpose.
-- Their stock_deducted flag remains false until they are Confirmed/Packed/Shipped/Delivered,
-- so the existing status trigger will deduct them once. New V2 orders are deducted immediately.


-- Keep invoice rules enforced in the database too.
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

  select * into v_invoice from public.invoices where order_id = p_order_id;
  if found then
    return to_jsonb(v_invoice);
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found.';
  end if;
  if v_order.status = 'New' then
    raise exception 'Confirm the order before creating an invoice.';
  end if;
  if v_order.status = 'Cancelled' then
    raise exception 'Cancelled orders cannot be invoiced.';
  end if;

  v_number := 'INV-' || lpad(nextval('public.honey_invoice_seq')::text, 4, '0');

  insert into public.invoices (invoice_number, order_id, subtotal, delivery_charge, grand_total, created_by)
  values (v_number, v_order.id, v_order.subtotal, v_order.delivery_charge, v_order.grand_total, auth.uid())
  returning * into v_invoice;

  return to_jsonb(v_invoice);
end;
$$;

revoke all on function public.create_invoice(uuid) from public;
grant execute on function public.create_invoice(uuid) to authenticated;
