-- Usernames made only of dots ("." or "..") produce /user/. and /user/.. URLs, which browsers
-- collapse, so those profiles cannot be opened. New dot-only names are now rejected. Rename the
-- existing ones to user-<8 hex characters>; the owner can pick a new name in settings.
CREATE TABLE `__dot_username_renames` (
  `user_id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__dot_username_renames` (`user_id`, `username`)
SELECT `user_id`, 'user-' || lower(hex(randomblob(4)))
FROM `profiles`
WHERE trim(`normalized_username`, '.') = '';
--> statement-breakpoint
UPDATE `profiles`
SET
  `username` = (
    SELECT `username` FROM `__dot_username_renames` WHERE `__dot_username_renames`.`user_id` = `profiles`.`user_id`
  ),
  `normalized_username` = (
    SELECT `username` FROM `__dot_username_renames` WHERE `__dot_username_renames`.`user_id` = `profiles`.`user_id`
  ),
  `updated_at` = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE `user_id` IN (SELECT `user_id` FROM `__dot_username_renames`);
--> statement-breakpoint
UPDATE `user`
SET
  `username` = (
    SELECT `username` FROM `__dot_username_renames` WHERE `__dot_username_renames`.`user_id` = `user`.`id`
  ),
  `display_username` = (
    SELECT `username` FROM `__dot_username_renames` WHERE `__dot_username_renames`.`user_id` = `user`.`id`
  )
WHERE `id` IN (SELECT `user_id` FROM `__dot_username_renames`);
--> statement-breakpoint
DROP TABLE `__dot_username_renames`;
