/**
 * Multi-tenant Customers Handler
 * Isolates customer data by shop_id from JWT token
 */
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

const getPathParts = (path?: string): string[] =>
  (path ?? '').split('/').filter(Boolean);

export const handler = async (event: any): Promise<any> => {
  try {
    const shopId = getShopId(event);
    if (!shopId) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Shop ID not found in token' }) };
    }

    const method = event.httpMethod;
    const pathParts = getPathParts(event.path);
    const customerId = pathParts[1] ?? null;

    if (method === 'GET') {
      if (customerId) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: Number(customerId) || customerId,
            shop_id: shopId,
            name: 'Sample customer',
            email: 'customer@example.com',
          }),
        };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([]),
      };
    }

    if (method === 'POST') {
      const body = parseBody(event) ?? {};
      const { name, email, phone, address } = body;

      if (!name || !email) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing required fields: name and email' }),
        };
      }

      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 1,
          shop_id: shopId,
          name,
          email,
          phone,
          address,
          created_at: new Date().toISOString(),
        }),
      };
    }

    if (method === 'PUT') {
      if (!customerId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Customer ID is required' }) };
      }

      const body = parseBody(event) ?? {};
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: Number(customerId) || customerId,
          shop_id: shopId,
          ...body,
          updated_at: new Date().toISOString(),
        }),
      };
    }

    if (method === 'DELETE') {
      if (!customerId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Customer ID is required' }) };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: Number(customerId) || customerId,
          shop_id: shopId,
          deleted: true,
          deleted_at: new Date().toISOString(),
        }),
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
