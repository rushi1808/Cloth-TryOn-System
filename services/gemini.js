import { GoogleGenAI } from "@google/genai";
import { Buffer } from "buffer";
import { logger } from '../lib/logger';
import { rateLimit, isSafeUrl, sanitizeInput } from '../lib/security';
import { redis } from '../lib/redis';

const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const SEARCHAPI_API_KEY = process.env.SEARCHAPI_API_KEY || "";

// --- MOCK DATA FOR FALLBACK ---
const MOCK_PRODUCTS = [
  { id: 'mock-1', name: 'Stussy Design Hoodie', brand: 'Stussy', price: '$120', category: 'top', description: 'Iconic Stussy hoodie.', imageUrl: '', source: 'search' },
  { id: 'mock-2', name: 'Vintage Carhartt Detroit Jacket', brand: 'Carhartt', price: '$180', category: 'outerwear', description: 'Classic Detroit jacket.', imageUrl: '', source: 'search' },
  { id: 'mock-3', name: 'Ralph Lauren Oxford Shirt', brand: 'Polo Ralph Lauren', price: '$95', category: 'top', description: 'Oxford shirt in light blue.', imageUrl: '', source: 'search' },
  { id: 'mock-4', name: 'Vintage 501 Levi\'s Jeans', brand: 'Levi\'s', price: '$110', category: 'bottom', description: 'Straight leg denim.', imageUrl: '', source: 'search' }
];

export const getMockAlternatives = async (category) => {
  return MOCK_PRODUCTS.filter(p => p.category === category);
};

const imageUrlToBase64 = async (url) => {
  try {
    if (url.startsWith('data:')) return url;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) { logger.error(`Failed to fetch image: ${response.status}`, null, { url }); return null; }
    const contentType = response.headers.get('content-type');
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return `data:${contentType || 'image/jpeg'};base64,${buffer.toString('base64')}`;
  } catch (error) { logger.error(`Failed to convert image to base64`, error, { url }); return null; }
};

const resolveImageInput = async (imageUrl, base64Image) => {
  if (imageUrl) return await imageUrlToBase64(imageUrl);
  if (base64Image) return base64Image;
  return null;
};

export const enhanceUserPhoto = async (imageUrl, base64Image) => {
  try {
    await rateLimit('enhanceUserPhoto', { windowMs: 60000, maxRequests: 5 });
    const ai = getAI();
    const imageData = await resolveImageInput(imageUrl, base64Image);
    if (!imageData) { logger.error("No image provided for enhancement"); return null; }
    const base64Parts = imageData.split(',');
    const cleanBase64 = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
    const mimeType = imageData.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
    const prompt = `Task: Full-Body Fashion Studio Shot. Preserve Face Identity. Output: High resolution, full body visible. Safety: No nudity.`;
    const interaction = await ai.interactions.create({
      model: 'gemini-3-pro-image-preview',
      input: [{ type: 'text', text: prompt }, { type: 'image', data: cleanBase64, mime_type: mimeType }],
      response_modalities: ['image']
    });
    if (interaction.outputs) {
      for (const output of interaction.outputs) {
        if (output.type === 'image' && output.data) return `data:${output.mime_type || 'image/png'};base64,${output.data}`;
      }
    }
    return null;
  } catch (error) { logger.error("Enhancement Error", error); return null; }
};

export const chatWithStylist = async (history, message, outfitContext, closetInventory) => {
  try {
    await rateLimit('chatWithStylist', { windowMs: 60000, maxRequests: 20 });
    const safeMessage = sanitizeInput(message, 500);
    const ai = getAI();
    const sanitizedHistory = history.map(h => ({
      role: h.role === 'model' ? 'model' : 'user',
      parts: h.parts.map(p => ({ text: sanitizeInput(p.text, 500) }))
    }));
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        ...sanitizedHistory,
        { role: 'user', parts: [{ text: `CONTEXT UPDATE:\n- CURRENTLY WEARING: ${sanitizeInput(outfitContext, 500)}\n- USER CLOSET INVENTORY:\n${sanitizeInput(closetInventory, 2000)}\n\nUSER REQUEST: ${safeMessage}` }] }
      ],
      config: {
        systemInstruction: `You are ClothsTryOn, an elite AI Fashion Stylist. Safety: No nudity.`,
        thinkingConfig: { thinkingBudget: 1024 },
        tools: [{ googleSearch: {} }],
      }
    });
    return { text: response.text || "I'm thinking...", groundingMetadata: JSON.parse(JSON.stringify(response.candidates?.[0]?.groundingMetadata || {})) };
  } catch (error) { return { text: "Connection unstable. Please re-enter prompt." }; }
};

