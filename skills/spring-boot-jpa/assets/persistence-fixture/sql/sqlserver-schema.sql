-- Run only in a NEW disposable SQL Server test database, default schema dbo.
-- Creates objects; no credentials, database creation or destructive reset is included.
-- Pair with allocationSize=50 and hibernate.id.optimizer.pooled.preferred=pooled-lo.
CREATE SEQUENCE dbo.outbox_event_seq AS bigint START WITH 1 INCREMENT BY 50;
CREATE TABLE dbo.outbox_event (
    id bigint NOT NULL PRIMARY KEY,
    status tinyint NOT NULL,
    attempts int NOT NULL,
    payload nvarchar(1000) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    version bigint NOT NULL,
    CONSTRAINT ck_outbox_attempts CHECK (attempts >= 0)
);
