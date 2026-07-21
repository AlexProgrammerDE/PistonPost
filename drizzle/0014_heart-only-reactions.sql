PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reactions` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`post_id`, `user_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_reactions`("post_id", "user_id", "created_at", "updated_at") SELECT "post_id", "user_id", "created_at", "updated_at" FROM `reactions`;--> statement-breakpoint
DROP TABLE `reactions`;--> statement-breakpoint
ALTER TABLE `__new_reactions` RENAME TO `reactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;