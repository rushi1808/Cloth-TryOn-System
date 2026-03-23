import os
import base64
import json
from io import BytesIO
from typing import Optional, List
import httpx

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types as genai_types

# --- Configuration ---
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

app = FastAPI(title="ClothsTryOn AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://clothstryon.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Helper Functions ---

def resolve_image(image_url: Optional[str], base64_image: Optional[str]) -> Optional[str]:
    """
    Resolve image from URL or base64.
    Returns base64 data URI string or None.
    """
    if image_url:
        try:
            response = httpx.get(image_url, timeout=10)
            response.raise_for_status()
            content_type = response.headers.get("content-type", "image/jpeg")
            b64 = base64.b64encode(response.content).decode()
            return f"data:{content_type};base64,{b64}"
        except Exception as e:
            print(f"Failed to fetch image from URL: {e}")
            return None
    if base64_image:
        return base64_image
    return None


def extract_base64(data_uri: str):
    """Extract raw base64 and mime type from data URI."""
    if data_uri.startswith("data:"):
        parts = data_uri.split(",", 1)
        if len(parts) == 2:
            header = parts[0]  # e.g., data:image/jpeg;base64
            mime = header.split(";")[0].split(":")[1]
            return parts[1], mime
    return data_uri, "image/jpeg"




# --- Models (Pydantic) ---

class EnhancePhotoRequest(BaseModel):
    imageUrl: Optional[str] = None
    base64Image: Optional[str] = None


class TryOnRequest(BaseModel):
    userPhotoUrl: Optional[str] = None
    userPhotoBase64: Optional[str] = None
    products: Optional[List[dict]] = []


class ChatRequest(BaseModel):
    history: List[dict]
    message: str
    outfitContext: str = ""
    closetInventory: str = ""


class SearchRequest(BaseModel):
    query: str
    gender: Optional[str] = None


class AnalyzeItemRequest(BaseModel):
    imageUrl: Optional[str] = None
    base64Image: Optional[str] = None


class GenerateStealLookRequest(BaseModel):
    userPhotoUrl: Optional[str] = None
    inspirationPhotoUrl: Optional[str] = None
    userPhoto: Optional[str] = None
    inspirationPhoto: Optional[str] = None
    mode: str = "full"


class Generate360ViewRequest(BaseModel):
    imageUrl: Optional[str] = None
    imageBase64: Optional[str] = None


# --- Endpoints ---

@app.post("/enhance-photo")
async def enhance_photo(req: EnhancePhotoRequest):
    """Enhance user photo. Falls back to original if no API key."""
    image_data = resolve_image(req.imageUrl, req.base64Image)
    if not image_data:
        raise HTTPException(status_code=400, detail="No image provided")

    # No API key — just return the original image as-is
    if not client:
        return {"enhancedImage": image_data}

    try:
        raw_b64, mime = extract_base64(image_data)
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=[
                "Enhance this photo to a professional fashion studio quality. Preserve face identity. High resolution. Safety: No nudity.",
                genai_types.Part.from_bytes(data=base64.b64decode(raw_b64), mime_type=mime)
            ]
        )
        for part in response.candidates[0].content.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                encoded = base64.b64encode(part.inline_data.data).decode()
                return {"enhancedImage": f"data:{part.inline_data.mime_type};base64,{encoded}"}
    except Exception as e:
        print(f"Enhance photo error: {e}")

    # Fallback: return original unchanged
    return {"enhancedImage": image_data}