export const analyzeClosetFit = async (history, message, attachedItems) => {
  try {
    await rateLimit('analyzeClosetFit', { windowMs: 60000, maxRequests: 10 });
    const ai = getAI();
    const itemsList = attachedItems.map((p, i) => `ITEM_${i}: ${sanitizeInput(p.name)}`).join('\n');
    const specializedPrompt = `SPECIALIZED STYLING SESSION. Items: ${itemsList}. Task: Provide ||CLOSET_LOOK|| and ||HYBRID_LOOK||.`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        ...history.map(h => ({ role: h.role === 'model' ? 'model' : 'user', parts: h.parts })),
        { role: 'user', parts: [{ text: specializedPrompt }] }
      ],
      config: { systemInstruction: "You are a high-end fashion stylist.", thinkingConfig: { thinkingBudget: 2048 } }
    });
    return { text: response.text || "", groundingMetadata: JSON.parse(JSON.stringify(response.candidates?.[0]?.groundingMetadata || {})) };
  } catch (error) { return { text: "I had trouble analyzing those specific pieces." }; }
};

const inferCategory = (title) => {
  const t = title.toLowerCase();
  if (/\b(shirt|blouse|top|tee|t-shirt|sweater|hoodie|cardigan|polo|tank)\b/.test(t)) return 'top';
  if (/\b(pants|jeans|trousers|shorts|skirt|leggings)\b/.test(t)) return 'bottom';
  if (/\b(dress|jumpsuit|romper|gown)\b/.test(t)) return 'one-piece';
  if (/\b(jacket|coat|blazer|parka|vest|windbreaker)\b/.test(t)) return 'outerwear';
  if (/\b(shoes|sneakers|boots|heels|sandals|loafers|flats|oxfords)\b/.test(t)) return 'shoes';
  if (/\b(bag|hat|belt|scarf|watch|jewelry|sunglasses|necklace|bracelet|earring)\b/.test(t)) return 'accessory';
  return 'top';
};

export const searchProducts = async (query, gender) => {
  try {
    await rateLimit('searchProducts', { windowMs: 60000, maxRequests: 30 });
    const safeQuery = sanitizeInput(query, 100);
    const fullQuery = `${safeQuery} ${gender || ''}`.trim();
    const cacheKey = `search:${fullQuery.toLowerCase().replace(/\s+/g, '-')}`;
    if (redis) {
      try { const cached = await redis.get(cacheKey); if (cached) return cached; } catch (e) { }
    }
    const prohibitedTerms = ['nude', 'naked', 'bikini', 'swimwear', 'swimsuit', 'lingerie', 'underwear', 'nsfw'];
    if (prohibitedTerms.some(term => safeQuery.toLowerCase().includes(term))) return [];
    let products = [];
    let isFallback = false;
    if (SEARCHAPI_API_KEY) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const params = new URLSearchParams({ engine: "google_shopping", q: fullQuery, api_key: SEARCHAPI_API_KEY, num: "6", gl: "us", hl: "en" });
        const res = await fetch(`https://www.searchapi.io/api/v1/search?${params.toString()}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          if (data.shopping_results?.length > 0) {
            products = data.shopping_results.slice(0, 6).map((item, idx) => ({ id: `sp-${Date.now()}-${idx}`, name: item.title, brand: item.source || item.seller || 'Unknown', price: item.price || 'Check price', category: inferCategory(item.title), description: item.snippet || item.title, url: item.product_link || item.link, imageUrl: item.thumbnail, source: 'search' }));
          } else isFallback = true;
        } else isFallback = true;
      } catch (e) { isFallback = true; }
    } else isFallback = true;

    if (isFallback) {
      if (!safeQuery.trim()) return MOCK_PRODUCTS;
      try {
        const ai = getAI();
        if (!process.env.GEMINI_API_KEY) return MOCK_PRODUCTS.filter(p => p.name.toLowerCase().includes(safeQuery.toLowerCase())).slice(0, 3);
        const prompt = `Generate 3 realistic fashion product suggestions for query: "${fullQuery}". Return JSON array with fields: name, brand, price (string like "$99"), category (top/bottom/shoes/outerwear/one-piece/accessory), searchTerm.`;
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt, config: { responseMimeType: 'application/json' } });
        const generatedData = JSON.parse(response.text);
        products = generatedData.map((item, idx) => ({ id: `gen-${Date.now()}-${idx}`, name: item.name, brand: item.brand, price: item.price, category: item.category || 'top', description: `${item.brand} ${item.name}`, url: `https://www.google.com/search?q=${encodeURIComponent(item.searchTerm || item.name)}&tbm=shop`, imageUrl: undefined, source: 'generated' }));
      } catch (e) { logger.error("LLM fallback failed", e); return []; }
    }
    if (redis && products.length > 0) { try { await redis.set(cacheKey, products, { ex: 3600 }); } catch (e) { } }
    return products;
  } catch (error) { logger.error("Search Error", error); return []; }
};

