import { NextResponse } from 'next/server';
import { createFundBinding, listFundBindings } from '../../../lib/alert/db.mjs';

const badRequest = (message) => NextResponse.json({ ok: false, error: message }, { status: 400 });

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const enabledValue = url.searchParams.get('enabled');
    const enabled = enabledValue === null ? undefined : enabledValue === 'true';

    const rows = await listFundBindings({ enabled });
    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const requiredFields = ['target_fund_code', 'target_fund_name', 'benchmark_fund_code', 'benchmark_fund_name'];
    for (const field of requiredFields) {
      if (!String(body?.[field] || '').trim()) {
        return badRequest(`${field} is required`);
      }
    }

    const row = await createFundBinding(body);
    return NextResponse.json({ ok: true, data: row }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
