/**
 * Multi-tenant Employees Handler
 * Stores employee records in Aurora PostgreSQL for the current shop.
 */
import { createEmployee, listEmployees } from './db';

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
      const employees = await listEmployees(shopId);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(employees),
      };
    }

    if (method === 'POST') {
      const body = parseBody(event) ?? {};
      const { name, email, phone, role, salary } = body;

      if (!name || !email || !role) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing required employee fields' }),
        };
      }

      const employee = await createEmployee(shopId, { name, email, phone, role, salary });
      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(employee),
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
