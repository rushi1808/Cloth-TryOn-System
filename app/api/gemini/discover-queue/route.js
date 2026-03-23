import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:8000';

export async function POST(request) {
    try {
        const body = await request.json();
        const { gender } = body;

        const res = await fetch(`${PYTHON_API}/search-products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                query: 'trending fashion outfit', 
                gender 
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Python service error (discover-queue):', err);
            return NextResponse.json({ error: 'Python service error' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error('[discover-queue] API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
