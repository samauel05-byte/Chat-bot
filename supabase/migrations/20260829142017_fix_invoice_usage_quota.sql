-- El primer consumo de una empresa debe partir de cero, nunca de NULL.
-- Esto permite sumar y mostrar correctamente cada Excel exportado.
create or replace function public.consume_company_invoice_quota(
  p_company_id uuid,
  p_periodo text,
  p_invoice_count integer
)
returns table(allowed boolean, monthly_limit integer, used_before integer, used_after integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_monthly_limit integer;
  v_trial_limit integer;
  v_limit integer;
  v_used integer := 0;
  v_is_trial boolean;
begin
  if p_invoice_count <= 0 then
    raise exception 'La cantidad de facturas debe ser mayor que cero.';
  end if;

  if p_periodo !~ '^20[0-9]{4}$' then
    raise exception 'El período debe tener formato YYYYMM.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));

  select c.monthly_invoice_limit, c.is_trial, c.trial_invoice_limit
    into v_monthly_limit, v_is_trial, v_trial_limit
    from public.companies c
   where c.id = p_company_id
   for update;

  if not found then
    raise exception 'La empresa no existe o ya no está activa.';
  end if;

  v_limit := case when v_is_trial then v_trial_limit else v_monthly_limit end;

  if v_is_trial then
    select coalesce(sum(u.invoice_count), 0)
      into v_used
      from public.invoice_usage_monthly u
     where u.company_id = p_company_id;
  else
    select coalesce((
      select u.invoice_count
        from public.invoice_usage_monthly u
       where u.company_id = p_company_id
         and u.periodo = p_periodo
    ), 0) into v_used;
  end if;

  if v_limit is not null and v_used + p_invoice_count > v_limit then
    return query select false, v_limit, v_used, v_used;
    return;
  end if;

  insert into public.invoice_usage_monthly (company_id, periodo, invoice_count, updated_at)
  values (p_company_id, p_periodo, p_invoice_count, now())
  on conflict (company_id, periodo)
  do update set invoice_count = public.invoice_usage_monthly.invoice_count + excluded.invoice_count,
                updated_at = now();

  return query select true, v_limit, v_used, v_used + p_invoice_count;
end;
$function$;
