DROP INDEX `book_title_idx`;--> statement-breakpoint
CREATE INDEX `book_title_nocase_idx` ON `book` ("title" COLLATE NOCASE,`seq`);--> statement-breakpoint
DROP INDEX `copy_book_idx`;--> statement-breakpoint
CREATE INDEX `copy_book_location_idx` ON `copy` (`book_id`,`location_id`);