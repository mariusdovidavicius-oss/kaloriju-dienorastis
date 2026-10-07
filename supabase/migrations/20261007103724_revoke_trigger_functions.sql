-- Trigerių funkcijos neturi būti kviečiamos per API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.check_meal_owner() from public, anon, authenticated;
revoke execute on function public.check_entry_products() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
