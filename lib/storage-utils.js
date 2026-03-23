/**
 * Supabase Storage Utilities
 * Handles image uploads to Supabase Storage to bypass Vercel's body size limits
 */

import { supabase } from './supabase';

const BUCKET_NAME = 'ClothsTryOn-images';

/**
 * Convert base64 string to Blob
 */
const base64ToBlob = (base64) => {
    let base64Data = base64;
    let mimeType = 'image/jpeg';

    if (base64.startsWith('data:')) {
        const matches = base64.match(/^data:(image\/\w+);base64,(.+)$/);
        if (matches) {
            mimeType = matches[1];
            base64Data = matches[2];
        } else {
            base64Data = base64.split(',')[1] || base64;
        }
    }

    const byteCharacters = atob(base64Data);
    const byteNumbers = new Uint8Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    return new Blob([byteNumbers], { type: mimeType });
};

/**
 * Upload a base64 image to Supabase Storage
 */
export const uploadImageToStorage = async (base64Image, folder = 'temp') => {
    if (!supabase) {
        console.warn('Supabase not configured, cannot upload to storage');
        return null;
    }

    try {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 10);
        const extension = base64Image.includes('image/png') ? 'png' : 'jpg';
        const fileName = `${folder}/${timestamp}-${randomId}.${extension}`;

        const blob = base64ToBlob(base64Image);

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, blob, {
                contentType: blob.type,
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Storage upload error:', error);
            return null;
        }

        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(data.path);

        return urlData.publicUrl;
    } catch (error) {
        console.error('Failed to upload image to storage:', error);
        return null;
    }
};

/**
 * Delete an image from Supabase Storage
 */
export const deleteImageFromStorage = async (filePath) => {
    if (!supabase) return false;

    try {
        let path = filePath;
        if (filePath.includes(BUCKET_NAME)) {
            path = filePath.split(`${BUCKET_NAME}/`)[1] || filePath;
        }

        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([path]);

        if (error) {
            console.error('Storage delete error:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Failed to delete image from storage:', error);
        return false;
    }
};

/**
 * Upload multiple images to storage in parallel
 */
export const uploadMultipleImages = async (images, folder = 'temp') => {
    return Promise.all(images.map(img => uploadImageToStorage(img, folder)));
};
