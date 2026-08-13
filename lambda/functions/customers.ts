/**
 * Multi-tenant Customers Handler
 * Stores customer records in Aurora PostgreSQL for the current shop.
 */
import {
  createCustomer,
  deleteCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
} from './db';

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

    if (method === 'GET' && !customerId) {
      const customers = await listCustomers(shopId);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customers),
      };
    }

    if (method === 'GET' && customerId) {
      const customer = await getCustomerById(shopId, customerId);
      if (!customer) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Customer not found' }) };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customer),
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

      const customer = await createCustomer(shopId, { name, email, phone, address });
      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customer),
      };
    }

    if (method === 'PUT') {
      if (!customerId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Customer ID is required' }) };
      }

      const body = parseBody(event) ?? {};
      const customer = await updateCustomer(shopId, customerId, body);
      if (!customer) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Customer not found' }) };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customer),
      };
    }

    if (method === 'DELETE') {
      if (!customerId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Customer ID is required' }) };
      }

      const customer = await deleteCustomer(shopId, customerId);
      if (!customer) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Customer not found' }) };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...customer,
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
