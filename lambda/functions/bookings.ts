/**
 * Multi-tenant Bookings Handler
 * Stores booking records in Aurora PostgreSQL for the current shop.
 */
import { createBooking, listBookings } from './db';

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
      const bookings = await listBookings(shopId);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookings),
      };
    }

    if (method === 'POST') {
      const body = parseBody(event) ?? {};
      const { customer_id, employee_id, booking_date, service_type, notes } = body;

      if (!customer_id || !booking_date || !service_type) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing required booking fields' }),
        };
      }

      const booking = await createBooking(shopId, { customer_id, employee_id, booking_date, service_type, notes });
      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(booking),
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
