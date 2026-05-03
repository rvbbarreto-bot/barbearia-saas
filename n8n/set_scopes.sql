UPDATE public.user_api_keys
SET scopes = '["workflow:read","workflow:create","workflow:update","workflow:delete","workflow:list","workflow:execute","credential:read","credential:create","credential:update","credential:list","variable:read","variable:create","variable:list","variable:update"]'::json
WHERE label = 'barbearia-saas'
RETURNING label, scopes;
