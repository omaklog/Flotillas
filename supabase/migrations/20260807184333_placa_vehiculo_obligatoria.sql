alter table public.vehiculos
  alter column placa set not null;

alter table public.vehiculos
  add constraint uq_vehiculos_empresa_placa unique (empresa_id, placa);
