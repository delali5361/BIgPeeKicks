create table if not exists public.stock_reservations (
  order_id text not null references public.orders(id) on delete cascade,
  product_id text not null,
  size integer not null,
  quantity integer not null check (quantity > 0),
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (order_id, product_id, size)
);

create index if not exists stock_reservations_expiry_idx
  on public.stock_reservations(expires_at)
  where status = 'reserved';

create or replace function public.release_expired_stock_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation record;
  released_count integer := 0;
begin
  for reservation in
    update public.stock_reservations
    set status = 'released'
    where status = 'reserved' and expires_at <= now()
    returning order_id, product_id, size, quantity
  loop
    update public.product_sizes
    set stock = stock + reservation.quantity
    where product_id = reservation.product_id and size = reservation.size;

    update public.orders
    set status = 'Cancelled'
    where id = reservation.order_id and payment_status = 'Pending';

    released_count := released_count + 1;
  end loop;
  return released_count;
end;
$$;

create or replace function public.release_order_stock_reservation(reservation_order_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation record;
  released_count integer := 0;
begin
  for reservation in
    update public.stock_reservations
    set status = 'released'
    where order_id = reservation_order_id and status = 'reserved'
    returning order_id, product_id, size, quantity
  loop
    update public.product_sizes
    set stock = stock + reservation.quantity
    where product_id = reservation.product_id and size = reservation.size;
    released_count := released_count + 1;
  end loop;

  update public.orders
  set status = 'Cancelled'
  where id = reservation_order_id and payment_status = 'Pending';
  return released_count;
end;
$$;

create or replace function public.create_pending_order(order_data jsonb, requested_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  line jsonb;
  product record;
  customer_id text;
  order_id text := 'BPK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  order_email text := lower(trim(order_data ->> 'email'));
  v_subtotal numeric := 0;
  v_shipping numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  shipping_standard numeric;
  shipping_express numeric;
  free_threshold numeric;
  promo_code text;
    shipping_city text := coalesce(
      nullif(trim(order_data ->> 'shippingCity'), ''),
      case
        when coalesce((order_data ->> 'deliverToRecipient')::boolean, false)
          then coalesce(nullif(trim(order_data #>> '{recipient,city}'), ''), trim(order_data ->> 'city'))
        else trim(order_data ->> 'city')
      end
    );
      then coalesce(nullif(trim(order_data #>> '{recipient,city}'), ''), trim(order_data ->> 'city'))
    else trim(order_data ->> 'city')
  end;
  free_delivery_applied boolean := false;
  expires timestamptz := now() + interval '20 minutes';
begin
  perform public.release_expired_stock_reservations();

  if jsonb_typeof(requested_lines) <> 'array' or jsonb_array_length(requested_lines) < 1 or jsonb_array_length(requested_lines) > 50 then
    raise exception 'The cart must contain between 1 and 50 product lines';
  end if;
  if order_email = '' or trim(coalesce(order_data ->> 'name', '')) = '' or trim(coalesce(order_data ->> 'address', '')) = '' or trim(coalesce(order_data ->> 'city', '')) = '' then
    raise exception 'Contact and delivery details are required';
  end if;
  if selected_method not in ('standard', 'express') then
    raise exception 'Invalid shipping method';
  end if;

  insert into public.customers (id, name, email, phone, address, city, country, created_at, updated_at)
  values (
    'customer-' || replace(gen_random_uuid()::text, '-', ''),
    trim(order_data ->> 'name'),
    order_email,
    nullif(order_data ->> 'phone', ''),
    trim(order_data ->> 'address'),
    trim(order_data ->> 'city'),
    coalesce(nullif(order_data ->> 'country', ''), 'Ghana'),
    now()::text,
    now()::text
  )
  on conflict do nothing
  returning id into customer_id;
  if customer_id is null then
    select id into customer_id from public.customers where lower(email) = order_email for update;
    update public.customers
    set name = trim(order_data ->> 'name'),
        phone = nullif(order_data ->> 'phone', ''),
        address = trim(order_data ->> 'address'),
        city = trim(order_data ->> 'city'),
        country = coalesce(nullif(order_data ->> 'country', ''), 'Ghana'),
        updated_at = now()::text
    where id = customer_id;
  end if;

  insert into public.orders (
    id, customer_id, subtotal, shipping, total, delivery_email, delivery_name,
    delivery_address, delivery_city, delivery_country, delivery_phone,
    recipient_name, recipient_phone, recipient_address, recipient_city,
    recipient_country, placed_at, estimated_delivery
  ) values (
    order_id, customer_id, 0, 0, 0, order_email, trim(order_data ->> 'name'),
    trim(order_data ->> 'address'), trim(order_data ->> 'city'),
    coalesce(nullif(order_data ->> 'country', ''), 'Ghana'),
    nullif(order_data ->> 'phone', ''),
    coalesce(nullif(order_data #>> '{recipient,name}', ''), trim(order_data ->> 'name')),
    coalesce(nullif(order_data #>> '{recipient,phone}', ''), nullif(order_data ->> 'phone', '')),
    coalesce(nullif(order_data #>> '{recipient,address}', ''), trim(order_data ->> 'address')),
    coalesce(nullif(order_data #>> '{recipient,city}', ''), trim(order_data ->> 'city')),
    coalesce(nullif(order_data #>> '{recipient,country}', ''), order_data ->> 'country', 'Ghana'),
    now()::text, (now() + interval '5 days')::text
  );

  for line in select value from jsonb_array_elements(requested_lines)
  loop
    if coalesce(line ->> 'productId', '') = ''
      or coalesce((line ->> 'size')::integer, 0) <= 0
      or coalesce((line ->> 'quantity')::integer, 0) <= 0 then
      raise exception 'Cart contains an invalid product, size, or quantity';
    end if;

    select p.id, p.category, p.name, p.tag, p.price, p.image_url, p.description,
           p.popularity, p.created_at, ps.stock
    into product
    from public.products p
    join public.product_sizes ps on ps.product_id = p.id
    where p.id = line ->> 'productId'
      and p.status = 'Active'
      and ps.size = (line ->> 'size')::integer
    for update of ps;

    if not found then
      raise exception 'A product or size in the cart is no longer available';
    end if;
    if product.stock < (line ->> 'quantity')::integer then
      raise exception 'Only % unit(s) remain for %, size %', product.stock, product.name, line ->> 'size';
    end if;

    update public.product_sizes
    set stock = stock - (line ->> 'quantity')::integer
    where product_id = product.id and size = (line ->> 'size')::integer;

    insert into public.order_items (order_id, product_id, product_name, size, quantity, unit_price)
    values (order_id, product.id, product.name, (line ->> 'size')::integer, (line ->> 'quantity')::integer, product.price);

    insert into public.stock_reservations (order_id, product_id, size, quantity, expires_at)
    values (order_id, product.id, (line ->> 'size')::integer, (line ->> 'quantity')::integer, expires);

    v_subtotal := v_subtotal + product.price * (line ->> 'quantity')::integer;
  end loop;

  select standard, express into shipping_standard, shipping_express
  from public.shipping_rates
  where lower(location) = lower(shipping_city);
  if not found then
    select standard, express into shipping_standard, shipping_express
    from public.shipping_rates where lower(location) = 'other';
  end if;
  if shipping_standard is null or shipping_express is null then
    select coalesce(max(value::numeric) filter (where key = 'standardShipping'), 12),
           coalesce(max(value::numeric) filter (where key = 'expressShipping'), 28)
    into shipping_standard, shipping_express
    from public.store_settings
    where key in ('standardShipping', 'expressShipping');
  end if;

  select coalesce(max(value::numeric) filter (where key = 'freeDeliveryThreshold'), 200),
         coalesce(max(value) filter (where key = 'promoCode'), 'BIGPEE10'),
         coalesce(max(value::numeric) filter (where key = 'promoDiscount'), 10)
  into free_threshold, promo_code, promo_discount
  from public.store_settings
  where key in ('freeDeliveryThreshold', 'promoCode', 'promoDiscount');

  free_delivery_applied := v_subtotal > 0 and free_threshold > 0 and v_subtotal >= free_threshold;
  v_shipping := case
    when free_delivery_applied then 0
    when selected_method = 'express' then shipping_express
    else shipping_standard
  end;
  if requested_promo <> '' and requested_promo = upper(trim(promo_code)) then
    v_discount := round(v_subtotal * greatest(0, least(100, promo_discount)) / 100);
  end if;
  v_total := greatest(0, v_subtotal + v_shipping - v_discount);

  update public.orders
  set subtotal = v_subtotal,
      shipping = v_shipping,
      total = v_total
  where id = order_id;

  return jsonb_build_object(
    'orderId', order_id,
    'subtotal', v_subtotal,
    'shipping', v_shipping,
    'freeDeliveryApplied', free_delivery_applied,
    'freeDeliveryThreshold', free_threshold,
    'shippingLocation', shipping_city,
    'discount', v_discount,
    'total', v_total,
    'reservationExpiresAt', expires
  );
end;
$$;

create or replace function public.settle_order_payment(payment_reference text, payment_amount integer, payment_currency text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders%rowtype;
  changed_count integer;
  reservation_count integer;
  reservation record;
  all_reserved boolean := true;
begin
  perform public.release_expired_stock_reservations();

  select * into order_record
  from public.orders
  where orders.payment_reference = settle_order_payment.payment_reference
  for update;
  if not found then raise exception 'Payment reference does not match an order'; end if;
  if payment_amount <> round(order_record.total * 100)::integer or payment_currency <> 'GHS' then
    raise exception 'Verified payment amount does not match the order total';
  end if;
  if order_record.payment_status = 'Paid' then
    return jsonb_build_object('changed', false, 'orderId', order_record.id, 'late', false);
  end if;
  if order_record.payment_status <> 'Pending' then
    raise exception 'Only pending orders can be settled';
  end if;

  select count(*) into reservation_count
  from public.stock_reservations
  where order_id = order_record.id and status = 'reserved';

  if reservation_count = 0 then
    for reservation in
      select product_id, size, quantity
      from public.order_items
      where order_id = order_record.id
      order by product_id, size
    loop
      update public.product_sizes
      set stock = stock - reservation.quantity
      where product_id = reservation.product_id
        and size = reservation.size
        and stock >= reservation.quantity;
      if not found then
        all_reserved := false;
        exit;
      end if;
      update public.stock_reservations
      set status = 'consumed', expires_at = now()
      where order_id = order_record.id
        and product_id = reservation.product_id
        and size = reservation.size;
      if not found then
        insert into public.stock_reservations (order_id, product_id, size, quantity, status, expires_at)
        values (order_record.id, reservation.product_id, reservation.size, reservation.quantity, 'consumed', now());
      end if;
    end loop;

    if not all_reserved then
      update public.product_sizes ps
      set stock = ps.stock + oi.quantity
      from public.order_items oi
      where oi.order_id = order_record.id
        and ps.product_id = oi.product_id
        and ps.size = oi.size
        and exists (
          select 1 from public.stock_reservations sr
          where sr.order_id = order_record.id
            and sr.product_id = oi.product_id
            and sr.size = oi.size
            and sr.status = 'consumed'
        );
      update public.stock_reservations
      set status = 'released'
      where order_id = order_record.id and status = 'consumed';
      insert into public.notifications (type, title, message, order_id, created_at)
      values ('payment', 'Paid order needs stock review', 'Payment succeeded after the stock hold expired and one or more products could not be re-reserved. Review order ' || order_record.id || ' and arrange fulfillment or refund.', order_record.id, now()::text);
    end if;
  end if;

  update public.stock_reservations
  set status = 'consumed'
  where order_id = order_record.id and status = 'reserved';
  get diagnostics changed_count = row_count;

  update public.orders
  set payment_status = 'Paid', paid_at = now()::text, status = 'Processing'
  where id = order_record.id and payment_status <> 'Paid';
  get diagnostics changed_count = row_count;

  return jsonb_build_object(
    'changed', changed_count > 0,
    'orderId', order_record.id,
    'late', reservation_count = 0,
    'stockAvailable', all_reserved
  );
end;
$$;

revoke all on function public.release_expired_stock_reservations() from public, anon, authenticated;
revoke all on function public.release_order_stock_reservation(text) from public, anon, authenticated;
revoke all on function public.create_pending_order(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.settle_order_payment(text, integer, text) from public, anon, authenticated;
grant execute on function public.release_expired_stock_reservations() to service_role;
grant execute on function public.release_order_stock_reservation(text) to service_role;
grant execute on function public.create_pending_order(jsonb, jsonb) to service_role;
grant execute on function public.settle_order_payment(text, integer, text) to service_role;
