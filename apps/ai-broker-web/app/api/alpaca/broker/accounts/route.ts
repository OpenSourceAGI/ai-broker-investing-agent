import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/alpaca/broker/accounts
 * Create a new brokerage account for an end user
 * This uses the Alpaca Broker API to onboard new users
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate required fields
    const requiredFields = [
      'contact.email_address',
      'contact.phone_number',
      'contact.street_address',
      'contact.city',
      'contact.state',
      'contact.postal_code',
      'identity.given_name',
      'identity.family_name',
      'identity.date_of_birth',
      'identity.tax_id',
    ]

    for (const field of requiredFields) {
      const parts = field.split('.')
      let value = body
      for (const part of parts) {
        value = value?.[part]
      }
      if (!value) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        )
      }
    }

    // Use fetch to call Broker API directly since the JS library may not support all Broker endpoints
    const brokerApiKey = process.env.ALPACA_BROKER_API_KEY || process.env.ALPACA_API_KEY
    const brokerSecret = process.env.ALPACA_BROKER_SECRET_KEY || process.env.ALPACA_SECRET
    const brokerBaseUrl = process.env.ALPACA_BROKER_BASE_URL || 'https://broker-api.alpaca.markets'

    if (!brokerApiKey || !brokerSecret) {
      return NextResponse.json(
        { error: 'Broker API credentials not configured' },
        { status: 500 }
      )
    }

    // Create the account via Broker API
    const response = await fetch(`${brokerBaseUrl}/v1/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'APCA-API-KEY-ID': brokerApiKey,
        'APCA-API-SECRET-KEY': brokerSecret,
      },
      body: JSON.stringify({
        contact: {
          email_address: body.contact.email_address,
          phone_number: body.contact.phone_number,
          street_address: Array.isArray(body.contact.street_address)
            ? body.contact.street_address
            : [body.contact.street_address],
          city: body.contact.city,
          state: body.contact.state,
          postal_code: body.contact.postal_code,
          country: body.contact.country || 'USA',
        },
        identity: {
          given_name: body.identity.given_name,
          family_name: body.identity.family_name,
          middle_name: body.identity.middle_name,
          date_of_birth: body.identity.date_of_birth,
          tax_id: body.identity.tax_id,
          tax_id_type: body.identity.tax_id_type || 'USA_SSN',
          country_of_citizenship: body.identity.country_of_citizenship || 'USA',
          country_of_birth: body.identity.country_of_birth || 'USA',
          country_of_tax_residence: body.identity.country_of_tax_residence || 'USA',
          funding_source: body.identity.funding_source || ['employment_income'],
        },
        disclosures: {
          is_control_person: body.disclosures?.is_control_person ?? false,
          is_affiliated_exchange_or_finra: body.disclosures?.is_affiliated_exchange_or_finra ?? false,
          is_politically_exposed: body.disclosures?.is_politically_exposed ?? false,
          immediate_family_exposed: body.disclosures?.immediate_family_exposed ?? false,
        },
        agreements: body.agreements || [
          {
            agreement: 'margin_agreement',
            signed_at: new Date().toISOString(),
            ip_address: body.ip_address || request.headers.get('x-forwarded-for') || '0.0.0.0',
          },
          {
            agreement: 'account_agreement',
            signed_at: new Date().toISOString(),
            ip_address: body.ip_address || request.headers.get('x-forwarded-for') || '0.0.0.0',
          },
          {
            agreement: 'customer_agreement',
            signed_at: new Date().toISOString(),
            ip_address: body.ip_address || request.headers.get('x-forwarded-for') || '0.0.0.0',
          },
        ],
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Broker API error:', error)
      return NextResponse.json(
        { error: 'Failed to create brokerage account', details: error },
        { status: response.status }
      )
    }

    const account = await response.json()

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        status: account.status,
        account_number: account.account_number,
        created_at: account.created_at,
      },
    })
  } catch (error) {
    console.error('Error creating brokerage account:', error)
    return NextResponse.json(
      {
        error: 'Failed to create brokerage account',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/alpaca/broker/accounts
 * List all brokerage accounts (admin endpoint)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id')

    const brokerApiKey = process.env.ALPACA_BROKER_API_KEY || process.env.ALPACA_API_KEY
    const brokerSecret = process.env.ALPACA_BROKER_SECRET_KEY || process.env.ALPACA_SECRET
    const brokerBaseUrl = process.env.ALPACA_BROKER_BASE_URL || 'https://broker-api.alpaca.markets'

    if (!brokerApiKey || !brokerSecret) {
      return NextResponse.json(
        { error: 'Broker API credentials not configured' },
        { status: 500 }
      )
    }

    let url = `${brokerBaseUrl}/v1/accounts`
    if (accountId) {
      url = `${brokerBaseUrl}/v1/accounts/${accountId}`
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': brokerApiKey,
        'APCA-API-SECRET-KEY': brokerSecret,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json(
        { error: 'Failed to fetch accounts', details: error },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Error fetching brokerage accounts:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch brokerage accounts',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
