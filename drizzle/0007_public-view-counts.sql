CREATE TABLE `post_view_counts` (
	`post_id` text PRIMARY KEY NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "post_view_counts_count_check" CHECK("post_view_counts"."view_count" >= 0)
);
