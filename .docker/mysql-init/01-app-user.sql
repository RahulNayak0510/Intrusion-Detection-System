-- Create the dedicated application database user.
-- The root user is used ONLY by MySQL init / administration (e.g. Workbench).
-- Container entrypoint auto-creates the user/password specified via env; this
-- script re-affirms minimal-necessary grants for safety.

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, DROP
  ON idsdb.* TO 'ids_user'@'%';
FLUSH PRIVILEGES;