@app.post("/generate-tryon")
async def generate_tryon(req: TryOnRequest):
    """Generate virtual try-on image. Returns original photo if no API key."""
    image_data = resolve_image(req.userPhotoUrl, req.userPhotoBase64)
    if not image_data:
        raise HTTPException(status_code=400, detail="No user photo provided")

    if not client:
        return {"generatedImage": image_data}

    try:
        raw_b64, mime = extract_base64(image_data)
        product_descs = [f"{p.get('brand', '')} {p.get('name', '')}" for p in (req.products or [])]
        prompt = f"Virtual Try-On fashion photo. Outfit to wear: {', '.join(product_descs)}. Preserve the person's face and body structure. High quality. Safety: No nudity."

        contents = [
            prompt,
            genai_types.Part.from_bytes(data=base64.b64decode(raw_b64), mime_type=mime)
        ]
        for product in (req.products or []):
            if product.get("imageUrl"):
                prod_data = resolve_image(product["imageUrl"], None)
                if prod_data:
                    p_b64, p_mime = extract_base64(prod_data)
                    contents.append(f"Garment reference: {product.get('name', '')}")
                    contents.append(genai_types.Part.from_bytes(data=base64.b64decode(p_b64), mime_type=p_mime))

        response = client.models.generate_content(model="gemini-2.0-flash-exp", contents=contents)
        for part in response.candidates[0].content.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                encoded = base64.b64encode(part.inline_data.data).decode()
                return {"generatedImage": f"data:{part.inline_data.mime_type};base64,{encoded}"}
    except Exception as e:
        print(f"Generate tryon error: {e}")

    return {"generatedImage": image_data}


@app.post("/chat-stylist")
async def chat_stylist(req: ChatRequest):
    """Chat with AI fashion stylist."""
    if not client:
        return {"text": "AI stylist is unavailable — please add your GEMINI_API_KEY to .env.local to enable chat."}

    try:
        history_parts = []
        for h in req.history:
            role = "user" if h["role"] == "user" else "model"
            text = " ".join(p["text"] for p in h.get("parts", []))
            history_parts.append(genai_types.Content(role=role, parts=[genai_types.Part.from_text(text=text)]))

        full_message = f"You are a professional fashion stylist AI.\nContext - Currently wearing: {req.outfitContext}\nCloset items: {req.closetInventory}\n\nUser: {req.message}"
        history_parts.append(genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=full_message)]))

        response = client.models.generate_content(model="gemini-1.5-flash", contents=history_parts)
        return {"text": response.text}
    except Exception as e:
        print(f"Chat stylist error: {e}")
        return {"text": "I'm having trouble connecting right now. Please try again."}



