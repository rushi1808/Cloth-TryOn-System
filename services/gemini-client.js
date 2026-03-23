/**
 * Client-safe Gemini API wrapper
 * Calls server-side API routes instead of using Gemini SDK directly
 */

import { uploadImageToStorage, deleteImageFromStorage } from '../lib/storage-utils';

export const enhanceUserPhoto = async (base64Image) => {
    try {
        const imageUrl = await uploadImageToStorage(base64Image, 'enhance');

        const response = await fetch('/api/gemini/enhance-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrl,
                base64Image: !imageUrl ? base64Image : undefined
            }),
        });

        deleteImageFromStorage(imageUrl).catch(() => { });

        if (!response.ok) {
            console.error('Enhance photo request failed:', response.status);
            return null;
        }

        const data = await response.json();
        return data.enhancedImage || null;
    } catch (error) {
        console.error('Enhance photo error:', error);
        return null;
    }
};

export const generateTryOnImage = async (userPhotoBase64, products) => {
    try {
        const userPhotoUrl = await uploadImageToStorage(userPhotoBase64, 'tryon');

        const response = await fetch('/api/gemini/generate-tryon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userPhotoUrl,
                userPhotoBase64: !userPhotoUrl ? userPhotoBase64 : undefined,
                products
            }),
        });

        deleteImageFromStorage(userPhotoUrl).catch(() => { });

        if (!response.ok) {
            console.error('Generate try-on request failed:', response.status);
            return null;
        }

        const data = await response.json();
        return data.generatedImage || null;
    } catch (error) {
        console.error('Generate try-on error:', error);
        return null;
    }
};

export const startRunwayVideo = async (imageBase64) => {
    try {
        const imageUrl = await uploadImageToStorage(imageBase64, 'video');

        const response = await fetch('/api/gemini/start-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrl,
                base64Image: !imageUrl ? imageBase64 : undefined
            }),
        });

        deleteImageFromStorage(imageUrl).catch(() => { });

        if (!response.ok) {
            console.error('Start video request failed:', response.status);
            return null;
        }

        const data = await response.json();
        return data.operationJson || null;
    } catch (error) {
        console.error('Start video error:', error);
        return null;
    }
};

export const checkRunwayVideoStatus = async (operationJson) => {
    try {
        const response = await fetch('/api/gemini/check-video-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationJson }),
        });

        if (!response.ok) {
            console.error('Check video status request failed:', response.status);
            return { status: 'failed' };
        }

        const data = await response.json();
        return {
            status: data.status || 'failed',
            videoUrl: data.videoUrl,
        };
    } catch (error) {
        console.error('Check video status error:', error);
        return { status: 'failed' };
    }
};

export const searchProducts = async (query, gender) => {
    try {
        const response = await fetch('/api/gemini/search-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, gender }),
        });

        if (!response.ok) {
            console.error('Search products request failed:', response.status);
            return [];
        }

        const data = await response.json();
        return data.products || [];
    } catch (error) {
        console.error('Search products error:', error);
        return [];
    }
};

export const chatWithStylist = async (history, message, outfitContext, closetInventory) => {
    try {
        const response = await fetch('/api/gemini/chat-stylist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history, message, outfitContext, closetInventory }),
        });

        if (!response.ok) {
            console.error('Chat stylist request failed:', response.status);
            return { text: 'Connection unstable. Please re-enter prompt.' };
        }

        const data = await response.json();
        return {
            text: data.text || '',
            groundingMetadata: data.groundingMetadata,
        };
    } catch (error) {
        console.error('Chat stylist error:', error);
        return { text: 'Connection unstable. Please re-enter prompt.' };
    }
};

export const analyzeClosetFit = async (history, message, attachedItems) => {
    try {
        const response = await fetch('/api/gemini/analyze-closet-fit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history, message, attachedItems }),
        });

        if (!response.ok) {
            console.error('Analyze closet fit request failed:', response.status);
            return { text: 'I had trouble analyzing those specific pieces.' };
        }

        const data = await response.json();
        return {
            text: data.text || '',
            groundingMetadata: data.groundingMetadata,
        };
    } catch (error) {
        console.error('Analyze closet fit error:', error);
        return { text: 'I had trouble analyzing those specific pieces.' };
    }
};

export const analyzeClosetItem = async (base64Image) => {
    try {
        const imageUrl = await uploadImageToStorage(base64Image, 'closet');

        const response = await fetch('/api/gemini/analyze-closet-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrl,
                base64Image: !imageUrl ? base64Image : undefined
            }),
        });

        deleteImageFromStorage(imageUrl).catch(() => { });

        if (!response.ok) {
            console.error('Analyze closet item request failed:', response.status);
            return null;
        }

        const data = await response.json();
        return data.item || null;
    } catch (error) {
        console.error('Analyze closet item error:', error);
        return null;
    }
};

export const analyzeInspirationImage = async (base64Image) => {
    try {
        const imageUrl = await uploadImageToStorage(base64Image, 'inspiration');

        const response = await fetch('/api/gemini/analyze-inspiration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrl,
                base64Image: !imageUrl ? base64Image : undefined
            }),
        });

        deleteImageFromStorage(imageUrl).catch(() => { });

        if (!response.ok) {
            console.error('Analyze inspiration request failed:', response.status);
            return null;
        }

        const data = await response.json();
        return data.analysis || null;
    } catch (error) {
        console.error('Analyze inspiration error:', error);
        return null;
    }
};

export const generateStealTheLook = async (userPhoto, inspirationPhoto, mode = 'full') => {
    try {
        const [userPhotoUrl, inspirationPhotoUrl] = await Promise.all([
            uploadImageToStorage(userPhoto, 'steal-look'),
            uploadImageToStorage(inspirationPhoto, 'steal-look'),
        ]);

        const response = await fetch('/api/gemini/steal-the-look', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userPhotoUrl,
                inspirationPhotoUrl,
                userPhoto: !userPhotoUrl ? userPhoto : undefined,
                inspirationPhoto: !inspirationPhotoUrl ? inspirationPhoto : undefined,
                mode
            }),
        });

        if (userPhotoUrl) deleteImageFromStorage(userPhotoUrl).catch(() => { });
        if (inspirationPhotoUrl) deleteImageFromStorage(inspirationPhotoUrl).catch(() => { });

        if (!response.ok) {
            console.error('Steal the look request failed:', response.status);
            return null;
        }

        const data = await response.json();
        return data.generatedImage || null;
    } catch (error) {
        console.error('Steal the look error:', error);
        return null;
    }
};

export const generate360View = async (imageBase64) => {
    try {
        const imageUrl = await uploadImageToStorage(imageBase64, '360-view');

        const response = await fetch('/api/gemini/generate-360-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrl,
                imageBase64: !imageUrl ? imageBase64 : undefined
            }),
        });

        if (imageUrl) deleteImageFromStorage(imageUrl).catch(() => { });

        if (!response.ok) {
            console.error('Generate 360 view request failed:', response.status);
            return null;
        }

        const data = await response.json();
        return data.videoUrl || null;
    } catch (error) {
        console.error('Generate 360 view error:', error);
        return null;
    }
};

export const getDiscoverQueue = async (gender) => {
    try {
        const response = await fetch('/api/gemini/discover-queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gender }),
        });

        if (!response.ok) {
            console.error('Discover queue request failed:', response.status);
            return [];
        }

        const data = await response.json();
        return data.products || [];
    } catch (error) {
        console.error('Discover queue error:', error);
        return [];
    }
};
