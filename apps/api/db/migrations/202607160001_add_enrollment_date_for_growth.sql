-- Conserva la fecha FECHA de las hojas FITNESS, SALON y AULA para métricas históricas.
alter table miclub.enrollments add column if not exists enrollment_date date;

create index if not exists enrollments_enrollment_date_idx on miclub.enrollments (enrollment_date);
