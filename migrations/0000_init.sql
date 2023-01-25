-- Migration number: 0000 	 2023-01-24T07:44:50.389Z
drop table if exists document_requests;

create table document_requests (
  id text not null primary key,
  document_id text not null,
  email text not null,
  requester_name text not null,
  status text not null check(status in ('REQUESTED', 'REJECTED', 'ACCEPTED')),
  created_at int not null default now,
  updated_at int not null default now
);