export const generateTryOnImage = async (userPhotoUrl, userPhotoBase64, products) => {
  let userImageData = null;
  try {
    await rateLimit('generateTryOnImage', { windowMs: 60000, maxRequests: 5 });
    const ai = getAI();
    userImageData = await resolveImageInput(userPhotoUrl, userPhotoBase64);
    if (!userImageData) { logger.error("No user photo provided for try-on"); return null; }
    const base64Parts = userImageData.split(',');
    const cleanUserBase64 = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
    const userMimeType = userImageData.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
    const textDescriptions = (products || []).map((p, i) => `ITEM ${i + 1}: ${sanitizeInput(p.brand)} ${sanitizeInput(p.name)}`);
    const prompt = `Virtual Try-On. Preserve Face. Outfit: ${textDescriptions.join(', ')}. Safety: No nudity.`;
    const inputs = [{ type: 'text', text: prompt }, { type: 'image', data: cleanUserBase64, mime_type: userMimeType }];
    for (const p of (products || [])) {
      if (p.imageUrl) {
        const productBase64 = await imageUrlToBase64(p.imageUrl);
        if (productBase64) {
          const pClean = productBase64.split(',')[1];
          const pMime = productBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
          inputs.push({ type: 'text', text: `Garment Reference: ${p.name}` });
          inputs.push({ type: 'image', data: pClean, mime_type: pMime });
        }
      }
    }
    const interaction = await ai.interactions.create({ model: 'gemini-3-pro-image-preview', input: inputs, response_modalities: ['image'] });
    if (interaction.outputs) {
      for (const output of interaction.outputs) {
        if (output.type === 'image' && output.data) return `data:${output.mime_type || 'image/png'};base64,${output.data}`;
      }
    }
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key") return userImageData;
    return null;
  } catch (error) { logger.error("Try-On Error", error); return userImageData || null; }
};

export const startRunwayVideo = async (imageUrl, imageBase64) => {
  try {
    await rateLimit('startRunwayVideo', { windowMs: 60000, maxRequests: 1 });
    const ai = getAI();
    const imageData = await resolveImageInput(imageUrl, imageBase64);
    if (!imageData) { logger.error("No image provided for video"); return null; }
    const base64Parts = imageData.split(',');
    const cleanBase64 = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
    const mimeMatch = imageData.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const operation = await ai.models.generateVideos({ model: 'veo-3.1-generate-preview', prompt: 'Cinematic fashion runway walk. 4k, slow motion. Safety: Fully clothed.', image: { imageBytes: cleanBase64, mimeType }, config: { numberOfVideos: 1, resolution: '1080p', aspectRatio: '9:16' } });
    return JSON.stringify(operation);
  } catch (e) { logger.error("Start Video Error", e); return null; }
};

export const checkRunwayVideoStatus = async (operationJson) => {
  try {
    const ai = getAI();
    let operation = JSON.parse(operationJson);
    operation = await ai.operations.getVideosOperation({ operation });
    if (operation.done) {
      const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (uri) {
        try {
          const res = await fetch(`${uri}&key=${process.env.GEMINI_API_KEY}`);
          if (res.ok) {
            const blob = await res.blob();
            const reader = new FileReader();
            return new Promise((resolve) => { reader.onloadend = () => resolve({ status: 'completed', videoUrl: reader.result }); reader.readAsDataURL(blob); });
          }
        } catch (e) { return { status: 'failed' }; }
      }
      return { status: 'failed' };
    }
    return { status: 'running' };
  } catch (e) { return { status: 'failed' }; }
};

export const generate360View = async (imageUrl, imageBase64) => {
  try {
    await rateLimit('generate360View', { windowMs: 60000, maxRequests: 1 });
    const ai = getAI();
    const imageData = await resolveImageInput(imageUrl, imageBase64);
    if (!imageData) { logger.error("No image provided for 360 view"); return null; }
    const base64Parts = imageData.split(',');
    const cleanBase64 = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
    const mimeType = imageData.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
    let operation = await ai.models.generateVideos({ model: 'veo-3.1-generate-preview', prompt: '360 degree turntable rotation. Smooth, continuous. Safety: Fully clothed.', image: { imageBytes: cleanBase64, mimeType }, config: { numberOfVideos: 1, resolution: '1080p', aspectRatio: '9:16' } });
    while (!operation.done) { await new Promise(resolve => setTimeout(resolve, 5000)); operation = await ai.operations.getVideosOperation({ operation }); }
    const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (uri) {
      const res = await fetch(`${uri}&key=${process.env.GEMINI_API_KEY}`);
      if (res.ok) { const blob = await res.blob(); const reader = new FileReader(); return new Promise((resolve) => { reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob); }); }
    }
    return null;
  } catch (error) { logger.error("360 View Gen Error", error); return null; }
};

