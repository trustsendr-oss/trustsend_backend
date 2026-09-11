DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'tumaplus_user') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tumaplus_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tumaplus_user;
    GRANT ALL ON SCHEMA public TO tumaplus_user;
  END IF;
END
$$;

