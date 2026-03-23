import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:8000';

export async function POST(request) {
    try {
        const body = await request.json();
        const { imageUrl, base64Image } = body;

        const res = await fetch(`${PYTHON_API}/detect-size`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl, base64Image }),
        });

        if (!res.ok) {
            return NextResponse.json({ size: 'M', confidence: 'low' });
        }

        const data = await res.json();
        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error('[detect-size] API error:', error);
        return NextResponse.json({ size: 'M', confidence: 'low' });
    }
}
