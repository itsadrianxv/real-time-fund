import { NextResponse } from 'next/server';
import { deleteStrategyProfile, updateStrategyProfile } from '../../../../lib/alert/db.mjs';

const badRequest = (message) => NextResponse.json({ ok: false, error: message }, { status: 400 });
const notFound = () => NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });

export async function PUT(request, { params }) {
  try {
    const id = Number(params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return badRequest('invalid strategy profile id');
    }

    const body = await request.json();
    const hasAnyField = ['name', 'params_json', 'enabled'].some((key) => Object.prototype.hasOwnProperty.call(body || {}, key));

    if (!hasAnyField) {
      return badRequest('no updatable fields');
    }

    const row = await updateStrategyProfile(id, body);
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
    const id = Number(params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return badRequest('invalid strategy profile id');
    }

    const row = await deleteStrategyProfile(id);
    if (!row) {
      return notFound();
    }

    return NextResponse.json({ ok: true, data: row });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
