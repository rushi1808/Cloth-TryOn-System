import { NextResponse } from 'next/server';

const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:8000';

// Poll the status of an existing video generation job
export async function POST(request) {
    try {
        const { operationJson } = await request.json();

        const res = await fetch(`${PYTHON_API}/check-video-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationJson }),
        });

        if (!res.ok) {
            return NextResponse.json({ status: 'failed' }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json({ success: true, ...data });
    } catch (error) {
        console.error('[check-video-status] API error:', error);
        return NextResponse.json({ status: 'failed' }, { status: 500 });
    }
}
