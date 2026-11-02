ALTER TABLE "app"."invitations" ADD CONSTRAINT "invitations_email_length" CHECK (length("app"."invitations"."email") BETWEEN 3 AND 254) NOT VALID;
