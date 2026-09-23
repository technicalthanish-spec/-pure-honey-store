begin;
create or replace function public.admin_apply_sale_cost(p_request_id uuid,p_product_id uuid,p_expected_cost numeric,p_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.admin_requests%rowtype; payload jsonb; product public.products%rowtype; item record; n integer:=0; jars integer:=0; delta numeric:=0; result jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required.'; end if;
 if p_request_id is null or p_product_id is null or p_mode is null or p_mode not in ('missing','all') then raise exception 'Invalid request.'; end if;
 payload:=jsonb_build_object('product_id',p_product_id,'cost',p_expected_cost,'mode',p_mode);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from public.admin_requests where id=p_request_id;
 if found then
  if prior.actor<>auth.uid() or prior.operation<>'historical_cost' or prior.payload<>payload then raise exception 'Request already used.'; end if;
  return prior.result;
 end if;
 perform 1 from public.orders o where o.status<>'Cancelled' and exists(select 1 from public.order_items i where i.order_id=o.id and i.product_id=p_product_id) order by o.id for update;
 select * into product from public.products where id=p_product_id for update;
 if not found or product.cost_price is distinct from p_expected_cost or product.cost_price<=0 then raise exception 'Save a positive product cost first, then refresh and retry.'; end if;
 for item in select i.* from public.order_items i join public.orders o on o.id=i.order_id where i.product_id=p_product_id and o.status<>'Cancelled' and (p_mode='all' or i.unit_cost=0) and i.unit_cost<>product.cost_price order by i.id for update of i loop
  update public.order_items set unit_cost=product.cost_price where id=item.id;
  -- Invalidate any order edit form opened before this cost correction.
  update public.orders set updated_at=clock_timestamp() where id=item.order_id;
  insert into public.activity_log(actor_id,entity,entity_id,action,details) values(auth.uid(),'order_items',item.id,'COST_CORRECTION',jsonb_build_object('before',to_jsonb(item),'after_unit_cost',product.cost_price,'request_id',p_request_id));
  n:=n+1;jars:=jars+item.quantity;delta:=delta+(product.cost_price-item.unit_cost)*item.quantity;
 end loop;
 result:=jsonb_build_object('lines',n,'jars',jars,'cost_change',delta);
 insert into public.admin_requests(id,actor,operation,payload,result) values(p_request_id,auth.uid(),'historical_cost',payload,result);
 return result;
end;$$;
revoke all on function public.admin_apply_sale_cost(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.admin_apply_sale_cost(uuid,uuid,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
