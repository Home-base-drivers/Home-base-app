-- Sync the Earnings cards' settings with the driver's account: goal pace,
-- car-cost inputs, car expense rows (car/gas rows only), excluded car rows and
-- the Uber vs Empower inputs. Same validation, size cap and version check.
create or replace function public.save_home_base_state(
  p_state jsonb,
  p_expected_version bigint,
  p_market text default 'Baltimore'
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_version bigint;
  v_key text;
begin
  if v_user is null then raise exception 'Sign in to save progress' using errcode = '42501'; end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'Expected version is required' using errcode = '22023';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text) > 524288 then
    raise exception 'Progress must be an object smaller than 512 KiB' using errcode = '22023';
  end if;
  if p_market is null or length(p_market) not between 1 and 100 then
    raise exception 'Invalid market' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_state) loop
    if v_key not in ('homeBaseDriverProfile', 'homeBaseCostPrefs', 'homeBaseAlertPrefs',
      'homeBaseProductPrefs', 'homeBaseMapUi', 'homeBaseEarningsView', 'homeBaseShifts',
      'homeBaseForecastSnapshots', 'homeBaseForecastAccuracy',
      'homeBaseGoalPace', 'homeBaseCarCostInputs', 'homeBaseCarExpenses',
      'homeBaseCarExclude', 'homeBaseEmpowerCompare') then
      raise exception 'Unsupported progress field: %', v_key using errcode = '22023';
    end if;
    if v_key in ('homeBaseShifts', 'homeBaseForecastSnapshots', 'homeBaseForecastAccuracy',
      'homeBaseCarExpenses', 'homeBaseCarExclude') then
      if jsonb_typeof(p_state -> v_key) <> 'array' then
        raise exception 'Progress history must be an array' using errcode = '22023';
      end if;
    elsif jsonb_typeof(p_state -> v_key) <> 'object' then
      raise exception 'Progress settings must be objects' using errcode = '22023';
    end if;
  end loop;
  update public.user_state set state = p_state, market = p_market
    where user_id = v_user and version = p_expected_version returning version into v_version;
  if v_version is null and p_expected_version = 0 then
    insert into public.user_state(user_id, state, market, version)
      values (v_user, p_state, p_market, 1)
      on conflict (user_id) do nothing returning version into v_version;
  end if;
  if v_version is null then
    raise exception 'Progress changed on another device. Reload before saving.' using errcode = '40001';
  end if;
  return jsonb_build_object('version', v_version, 'state', p_state);
end;
$$;

revoke all on function public.save_home_base_state(jsonb, bigint, text) from public, anon;
grant execute on function public.save_home_base_state(jsonb, bigint, text) to authenticated;
