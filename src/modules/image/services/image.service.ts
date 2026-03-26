import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { FileFolderEnum } from '../enums/file-folder.enum';

interface UploadedImage {
  buffer: Buffer;
  mimetype?: string;
}

@Injectable()
export class ImageService {
  private readonly serverUrl = process.env.SERVER_URL;
  private readonly uploadsPath = join(process.cwd(), 'uploads');
  private readonly logger = new Logger(ImageService.name);

  constructor() {
    if (!existsSync(this.uploadsPath)) {
      mkdirSync(this.uploadsPath, { recursive: true });
    }
  }

  async saveImage({
    file,
    folder,
    entityId,
  }: {
    file: UploadedImage;
    folder: FileFolderEnum;
    entityId?: string | number;
  }): Promise<string> {
    if (!file?.buffer) {
      throw new Error('File not provided');
    }

    const safeEntityId = String(entityId ?? 'common').replace(
      /[^a-zA-Z0-9_-]/g,
      '_',
    );
    const folderPath = join(this.uploadsPath, folder, safeEntityId);

    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
    }

    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1e9);
    const filename = `${timestamp}-${random}.webp`;
    const filePath = join(folderPath, filename);

    const webpBuffer = await sharp(file.buffer)
      .webp({
        quality: 80,
        effort: 6,
      })
      .toBuffer();

    await writeFile(filePath, webpBuffer);

    const fileKey = `${folder}/${safeEntityId}/${filename}`;
    return this.getPublicUrl(fileKey) || fileKey;
  }

  async saveImages({
    files,
    folder,
    entityId,
  }: {
    files: UploadedImage[];
    folder: FileFolderEnum;
    entityId?: string | number;
  }): Promise<string[]> {
    if (!files?.length) {
      throw new Error('Files not provided');
    }

    const results = await Promise.all(
      files.map((file) => this.saveImage({ file, folder, entityId })),
    );

    return results;
  }

  private normalizeKey(fileRef: string): string {
    if (!fileRef) {
      return '';
    }

    if (fileRef.startsWith('http://') || fileRef.startsWith('https://')) {
      try {
        const parsed = new URL(fileRef);
        const path = parsed.pathname.replace(/^\/+/, '');

        if (path.startsWith('uploads/')) {
          return path.replace(/^uploads\//, '');
        }

        return path;
      } catch {
        return fileRef;
      }
    }

    return fileRef.replace(/^\/+/, '').replace(/^uploads\//, '');
  }

  getPublicUrl(fileRef?: string | null): string | null {
    if (!fileRef) {
      return null;
    }

    if (fileRef.startsWith('http://') || fileRef.startsWith('https://')) {
      return fileRef;
    }

    const normalized = this.normalizeKey(fileRef);
    if (!normalized) {
      return null;
    }

    const baseUrl = (this.serverUrl || '').replace(/\/+$/, '');
    if (!baseUrl) {
      return `/uploads/${normalized}`;
    }

    return `${baseUrl}/uploads/${normalized}`;
  }

  async deleteImage(fileRef: string): Promise<boolean> {
    try {
      const key = this.normalizeKey(fileRef);
      const absolutePath = join(this.uploadsPath, key);

      if (existsSync(absolutePath)) {
        await unlink(absolutePath);
        this.logger.log(`File deleted: ${absolutePath}`);
        return true;
      }

      this.logger.warn(`File not found: ${absolutePath}`);
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error deleting file: ${message}`);
      return false;
    }
  }
}
