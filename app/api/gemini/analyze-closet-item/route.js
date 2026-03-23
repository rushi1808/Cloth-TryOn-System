import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:8000';

export async function POST(request) {
    try {
        const body = await request.json();
        const { imageUrl, base64Image } = body;

        const res = await fetch(`${PYTHON_API}/analyze-closet-item`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl, base64Image }),
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Python service error (analyze-closet-item):', err);
            return NextResponse.json({ error: 'Python service error' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error('[analyze-closet-item] API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
