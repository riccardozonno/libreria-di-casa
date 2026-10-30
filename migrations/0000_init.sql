CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`actor_email` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`data` text DEFAULT '{}' NOT NULL,
	`ip` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `book` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`isbn13` text,
	`title` text NOT NULL,
	`authors` text DEFAULT '[]' NOT NULL,
	`published_year` integer,
	`description` text,
	`cover_key` text,
	`source` text NOT NULL,
	`created_by_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "book_source_check" CHECK(source IN ('GOOGLE_BOOKS', 'OPEN_LIBRARY', 'MANUAL', 'CSV')),
	CONSTRAINT "book_isbn13_check" CHECK("book"."isbn13" IS NULL OR (length("book"."isbn13") = 13 AND "book"."isbn13" NOT GLOB '*[^0-9]*')),
	CONSTRAINT "book_authors_json" CHECK(json_valid("book"."authors") AND json_type("book"."authors") = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `book_id_unique` ON `book` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `book_isbn13_unique` ON `book` (`isbn13`);--> statement-breakpoint
CREATE INDEX `book_title_idx` ON `book` (`title`);--> statement-breakpoint
CREATE TABLE `book_reading` (
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`marked_by_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `book_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marked_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `book_reading_book_idx` ON `book_reading` (`book_id`);--> statement-breakpoint
CREATE TABLE `copy` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`location_id` text NOT NULL,
	`shelf` text,
	`notes` text,
	`created_by_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `copy_book_idx` ON `copy` (`book_id`);--> statement-breakpoint
CREATE INDEX `copy_location_idx` ON `copy` (`location_id`);--> statement-breakpoint
CREATE TABLE `copy_movement` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`copy_id` text,
	`from_location_id` text NOT NULL,
	`to_location_id` text NOT NULL,
	`moved_by_id` text,
	`moved_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`copy_id`) REFERENCES `copy`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`from_location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`moved_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `copy_movement_book_idx` ON `copy_movement` (`book_id`,`moved_at`);--> statement-breakpoint
CREATE TABLE `isbn_cache` (
	`isbn13` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `location` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`color` text NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "location_color_check" CHECK(color IN ('ROSSO', 'ARANCIO', 'GIALLO', 'VERDE', 'TURCHESE', 'AZZURRO', 'BLU', 'VIOLA', 'ROSA', 'MARRONE'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `location_name_key_unique` ON `location` (`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `location_color_unique` ON `location` (`color`);--> statement-breakpoint
CREATE TABLE `location_editor` (
	`user_id` text NOT NULL,
	`location_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `location_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `location_editor_location_idx` ON `location_editor` (`location_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'READER' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sessions_not_before` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "user_role_check" CHECK(role IN ('ADMIN', 'EDITOR', 'READER')),
	CONSTRAINT "user_email_lowercase" CHECK("user"."email" = lower("user"."email"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);