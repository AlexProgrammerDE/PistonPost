-- The next migration rebuilds `comments` with `parent_id ON DELETE SET NULL`.
-- D1 keeps foreign keys enforced inside migrations, so dropping the old table
-- would fire that action and clear every reply link. Stash the links first and
-- restore them after the rebuild.
CREATE TABLE `__comment_parents` (
  `id` text PRIMARY KEY NOT NULL,
  `parent_id` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__comment_parents` (`id`, `parent_id`)
SELECT `id`, `parent_id` FROM `comments` WHERE `parent_id` IS NOT NULL;
--> statement-breakpoint
UPDATE `comments` SET `parent_id` = NULL WHERE `parent_id` IS NOT NULL;
