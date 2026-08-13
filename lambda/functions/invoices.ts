/**
 * Multi-tenant Invoices Handler
 * Stores invoice records in Aurora PostgreSQL for the current shop.
 */
import { createInvoice, listInvoices } from './db';

const getShopId = (event: any): string | undefined => {
  const claims = event?.requestContext?.authorizer?.claims ?? {};
  return claims['custom:shop_id'] ?? claims.shop_id ?? claims['custom:shopId'] ?? claims.shopId;
};

const parseBody = (event: any): Record<string, any> | null => {
  if (!event?.body) {
    return null;
  }

  try {
    return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch (error) {
    throw new Error('Invalid JSON body');
  }
};

export const handler = async (event: any): Promise<any> => {
  try {
    const shopId = getShopId(event);
    if (!shopId) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Shop ID not found' }) };
    }

    const method = event.httpMethod;

    if (method === 'GET') {
      const invoices = await listInvoices(shopId);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoices),
      };
    }

    if (method === 'POST') {
      const body = parseBody(event) ?? {};
      const { customer_id, booking_id, total_amount, items, payment_method } = body;

      if (!customer_id || !total_amount) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing required invoice fields' }),
        };
      }

      const invoice = await createInvoice(shopId, { customer_id, booking_id, total_amount, items, payment_method });
      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoice),
      };
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', message: String(error) }),
    };
  }
};
