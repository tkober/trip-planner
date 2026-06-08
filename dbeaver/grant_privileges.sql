ALTER SCHEMA public OWNER TO trip_planner_owner;

GRANT USAGE ON SCHEMA public
  TO trip_planner_app;

ALTER DEFAULT PRIVILEGES
  FOR ROLE trip_planner_owner
  IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLES
  TO trip_planner_app;

ALTER DEFAULT PRIVILEGES
  FOR ROLE trip_planner_owner
  IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE
  ON SEQUENCES
  TO trip_planner_app;