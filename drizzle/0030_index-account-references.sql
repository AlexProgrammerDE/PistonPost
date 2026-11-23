CREATE INDEX `audit_events_actor_idx` ON `audit_events` (`actor_id`);--> statement-breakpoint
CREATE INDEX `comments_author_idx` ON `comments` (`author_id`);--> statement-breakpoint
CREATE INDEX `content_reports_resolved_by_idx` ON `content_reports` (`resolved_by`);--> statement-breakpoint
CREATE INDEX `reactions_user_idx` ON `reactions` (`user_id`);