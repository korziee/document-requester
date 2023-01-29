-- Migration number: 0001 	 2023-01-29T19:24:46.739Z
drop table if exists documents;

create table documents (
  -- r2 key
  id text not null primary key,
  version text not null,
  contents_base64 text not null,
  created_at int not null default current_timestamp,
  updated_at int not null default current_timestamp
);