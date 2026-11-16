-- Restore the reply links that 0024 stashed before the `comments` rebuild.
UPDATE `comments`
SET `parent_id` = (
  SELECT `parent_id` FROM `__comment_parents` WHERE `__comment_parents`.`id` = `comments`.`id`
)
WHERE `id` IN (SELECT `id` FROM `__comment_parents`);
--> statement-breakpoint
DROP TABLE `__comment_parents`;
