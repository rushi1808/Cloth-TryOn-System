import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, ArrowRight, Search, Mic, CheckCircle, Ruler, ShoppingBag, Zap, X, Sparkles } from 'lucide-react';
import { Product, OutfitState, TryOnResult } from '../types';
import { searchProducts, generateTryOnImage } from '../services/gemini-client';
import { ScannerLoader } from './ScannerLoader';

// Size detection helper
async function detectBodySize(photoBase64) {
  try {
    const res = await fetch('/api/gemini/detect-size', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Image: photoBase64 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

const SIZE_COLORS = { XS: '#8b5cf6', S: '#3b82f6', M: '#10b981', L: '#f59e0b', XL: '#ef4444', XXL: '#ec4899' };

function SizeBadge({ size, measurements, build }) {
  const color = SIZE_COLORS[size] || '#6b7280';
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border"
      style={{ borderColor: `${color}40`, backgroundColor: `${color}10` }}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
        style={{ backgroundColor: color, color: '#fff' }}>
        {size}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Ruler className="w-3 h-3 text-gray-400" />
          <span className="font-mono text-[8px] uppercase text-gray-400 tracking-widest">Your Estimated Size</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {measurements && Object.entries(measurements).map(([k, v]) => (
            <span key={k} className="font-mono text-[8px] text-gray-400">
              <span className="text-gray-600 uppercase">{k}:</span> <span style={{ color }}>{String(v)}</span>
            </span>
          ))}
          {build && (
            <span className="font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${color}20`, color }}>
              {build}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductCard({ product, isRendering, isDone, sizeInfo, onInstantTryOn }) {
  const recommended = sizeInfo?.size || 'M';
  const color = SIZE_COLORS[recommended] || '#6b7280';

  return (
    <button
      onClick={() => !isRendering && onInstantTryOn(product)}
      disabled={isRendering}
      className={`relative w-full text-left rounded-lg border transition-all overflow-hidden group ${
        isRendering
          ? 'border-orange-500 bg-orange-500/10 cursor-wait'
          : isDone
          ? 'border-green-500/60 bg-green-500/10 hover:border-green-400'
          : 'border-white/10 bg-zinc-900/60 hover:border-orange-500/60 hover:bg-orange-500/5 active:scale-[0.98]'
      }`}
    >
      {/* Shimmer while rendering */}
      {isRendering && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500/10 to-transparent animate-[shimmer_1.5s_infinite]" />
      )}

      <div className="flex gap-3 p-2.5">
        {/* Product Image */}
        <div className="relative w-16 h-20 flex-shrink-0 rounded overflow-hidden bg-zinc-800">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-gray-600" />
            </div>
          )}

          {/* State overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            {isRendering
              ? <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
              : isDone
              ? <CheckCircle className="w-5 h-5 text-green-400" />
              : <Zap className="w-5 h-5 text-orange-400" />
            }
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-start justify-between gap-1">
            <div>
              <p className="font-mono text-[8px] uppercase text-gray-500 tracking-widest">{product.brand}</p>
              <p className="text-white text-sm font-medium leading-tight mt-0.5 line-clamp-2">{product.name}</p>
            </div>
            <span className="font-mono text-sm text-orange-400 font-bold flex-shrink-0">{product.price}</span>
          </div>

          {/* Status / size row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="font-mono text-[7px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-zinc-800 text-gray-500">
              {product.category}
            </span>
            <span className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded text-white"
              style={{ backgroundColor: color }}>
              Size {recommended}
            </span>
            {isRendering && (
              <span className="font-mono text-[8px] text-orange-400 animate-pulse">Swapping...</span>
            )}
            {isDone && (
              <span className="font-mono text-[8px] text-green-400 flex items-center gap-1">
                <CheckCircle className="w-2.5 h-2.5" /> Done
              </span>
            )}
            {!isRendering && !isDone && (
              <span className="font-mono text-[7px] text-gray-600 group-hover:text-orange-400 transition-colors">
                Tap to swap →
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

const DEFAULT_QUERIES = {
  mens: ['Stussy Hoodie', 'Nike Jacket', "Levi's Jeans", 'Ralph Lauren Shirt', 'Carhartt Jacket'],
  womens: ['Reformation Dress', 'Oversized Blazer', 'Mini Skirt', 'Knit Sweater', 'Wide Leg Jeans'],
  default: ['Hoodie', 'Jacket', 'Jeans', 'Sneakers', 'Oxford Shirt'],
};

interface StudioControlsProps {
  userPhoto: string;
  userGender?: string;
  currentOutfit: OutfitState;
  onNewTryOn: (result: TryOnResult) => void;
  setGeneratedLooks: React.Dispatch<React.SetStateAction<TryOnResult[]>>;
}

export const StudioControls: React.FC<StudioControlsProps> = ({
  userPhoto,
  userGender,
  currentOutfit,
  onNewTryOn,
  setGeneratedLooks
}) => {
  const [input, setInput] = useState('');

  // Products
  const [suggestedProducts, setSuggestedProducts] = useState<Product[]>([]);
  const [showProductPanel, setShowProductPanel] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Per-card rendering states: productId → 'rendering' | 'done' | null
  const [cardStates, setCardStates] = useState<Record<string, 'rendering' | 'done'>>({});

  // Size detection
  const [sizeInfo, setSizeInfo] = useState<any>(null);
  const [loadingSize, setLoadingSize] = useState(false);

  // Global status overlay
  const [activeSwap, setActiveSwap] = useState(false);

  // Auto detect size + load products on photo change
  useEffect(() => {
    if (!userPhoto) return;
    setLoadingSize(true);
    detectBodySize(userPhoto).then(s => { setSizeInfo(s); setLoadingSize(false); });
    autoLoadProducts();
  }, [userPhoto]);

  const autoLoadProducts = useCallback(async (query?: string) => {
    const defaultQueries = DEFAULT_QUERIES[userGender || 'default'] || DEFAULT_QUERIES.default;
    const searchQuery = query || defaultQueries[Math.floor(Math.random() * defaultQueries.length)];
    setLoadingProducts(true);
    try {
      const products = await searchProducts(searchQuery, userGender);
      setSuggestedProducts(products.slice(0, 5));
      setShowProductPanel(true);
    } catch (e) {
      console.error('Product load error:', e);
    } finally {
      setLoadingProducts(false);
    }
  }, [userGender]);

  const handleSearch = async (query?: string) => {
    const q = query || input.trim();
    if (!q) return;
    setLoadingProducts(true);
    setCardStates({});
    try {
      const products = await searchProducts(q, userGender);
      setSuggestedProducts(products.slice(0, 5));
      setShowProductPanel(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProducts(false);
    }
  };

  // Clicking a card instantly swaps that outfit onto the user photo
  const handleInstantTryOn = async (product: Product) => {
    if (activeSwap) return; // prevent concurrent swaps

    setActiveSwap(true);
    setCardStates(prev => ({ ...prev, [product.id]: 'rendering' }));

    try {
      // Build outfit state
      const outfit: OutfitState = { ...currentOutfit };
      if (product.category === 'one-piece') {
        delete outfit.top;
        delete outfit.bottom;
        outfit['one-piece'] = product;
      } else {
        outfit[product.category] = product;
        if (['top', 'bottom'].includes(product.category)) delete outfit['one-piece'];
      }
      const items = Object.values(outfit).filter((i): i is Product => !!i);
      const img = await generateTryOnImage(userPhoto, items);

      if (img) {
        onNewTryOn({
          id: crypto.randomUUID(),
          productId: product.id,
          product,
          outfit: items,
          imageUrl: img,
          timestamp: Date.now(),
        });
        setCardStates(prev => ({ ...prev, [product.id]: 'done' }));
      } else {
        setCardStates(prev => { const n = { ...prev }; delete n[product.id]; return n; });
      }
    } catch (err) {
      console.error('Instant try-on error:', err);
      setCardStates(prev => { const n = { ...prev }; delete n[product.id]; return n; });
    } finally {
      setActiveSwap(false);
    }
  };

  const quickActions = DEFAULT_QUERIES[userGender || 'default'] || DEFAULT_QUERIES.default;

  return (
    <>
      {/* Full-panel scanner overlay while swapping */}
      {activeSwap && (
        <div className="absolute inset-0 z-40 rounded-lg overflow-hidden pointer-events-none">
          <ScannerLoader text="SWAPPING OUTFIT" className="w-full h-full" />
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-50 flex flex-col max-h-[80%]">

        {/* ── Product Panel ── */}
        {showProductPanel && (
          <div className="mx-3 mb-2 rounded-xl border border-white/10 bg-black/92 backdrop-blur-2xl overflow-hidden animate-in slide-in-from-bottom-4 shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                <span className="font-mono text-[9px] uppercase tracking-widest text-gray-300">
                  {loadingProducts ? 'Finding Options...' : `${suggestedProducts.length} Options — Tap to Swap`}
                </span>
              </div>
              <button onClick={() => setShowProductPanel(false)}
                className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Size badge */}
            <div className="px-3 py-2 border-b border-white/5">
              {loadingSize ? (
                <div className="flex items-center gap-2 text-gray-500 py-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="font-mono text-[8px] uppercase">Analyzing body proportions...</span>
                </div>
              ) : sizeInfo ? (
                <SizeBadge size={sizeInfo.size} measurements={sizeInfo.measurements} build={sizeInfo.build} />
              ) : null}
            </div>

            {/* Loading skeleton */}
            {loadingProducts && (
              <div className="p-3 space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-3 p-2.5 rounded-lg border border-white/5 bg-zinc-900/40 animate-pulse">
                    <div className="w-16 h-20 rounded bg-zinc-800" />
                    <div className="flex-1 py-1 space-y-2">
                      <div className="h-2 bg-zinc-800 rounded w-1/3" />
                      <div className="h-3 bg-zinc-800 rounded w-2/3" />
                      <div className="h-2 bg-zinc-800 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Product cards — tap any card to instantly swap */}
            {!loadingProducts && (
              <div className="p-3 space-y-2 overflow-y-auto max-h-72 custom-scrollbar">
                {suggestedProducts.length === 0 && (
                  <p className="font-mono text-[9px] text-gray-500 text-center py-4">No products found. Try searching above.</p>
                )}
                {suggestedProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isRendering={cardStates[product.id] === 'rendering'}
                    isDone={cardStates[product.id] === 'done'}
                    sizeInfo={sizeInfo}
                    onInstantTryOn={handleInstantTryOn}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Bottom bar ── */}
        <div className="p-4 bg-gradient-to-t from-black via-black/90 to-transparent">
          {/* Quick tags */}
          <div className="flex overflow-x-auto no-scrollbar gap-2 mb-3">
            {quickActions.map(tag => (
              <button key={tag} onClick={() => { setInput(tag); handleSearch(tag); }}
                className="px-3 py-1.5 rounded-full font-mono text-[9px] uppercase border border-white/20 bg-black/40 text-gray-300 hover:bg-white hover:text-black hover:border-white transition-colors whitespace-nowrap flex items-center gap-1 backdrop-blur-md">
                <Plus className="w-2 h-2" /> {tag}
              </button>
            ))}
          </div>

          {/* Search input */}
          <div className="relative flex items-center bg-zinc-900/60 backdrop-blur-xl border border-white/20 rounded-lg overflow-hidden shadow-2xl transition-all focus-within:border-orange-500/50 focus-within:bg-black/80">
            <div className="pl-4 pr-3 text-gray-500">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search clothes to swap (e.g. 'hoodie', 'jacket')..."
              className="flex-1 py-4 bg-transparent text-white outline-none font-mono text-sm placeholder-gray-600 tracking-wide"
            />
            <div className="pr-2 flex items-center gap-2 border-l border-white/5 pl-2">
              <button className="p-2 hover:text-white text-gray-500 transition-colors">
                <Mic className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleSearch()}
                disabled={!input.trim() || loadingProducts}
                className="p-2 bg-white text-black rounded-md hover:bg-orange-500 hover:text-white transition-all disabled:opacity-50">
                {loadingProducts ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Show panel button */}
          {!showProductPanel && suggestedProducts.length > 0 && (
            <button onClick={() => setShowProductPanel(true)}
              className="mt-2 w-full py-2 rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-400 font-mono text-[9px] uppercase tracking-widest hover:bg-orange-500/20 transition-all flex items-center justify-center gap-2">
              <ShoppingBag className="w-3 h-3" />
              Show {suggestedProducts.length} outfit options
            </button>
          )}
        </div>
      </div>
    </>
  );
};