# --- Large Mock Product Catalog (used when no API keys are configured) ---
MOCK_CATALOG = [
    # HOODIES & SWEATSHIRTS
    {"id": "m-1",  "name": "Classic Logo Hoodie",          "brand": "Stussy",          "price": "$120", "category": "top",      "description": "Iconic Stussy logo hoodie in heavyweight cotton.",       "imageUrl": "https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=400", "source": "mock"},
    {"id": "m-2",  "name": "Reverse Weave Hoodie",         "brand": "Champion",        "price": "$75",  "category": "top",      "description": "Champion reverse weave pullover hoodie.",                "imageUrl": "https://images.unsplash.com/photo-1578932750294-f5075e85f44a?w=400", "source": "mock"},
    {"id": "m-3",  "name": "Essential Fleece Hoodie",      "brand": "Nike",            "price": "$65",  "category": "top",      "description": "Nike essential fleece pullover hoodie.",                 "imageUrl": "https://images.unsplash.com/photo-1509942774463-acf339cf87d5?w=400", "source": "mock"},
    {"id": "m-4",  "name": "Box Logo Hoodie",              "brand": "Supreme",         "price": "$168", "category": "top",      "description": "Supreme box logo pullover hoodie, limited edition.",    "imageUrl": "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=400", "source": "mock"},
    {"id": "m-5",  "name": "OG Hoodie",                    "brand": "Carhartt WIP",    "price": "$110", "category": "top",      "description": "Carhartt WIP signature hooded sweatshirt.",              "imageUrl": "https://images.unsplash.com/photo-1614093302611-8efc4c4b6abc?w=400", "source": "mock"},
    # T-SHIRTS & TOPS
    {"id": "m-6",  "name": "Oversized Graphic Tee",        "brand": "Off-White",       "price": "$295", "category": "top",      "description": "Off-White signature diagonal stripe graphic tee.",      "imageUrl": "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=400", "source": "mock"},
    {"id": "m-7",  "name": "Logo Crew Neck Tee",           "brand": "Polo Ralph Lauren","price": "$45", "category": "top",      "description": "Classic Polo Ralph Lauren logo crew neck tee.",         "imageUrl": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400", "source": "mock"},
    {"id": "m-8",  "name": "Basic Tee 3-Pack",             "brand": "Uniqlo",          "price": "$29",  "category": "top",      "description": "Uniqlo smooth cotton crew neck tee pack.",               "imageUrl": "https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?w=400", "source": "mock"},
    {"id": "m-9",  "name": "Striped Breton Tee",           "brand": "Saint James",     "price": "$135", "category": "top",      "description": "Authentic French Breton stripe marinière.",              "imageUrl": "https://images.unsplash.com/photo-1562157873-818bc0726f68?w=400", "source": "mock"},
    {"id": "m-10", "name": "Oversize Washed Tee",          "brand": "Fear of God",     "price": "$180", "category": "top",      "description": "Fear of God essentials oversized tee in washed cotton.", "imageUrl": "https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?w=400", "source": "mock"},
    # JACKETS & OUTERWEAR
    {"id": "m-11", "name": "Detroit Jacket",               "brand": "Carhartt",        "price": "$180", "category": "outerwear","description": "Classic Detroit jacket with corduroy collar.",           "imageUrl": "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400", "source": "mock"},
    {"id": "m-12", "name": "Coaches Jacket",               "brand": "Nike",            "price": "$90",  "category": "outerwear","description": "Nike woven coaches jacket with full zip.",               "imageUrl": "https://images.unsplash.com/photo-1544923246-77307dd654cb?w=400", "source": "mock"},
    {"id": "m-13", "name": "Varsity Bomber Jacket",        "brand": "Alpha Industries","price": "$250", "category": "outerwear","description": "Classic MA-1 varsity bomber jacket.",                   "imageUrl": "https://images.unsplash.com/photo-1548883354-94bcfe321cbb?w=400", "source": "mock"},
    {"id": "m-14", "name": "Windrunner Jacket",            "brand": "Nike",            "price": "$120", "category": "outerwear","description": "Iconic Nike Windrunner full-zip jacket.",                "imageUrl": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400", "source": "mock"},
    {"id": "m-15", "name": "Field Jacket",                 "brand": "A.P.C.",          "price": "$495", "category": "outerwear","description": "A.P.C. cotton field jacket with press-stud closure.",   "imageUrl": "https://images.unsplash.com/photo-1523205771623-e0faa4d2813d?w=400", "source": "mock"},
    {"id": "m-16", "name": "Harrington Jacket",            "brand": "Baracuta",        "price": "$395", "category": "outerwear","description": "Original G9 Harrington jacket in Harrington tartan.",  "imageUrl": "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=400", "source": "mock"},
    # JEANS & PANTS
    {"id": "m-17", "name": "501 Original Jeans",           "brand": "Levi's",          "price": "$110", "category": "bottom",   "description": "Straight leg denim jeans in medium wash.",               "imageUrl": "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400", "source": "mock"},
    {"id": "m-18", "name": "Slim Tapered Jeans",           "brand": "Acne Studios",    "price": "$280", "category": "bottom",   "description": "Acne Studios North slim tapered jeans.",                 "imageUrl": "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400", "source": "mock"},
    {"id": "m-19", "name": "Cargo Pants",                  "brand": "Dickies",         "price": "$55",  "category": "bottom",   "description": "Dickies relaxed fit straight leg cargo pants.",          "imageUrl": "https://images.unsplash.com/photo-1565084888279-aca607bb7f82?w=400", "source": "mock"},
    {"id": "m-20", "name": "Chino Pants",                  "brand": "Dockers",         "price": "$65",  "category": "bottom",   "description": "Classic slim fit chino pants in khaki.",                 "imageUrl": "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400", "source": "mock"},
    {"id": "m-21", "name": "Wide Leg Trousers",            "brand": "Zara",            "price": "$49",  "category": "bottom",   "description": "Wide leg tailored trousers in ecru.",                    "imageUrl": "https://images.unsplash.com/photo-1594938298603-c8148c4b4f36?w=400", "source": "mock"},
    # SHOES & SNEAKERS
    {"id": "m-22", "name": "Air Force 1 Low",              "brand": "Nike",            "price": "$110", "category": "shoes",    "description": "Classic Nike Air Force 1 Low in white leather.",         "imageUrl": "https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=400", "source": "mock"},
    {"id": "m-23", "name": "Stan Smith",                   "brand": "Adidas",          "price": "$90",  "category": "shoes",    "description": "Adidas Stan Smith leather sneakers.",                    "imageUrl": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400", "source": "mock"},
    {"id": "m-24", "name": "New Balance 990v5",            "brand": "New Balance",     "price": "$175", "category": "shoes",    "description": "New Balance 990v5 grey made in USA.",                    "imageUrl": "https://images.unsplash.com/photo-1539185441755-769473a23570?w=400", "source": "mock"},
    {"id": "m-25", "name": "Chuck 70 Hi",                  "brand": "Converse",        "price": "$85",  "category": "shoes",    "description": "Converse Chuck 70 high top canvas sneakers.",            "imageUrl": "https://images.unsplash.com/photo-1494496195158-c3becb4f2475?w=400", "source": "mock"},
    {"id": "m-26", "name": "Sk8-Hi",                       "brand": "Vans",            "price": "$70",  "category": "shoes",    "description": "Vans Sk8-Hi classic skate shoes.",                      "imageUrl": "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=400", "source": "mock"},
    # SHIRTS
    {"id": "m-27", "name": "Oxford Button Down",           "brand": "Polo Ralph Lauren","price": "$95", "category": "top",      "description": "Crisp cotton oxford shirt in light blue.",               "imageUrl": "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400", "source": "mock"},
    {"id": "m-28", "name": "Flannel Shirt",                "brand": "Pendleton",       "price": "$110", "category": "top",      "description": "Pendleton wool flannel shirt in plaid.",                 "imageUrl": "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400", "source": "mock"},
    {"id": "m-29", "name": "Denim Shirt",                  "brand": "Levi's",          "price": "$70",  "category": "top",      "description": "Classic Levi's denim western shirt.",                    "imageUrl": "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=400", "source": "mock"},
    # ACCESSORIES
    {"id": "m-30", "name": "Bucket Hat",                   "brand": "Kangol",          "price": "$55",  "category": "accessory","description": "Iconic Kangol wool blend bucket hat.",                   "imageUrl": "https://images.unsplash.com/photo-1521369909029-2afed882baee?w=400", "source": "mock"},
    {"id": "m-31", "name": "5-Panel Cap",                  "brand": "Palace",          "price": "$45",  "category": "accessory","description": "Palace Skateboards embroidered 5-panel cap.",            "imageUrl": "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400", "source": "mock"},
    {"id": "m-32", "name": "Crossbody Bag",                "brand": "Coach",           "price": "$295", "category": "accessory","description": "Coach leather crossbody bag in saddle.",                 "imageUrl": "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400", "source": "mock"},
    {"id": "m-33", "name": "Logo Belt",                    "brand": "Gucci",           "price": "$450", "category": "accessory","description": "Gucci GG Supreme canvas belt with double G buckle.",     "imageUrl": "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=400", "source": "mock"},
    # DRESSES (one-piece)
    {"id": "m-34", "name": "Slip Dress",                   "brand": "Reformation",     "price": "$218", "category": "one-piece","description": "Reformation slip midi dress in ivory satin.",           "imageUrl": "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=400", "source": "mock"},
    {"id": "m-35", "name": "Wrap Dress",                   "brand": "Diane von Furstenberg","price":"$368","category":"one-piece","description":"DVF iconic wrap dress in floral print.",              "imageUrl": "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=400", "source": "mock"},
    {"id": "m-36", "name": "Mini Blazer Dress",            "brand": "Zara",            "price": "$79",  "category": "one-piece","description": "Structured mini blazer dress in black.",               "imageUrl": "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=400", "source": "mock"},
    # STREETWEAR SPECIFIC
    {"id": "m-37", "name": "World Famous Tee",             "brand": "Stussy",          "price": "$45",  "category": "top",      "description": "Stussy world famous logo tee.",                          "imageUrl": "https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=400", "source": "mock"},
    {"id": "m-38", "name": "Paisley Bandana",              "brand": "Supreme",         "price": "$38",  "category": "accessory","description": "Supreme paisley print bandana.",                         "imageUrl": "https://images.unsplash.com/photo-1544816155-12df9643f363?w=400", "source": "mock"},
    {"id": "m-39", "name": "Techwear Joggers",             "brand": "Acronym",         "price": "$595", "category": "bottom",   "description": "ACRONYM encapsulated nylon jogger pants.",               "imageUrl": "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=400", "source": "mock"},
    {"id": "m-40", "name": "Vintage Washed Hoodie",        "brand": "Fear of God",     "price": "$320", "category": "top",      "description": "Fear of God essentials washed fleece hoodie.",           "imageUrl": "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=400", "source": "mock"},
    # LUXURY
    {"id": "m-41", "name": "Cashmere Crew Sweater",        "brand": "Loro Piana",      "price": "$1200","category": "top",      "description": "Loro Piana baby cashmere crew neck sweater.",            "imageUrl": "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400", "source": "mock"},
    {"id": "m-42", "name": "Tailored Blazer",              "brand": "Brunello Cucinelli","price":"$2800","category":"outerwear", "description":"Brunello Cucinelli cashmere-blend tailored blazer.",      "imageUrl": "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=400", "source": "mock"},
    {"id": "m-43", "name": "Leather Chelsea Boots",        "brand": "Common Projects", "price": "$650", "category": "shoes",    "description": "Common Projects leather Chelsea boots.",                 "imageUrl": "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400", "source": "mock"},
    # SKIRTS
    {"id": "m-44", "name": "Pleated Mini Skirt",           "brand": "A.P.C.",          "price": "$195", "category": "bottom",   "description": "A.P.C. pleated mini skirt in black.",                   "imageUrl": "https://images.unsplash.com/photo-1583496661160-fb5218e5fc26?w=400", "source": "mock"},
    {"id": "m-45", "name": "Midi Slit Skirt",              "brand": "& Other Stories", "price": "$89",  "category": "bottom",   "description": "Midi-length skirt with front slit.",                    "imageUrl": "https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=400", "source": "mock"},
]

# --- Category keyword mapping ---
CATEGORY_KEYWORDS = {
    "top":      ["hoodie", "tee", "shirt", "blouse", "sweater", "sweatshirt", "top", "polo", "tank", "jersey", "knit", "pullover", "crewneck", "cardigan"],
    "bottom":   ["jeans", "pants", "trousers", "shorts", "skirt", "chino", "legging", "denim", "cargo", "jogger"],
    "outerwear":["jacket", "coat", "blazer", "parka", "vest", "windbreaker", "anorak", "bomber", "overcoat"],
    "shoes":    ["shoe", "sneaker", "boot", "heel", "sandal", "loafer", "trainer", "kicks", "footwear"],
    "one-piece":["dress", "jumpsuit", "romper", "gown", "mini", "midi", "maxi"],
    "accessory":["bag", "hat", "cap", "belt", "scarf", "watch", "sunglasses", "jewelry", "necklace", "bracelet", "earring", "backpack", "wallet", "bandana"],
}

def infer_category_from_query(query: str) -> Optional[str]:
    q = query.lower()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in q for kw in keywords):
            return cat
    return None

def search_mock_catalog(query: str, gender: Optional[str] = None) -> list:
    """Filter mock catalog by query keywords."""
    q = query.lower()
    words = [w for w in q.split() if len(w) > 2]
    
    # Filter by brand, name, category, or description
    matches = []
    for product in MOCK_CATALOG:
        score = 0
        searchable = f"{product['name']} {product['brand']} {product['category']} {product['description']}".lower()
        for word in words:
            if word in searchable:
                score += 1
        if score > 0:
            matches.append((score, product))
    
    # Sort by relevance score
    matches.sort(key=lambda x: x[0], reverse=True)
    
    # If no matches, return top products from inferred category or random selection
    if not matches:
        cat = infer_category_from_query(query)
        if cat:
            cat_products = [p for p in MOCK_CATALOG if p["category"] == cat]
            return cat_products[:6] if cat_products else MOCK_CATALOG[:6]
        return MOCK_CATALOG[:6]
    
    return [m[1] for m in matches[:6]]


@app.post("/search-products")
async def search_products(req: SearchRequest):
    """Search for fashion products. Falls back to mock catalog when no API keys configured."""
    searchapi_key = os.environ.get("SEARCHAPI_API_KEY", "")
    products = []

    # 1. Try real SearchAPI
    if searchapi_key:
        full_query = f"{req.query} {req.gender or ''}".strip()
        try:
            async with httpx.AsyncClient(timeout=10) as http_client:
                resp = await http_client.get(
                    "https://www.searchapi.io/api/v1/search",
                    params={"engine": "google_shopping", "q": full_query, "api_key": searchapi_key, "num": 6}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for i, item in enumerate(data.get("shopping_results", [])[:6]):
                        products.append({
                            "id": f"sp-{i}",
                            "name": item.get("title", ""),
                            "brand": item.get("source", "Unknown"),
                            "price": item.get("price", "Check price"),
                            "category": infer_category_from_query(item.get("title", "")),
                            "description": item.get("snippet", ""),
                            "url": item.get("product_link", ""),
                            "imageUrl": item.get("thumbnail", ""),
                            "source": "search"
                        })
        except Exception as e:
            print(f"SearchAPI error: {e}")

    # 2. Try Gemini AI
    if not products and GEMINI_API_KEY and client:
        try:
            prompt = f'Generate 6 fashion product suggestions for: "{req.query}" {req.gender or ""}. Return JSON array with fields: name, brand, price (e.g. "$99"), category (top/bottom/shoes/outerwear/one-piece/accessory), description.'
            response = client.models.generate_content(
                model="gemini-1.5-flash",
                contents=prompt,
                config={"response_mime_type": "application/json"}
            )
            items = json.loads(response.text)
            products = [{"id": f"gen-{i}", "source": "generated", "imageUrl": "", **item} for i, item in enumerate(items)]
        except Exception as e:
            print(f"Gemini fallback error: {e}")

    # 3. Always fall back to mock catalog
    if not products:
        products = search_mock_catalog(req.query, req.gender)

    return {"products": products}


@app.post("/analyze-closet-item")
async def analyze_closet_item(req: AnalyzeItemRequest):
    """Analyze a clothing item from image."""
    image_data = resolve_image(req.imageUrl, req.base64Image)
    if not image_data:
        raise HTTPException(status_code=400, detail="No image provided")

    if not client:
        return {"item": {"category": "top", "name": "Clothing Item", "brand": "Unknown", "color": "Unknown", "price": "Owned", "source": "closet", "description": "Add GEMINI_API_KEY for auto-analysis."}}

    try:
        raw_b64, mime = extract_base64(image_data)
        prompt = 'Analyze this clothing item. Return valid JSON only: {"category": "top|bottom|shoes|outerwear|one-piece|accessory", "name": "item name", "brand": "brand or Unknown", "color": "color"}'
        response = client.models.generate_content(
            model="gemini-1.5-flash",
            contents=[prompt, genai_types.Part.from_bytes(data=base64.b64decode(raw_b64), mime_type=mime)]
        )
        item = json.loads(response.text)
        item["description"] = f"A {item.get('color', '')} {item.get('name', '')} by {item.get('brand', '')}"
        item["price"] = "Owned"
        item["source"] = "closet"
        return {"item": item}
    except Exception as e:
        print(f"Analyze closet item error: {e}")
        return {"item": {"category": "top", "name": "Item", "brand": "Unknown", "color": "Unknown", "price": "Owned", "source": "closet"}}


@app.post("/analyze-inspiration")
async def analyze_inspiration(req: AnalyzeItemRequest):
    """Analyze inspiration image and suggest outfit tiers."""
    image_data = resolve_image(req.imageUrl, req.base64Image)
    if not image_data:
        raise HTTPException(status_code=400, detail="No image provided")

    if not client:
        return {"analysis": None}

    try:
        raw_b64, mime = extract_base64(image_data)
        prompt = 'Analyze this outfit photo. Suggest 3 price tiers. Return JSON: {"totalCost": {"luxury": "$X", "mid": "$X", "budget": "$X"}, "items": [{"category": "top", "luxury": {"name": "...", "brand": "...", "price": "..."}, "mid": {"name": "...", "brand": "...", "price": "..."}, "budget": {"name": "...", "brand": "...", "price": "..."}}]}'
        response = client.models.generate_content(
            model="gemini-1.5-pro",
            contents=[prompt, genai_types.Part.from_bytes(data=base64.b64decode(raw_b64), mime_type=mime)]
        )
        analysis = json.loads(response.text)
        return {"analysis": analysis}
    except Exception as e:
        print(f"Analyze inspiration error: {e}")
        return {"analysis": None}


@app.post("/steal-the-look")
async def steal_the_look(req: GenerateStealLookRequest):
    """Generate steal-the-look style transfer."""
    user_data = resolve_image(req.userPhotoUrl, req.userPhoto)
    inspo_data = resolve_image(req.inspirationPhotoUrl, req.inspirationPhoto)

    if not user_data or not inspo_data:
        raise HTTPException(status_code=400, detail="Both user photo and inspiration photo required")

    if not client:
        return {"generatedImage": user_data}

    try:
        user_b64, user_mime = extract_base64(user_data)
        inspo_b64, inspo_mime = extract_base64(inspo_data)
        mode_instructions = {
            "full": "Transfer the complete outfit from the inspiration photo to the person.",
            "top": "Transfer only the upper body clothing from the inspiration photo.",
            "bottom": "Transfer only the lower body clothing from the inspiration photo."
        }
        prompt = f"Virtual fashion styling: {mode_instructions.get(req.mode, mode_instructions['full'])} Preserve face identity. Safety: No nudity."
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=[
                prompt,
                genai_types.Part.from_bytes(data=base64.b64decode(user_b64), mime_type=user_mime),
                "Style inspiration:",
                genai_types.Part.from_bytes(data=base64.b64decode(inspo_b64), mime_type=inspo_mime)
            ]
        )
        for part in response.candidates[0].content.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                encoded = base64.b64encode(part.inline_data.data).decode()
                return {"generatedImage": f"data:{part.inline_data.mime_type};base64,{encoded}"}
    except Exception as e:
        print(f"Steal the look error: {e}")

    return {"generatedImage": user_data}




class DetectSizeRequest(BaseModel):
    imageUrl: Optional[str] = None
    base64Image: Optional[str] = None

@app.post("/detect-size")
async def detect_size(req: DetectSizeRequest):
    """Estimate clothing size from a user photo."""
    if not client:
        return {
            "size": "M",
            "measurements": {"chest": "38-40\"", "waist": "30-32\"", "hips": "38-40\""},
            "confidence": "low",
            "note": "Add GEMINI_API_KEY for accurate size detection."
        }

    image_data = resolve_image(req.imageUrl, req.base64Image)
    if not image_data:
        return {"size": "M", "confidence": "low", "note": "No image provided"}

    try:
        raw_b64, mime = extract_base64(image_data)
        prompt = '''Analyze this person's photo and estimate their clothing size.
Look at body proportions, frame width, and build.
Return ONLY valid JSON (no markdown):
{
  "size": "XS|S|M|L|XL|XXL",
  "measurements": {
    "chest": "estimate in inches e.g. 38-40\\"",
    "waist": "estimate e.g. 30-32\\"",
    "hips": "estimate e.g. 36-38\\""
  },
  "build": "slim|athletic|average|broad",
  "confidence": "medium"
}'''
        response = client.models.generate_content(
            model="gemini-1.5-flash",
            contents=[prompt, genai_types.Part.from_bytes(data=base64.b64decode(raw_b64), mime_type=mime)]
        )
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text)
        return result
    except Exception as e:
        print(f"Detect size error: {e}")
        return {"size": "M", "measurements": {"chest": "38-40\"", "waist": "30-32\"", "hips": "38-40\""}, "confidence": "low"}


@app.get("/health")
async def health():
    return {"status": "ok", "gemini_configured": bool(GEMINI_API_KEY)}



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
