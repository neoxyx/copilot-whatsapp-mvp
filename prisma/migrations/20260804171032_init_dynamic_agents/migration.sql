/*
  Warnings:

  - You are about to drop the column `jid` on the `Contact` table. All the data in the column will be lost.
  - You are about to alter the column `name` on the `Contact` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `VarChar(100)`.
  - You are about to drop the column `companyName` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `contactId` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `fullName` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Lead` table. All the data in the column will be lost.
  - You are about to alter the column `email` on the `Lead` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `VarChar(100)`.
  - You are about to alter the column `role` on the `Message` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(2))`.
  - A unique constraint covering the columns `[agentId,phone]` on the table `Contact` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `agentId` to the `Contact` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone` to the `Contact` table without a default value. This is not possible if the table is not empty.
  - Added the required column `agentId` to the `Lead` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Lead` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone` to the `Lead` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `Lead` DROP FOREIGN KEY `Lead_contactId_fkey`;

-- DropIndex
DROP INDEX `Contact_jid_key` ON `Contact`;

-- DropIndex
DROP INDEX `Lead_contactId_fkey` ON `Lead`;

-- AlterTable
ALTER TABLE `Contact` DROP COLUMN `jid`,
    ADD COLUMN `agentId` VARCHAR(191) NOT NULL,
    ADD COLUMN `company` VARCHAR(100) NULL,
    ADD COLUMN `contextData` JSON NULL,
    ADD COLUMN `email` VARCHAR(100) NULL,
    ADD COLUMN `phone` VARCHAR(50) NOT NULL,
    MODIFY `name` VARCHAR(100) NULL;

-- AlterTable
ALTER TABLE `Lead` DROP COLUMN `companyName`,
    DROP COLUMN `contactId`,
    DROP COLUMN `fullName`,
    DROP COLUMN `updatedAt`,
    ADD COLUMN `agentId` VARCHAR(191) NOT NULL,
    ADD COLUMN `company` VARCHAR(100) NULL,
    ADD COLUMN `name` VARCHAR(100) NOT NULL,
    ADD COLUMN `phone` VARCHAR(50) NOT NULL,
    MODIFY `email` VARCHAR(100) NULL,
    MODIFY `notes` TEXT NULL;

-- AlterTable
ALTER TABLE `Message` ADD COLUMN `type` ENUM('TEXT', 'AUDIO') NOT NULL DEFAULT 'TEXT',
    MODIFY `role` ENUM('user', 'assistant', 'system', 'tool') NOT NULL;

-- CreateTable
CREATE TABLE `Agent` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `systemPrompt` TEXT NOT NULL,
    `temperature` DOUBLE NOT NULL DEFAULT 0.7,
    `model` VARCHAR(191) NOT NULL DEFAULT 'gpt-4o',
    `voiceProvider` VARCHAR(191) NOT NULL DEFAULT 'elevenlabs',
    `voiceId` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExternalApi` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NOT NULL,
    `endpointUrl` TEXT NOT NULL,
    `httpMethod` ENUM('GET', 'POST', 'PUT', 'DELETE') NOT NULL DEFAULT 'POST',
    `headers` JSON NULL,
    `parameters` JSON NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ExternalApi_agentId_idx`(`agentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BusinessRule` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 1,
    `condition` TEXT NOT NULL,
    `actionType` ENUM('TRANSFER_HUMAN', 'SEND_CUSTOM_MESSAGE', 'EXECUTE_API', 'STOP_CONVERSATION') NOT NULL,
    `actionConfig` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BusinessRule_agentId_idx`(`agentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Contact_phone_idx` ON `Contact`(`phone`);

-- CreateIndex
CREATE UNIQUE INDEX `Contact_agentId_phone_key` ON `Contact`(`agentId`, `phone`);

-- CreateIndex
CREATE INDEX `Lead_agentId_idx` ON `Lead`(`agentId`);

-- AddForeignKey
ALTER TABLE `ExternalApi` ADD CONSTRAINT `ExternalApi_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BusinessRule` ADD CONSTRAINT `BusinessRule_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Agent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `Message` RENAME INDEX `Message_contactId_fkey` TO `Message_contactId_idx`;
