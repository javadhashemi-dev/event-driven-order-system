-- AlterTable
ALTER TABLE "products" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "idempotency_records" (
    "key" VARCHAR(128) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("key")
);
