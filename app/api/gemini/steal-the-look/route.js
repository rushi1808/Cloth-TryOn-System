import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:8000';

export async function POST(request) {
    try {
        const body = await request.json();
        const { userPhotoUrl, inspirationPhotoUrl, userPhoto, inspirationPhoto, mode } = body;

        if (!userPhotoUrl && !userPhoto) {
            return NextResponse.json({ error: 'userPhotoUrl or userPhoto is required' }, { status: 400 });
        }
        if (!inspirationPhotoUrl && !inspirationPhoto) {
            return NextResponse.json({ error: 'inspirationPhotoUrl or inspirationPhoto is required' }, { status: 400 });
        }

        const res = await fetch(`${PYTHON_API}/steal-the-look`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userPhotoUrl, inspirationPhotoUrl, userPhoto, inspirationPhoto, mode }),
        });

        if (!res.ok) {
            const err = await res.text();
            console.error('Python service error (steal-the-look):', err);
            return NextResponse.json({ error: 'Python service error' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error('[steal-the-look] API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