export const analyzeClosetItem = async (imageUrl, base64Image) => {
  try {
    await rateLimit('analyzeClosetItem', { windowMs: 60000, maxRequests: 10 });
    const ai = getAI();
    const imageData = await resolveImageInput(imageUrl, base64Image);
    if (!imageData) { logger.error("No image provided"); return null; }
    const base64Parts = imageData.split(',');
    const cleanBase64 = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
    const mimeType = imageData.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
    const prompt = `Analyze clothing. Return JSON: { category, name, brand, color }. Categories: top, bottom, shoes, outerwear, one-piece, accessory.`;
    const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: { parts: [{ text: prompt }, { inlineData: { mimeType, data: cleanBase64 } }] }, config: { responseMimeType: 'application/json' } });
    const data = JSON.parse(response.text);
    return { category: data.category, name: data.name, brand: data.brand, color: data.color, description: `A ${data.color} ${data.name} by ${data.brand}`, price: 'Owned', source: 'closet' };
  } catch (e) {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key") return { brand: 'Vintage Store', name: 'Classic Casual Item', category: 'top', color: 'Black', description: 'A classic casual piece.', price: 'Owned', source: 'closet' };
    return null;
  }
};

export const analyzeInspirationImage = async (imageUrl, base64Image) => {
  try {
    await rateLimit('analyzeInspirationImage', { windowMs: 60000, maxRequests: 5 });
    const ai = getAI();
    const imageData = await resolveImageInput(imageUrl, base64Image);
    if (!imageData) { logger.error("No image provided"); return null; }
    const base64Parts = imageData.split(',');
    const cleanBase64 = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
    const mimeType = imageData.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
    const prompt = `Analyze outfit. Suggest 3 tiers (Luxury, Mid, Budget). Return JSON: { totalCost: {luxury, mid, budget}, items: [{category, luxury: {name, brand, price}, mid: {...}, budget: {...}}] }`;
    const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: { parts: [{ text: prompt }, { inlineData: { mimeType, data: cleanBase64 } }] }, config: { responseMimeType: 'application/json' } });
    return JSON.parse(response.text);
  } catch (e) {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key") return { totalCost: { luxury: "$2,450", mid: "$450", budget: "$120" }, items: [{ category: "top", luxury: { name: "Silk Blouse", brand: "Hermès", price: "$1,200" }, mid: { name: "Silk Shirt", brand: "Theory", price: "$280" }, budget: { name: "Satin Shirt", brand: "H&M", price: "$35" } }] };
    return null;
  }
};

export const generateStealTheLook = async (userPhotoUrl, inspirationPhotoUrl, mode = 'full', userPhotoBase64, inspirationPhotoBase64) => {
  try {
    await rateLimit('generateStealTheLook', { windowMs: 60000, maxRequests: 3 });
    const ai = getAI();
    const userImageData = await resolveImageInput(userPhotoUrl, userPhotoBase64);
    const inspirationImageData = await resolveImageInput(inspirationPhotoUrl, inspirationPhotoBase64);
    if (!userImageData || !inspirationImageData) { logger.error("Missing images"); return null; }
    const userClean = userImageData.split(',')[1];
    const userMime = userImageData.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
    const inspoClean = inspirationImageData.split(',')[1];
    const inspoMime = inspirationImageData.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
    const instructions = mode === 'full' ? "TRANSFER COMPLETE OUTFIT." : mode === 'top' ? "TRANSFER UPPER BODY ONLY." : "TRANSFER LOWER BODY ONLY.";
    const prompt = `Style Transfer. ${instructions} Preserve Face/Body Identity. Safety: No nudity.`;
    const interaction = await ai.interactions.create({ model: 'gemini-3-pro-image-preview', input: [{ type: 'text', text: prompt }, { type: 'image', data: userClean, mime_type: userMime }, { type: 'text', text: 'STYLE_REFERENCE' }, { type: 'image', data: inspoClean, mime_type: inspoMime }], response_modalities: ['image'] });
    if (interaction.outputs) { for (const output of interaction.outputs) { if (output.type === 'image' && output.data) return `data:${output.mime_type || 'image/png'};base64,${output.data}`; } }
    return null;
  } catch (e) { return null; }
};

export const getDiscoverQueue = async (gender) => {
  const styles = ["trending streetwear outfit", "avant garde fashion clothing", "minimalist luxury apparel", "techwear clothing", "vintage 90s fashion items"];
  const randomStyle = styles[Math.floor(Math.random() * styles.length)];
  const genderTerm = gender ? `${gender}'s` : '';
  const query = `${genderTerm} ${randomStyle} -perfume -fragrance -cologne -makeup -cosmetics`;
  return await searchProducts(query, gender);
};
