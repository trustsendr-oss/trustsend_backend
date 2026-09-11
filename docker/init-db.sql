-- Grant permissions to tumaplus_user
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tumaplus_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tumaplus_user;
GRANT ALL ON SCHEMA public TO tumaplus_user;
