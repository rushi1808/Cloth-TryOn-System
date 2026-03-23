import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:8000';

export async function POST(request) {
    try {
        const body = await request.json();
        const { imageUrl, imageBase64 } = body;

        if (!imageUrl && !imageBase64) {
            return NextResponse.json({ error: 'imageUrl or imageBase64 is required' }, { status: 400 });
        }

        const res = await fetch(`${PYTHON_API}/generate-360-view`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl, imageBase64 }),
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Python service error (generate-360-view):', err);
            return NextResponse.json({ error: 'Python service error' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error('[generate-360-view] API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
