import { NextResponse } from 'next/server';
import { deleteFundBinding, updateFundBinding } from '../../../../lib/alert/db.mjs';

const badRequest = (message) => NextResponse.json({ ok: false, error: message }, { status: 400 });
const notFound = () => NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

export async function PUT(request, { params }) {
  try {
    const code = String(params?.code || '').trim();
    if (!code) {
      return badRequest('invalid target fund code');
    }

    const body = await request.json();
    const hasAnyField = [
      'target_fund_name',
      'benchmark_fund_code',
      'benchmark_fund_name',
      'enabled',
      'strategy_profile_id',
      'params_override_json'
    ].some((key) => Object.prototype.hasOwnProperty.call(body || {}, key));

    if (!hasAnyField) {
      return badRequest('no updatable fields');
    }

    const row = await updateFundBinding(code, body);
    if (!row) {
      return notFound();
    }

    return NextResponse.json({ ok: true, data: row });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const code = String(params?.code || '').trim();
    if (!code) {
      return badRequest('invalid target fund code');
    }

    const row = await deleteFundBinding(code);
    if (!row) {
      return notFound();
    }

    return NextResponse.json({ ok: true, data: row });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
