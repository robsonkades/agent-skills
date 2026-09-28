-- Contrast only: run in a NEW disposable PostgreSQL database, schema public.
-- PostgreSQL does not have SQL Server's unsigned TINYINT or nationalized NVARCHAR contract.
-- Adapt the Java status mapping to SMALLINT and ordinary Unicode text binding before testing.
CREATE SEQUENCE outbox_event_seq AS bigint START WITH 1 INCREMENT BY 50;
CREATE TABLE outbox_event (
    id bigint PRIMARY KEY,
    status smallint NOT NULL CHECK (status BETWEEN 0 AND 255),
    attempts integer NOT NULL CHECK (attempts >= 0),
    payload varchar(1000) NOT NULL,
    version bigint NOT NULL
);
