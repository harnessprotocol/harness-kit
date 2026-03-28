-- Add "plugin" to the components type enum
alter table components drop constraint components_type_check;
alter table components add constraint components_type_check
  check (type in ('skill', 'plugin', 'agent', 'hook', 'script', 'knowledge', 'rules'));
