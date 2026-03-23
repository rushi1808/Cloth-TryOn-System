import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:8000';

// Start a video generation job (returns immediately with operation ID)
export async function POST(request) {
    try {
        const { imageUrl, base64Image } = await request.json();

        const res = await fetch(`${PYTHON_API}/start-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl, base64Image }),
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Python service error (start-video):', err);
            return NextResponse.json({ error: 'Python service error' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error('[start-video] API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
