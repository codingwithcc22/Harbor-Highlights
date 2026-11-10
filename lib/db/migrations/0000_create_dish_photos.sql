CREATE TABLE "dish_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"mime_type" text NOT NULL,
	"image_base64" text NOT NULL,
	"inspector_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
