-- Create Roles
CREATE ROLE trip_planner_owner
  WITH LOGIN
  PASSWORD '${OWNER_USER_PASSWORD}';

CREATE ROLE trip_planner_app
  WITH LOGIN
  PASSWORD '${APP_USER_PASSWORD}';

-- Create Database
CREATE DATABASE trip_planner
  OWNER trip_planner_owner;

-- Allow app user to connect
GRANT CONNECT ON DATABASE trip_planner
  TO trip_planner_app;