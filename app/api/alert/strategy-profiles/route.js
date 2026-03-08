import { NextResponse } from 'next/server';
import { createStrategyProfile, listStrategyProfiles } from '../../../lib/alert/db.mjs';

const badRequest = (message) => NextResponse.json({ ok: false, error: message }, { status: 400 });

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const enabledValue = url.searchParams.get('enabled');
    const enabled = enabledValue === null ? undefined : enabledValue === 'true';

    const rows = await listStrategyProfiles({ enabled });
    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body?.name || '').trim();

    if (!name) {
      return badRequest('name is required');
    }

    const row = await createStrategyProfile({
      name,
      params_json: body?.params_json,
      enabled: body?.enabled
    });

    return NextResponse.json({ ok: true, data: row }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
