export const WORKER_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const validateWorkerPhoto = (file: Pick<File, 'type' | 'size'>): string | null =>
  !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ? 'Formato no admitido. Usá JPG, PNG o WebP.'
    : file.size > WORKER_PHOTO_MAX_BYTES
      ? 'La foto supera el máximo de 5 MB.'
      : null;
