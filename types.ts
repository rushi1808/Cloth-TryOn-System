

export interface UserPhoto {
  id: string;
  data: string; // base64
  isPrimary: boolean;
  gender?: 'mens' | 'womens' | 'unisex';
}

export type ProductCategory = 'top' | 'bottom' | 'shoes' | 'outerwear' | 'one-piece' | 'accessory';

export interface Product {
  id: string;
  name: string;
  brand: string;
  price: string;
  url?: string;
  imageUrl?: string;
  description: string;
  category: ProductCategory;
  source?: 'search' | 'closet' | 'generated';
  color?: string;
}

export interface TryOnResult {
  id: string;
  userPhotoId?: string;
  productId: string;
  product: Product;
  outfit: Product[];
  imageUrl: string;
  timestamp: number;
  videoUrl?: string;
  videoStatus?: 'idle' | 'generating' | 'complete' | 'error';
  isSaved?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
  relatedTryOnIds?: string[];
  attachments?: TryOnResult[];
  userAttachments?: Product[];
  isThinking?: boolean;
  groundingMetadata?: any;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  lastModified: number;
  previewText?: string;
}

export enum AppView {
  ONBOARDING = 'ONBOARDING',
  STUDIO = 'STUDIO',
  CHAT = 'CHAT',
  WARDROBE = 'WARDROBE',
  INSPIRATION = 'INSPIRATION',
  DISCOVER = 'DISCOVER',
  THREE_D = 'THREE_D',
}

export interface TierProduct {
  name: string;
  brand: string;
  price: string;
  description?: string;
}

export interface InspirationItem {
  category: string;
  luxury: TierProduct;
  mid: TierProduct;
  budget: TierProduct;
}

export interface InspirationAnalysis {
  totalCost: {
    luxury: string;
    mid: string;
    budget: string;
  };
  items: InspirationItem[];
}

export type OutfitState = Partial<Record<ProductCategory, Product>>;
