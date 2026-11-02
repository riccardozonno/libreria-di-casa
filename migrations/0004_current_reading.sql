CREATE TABLE `book_current_reading` (
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`marked_by_id` text,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `book_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marked_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `book_current_reading_book_idx` ON `book_current_reading` (`book_id`);