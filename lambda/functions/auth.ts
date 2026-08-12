/**
 * Auth Handler - User registration and login
 * Placeholder for actual Lambda deployment
 */
const getPathParts = (path?: string): string[] =>
  (path ?? '').split('/').filter(Boolean);

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
    const method = event.httpMethod;
    const pathParts = getPathParts(event.path);
    const action = pathParts[pathParts.length - 1] ?? '';

    if (method === 'POST' && action === 'register') {
      const body = parseBody(event) ?? {};
      const { email, password, shopName } = body;

      if (!email || !password || !shopName) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing required registration fields' }),
        };
      }

      const shopId = `shop_${Date.now()}`;
      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Registration successful',
          shopId,
          email,
          shopName,
        }),
      };
    }

    if (method === 'POST' && action === 'login') {
      const body = parseBody(event) ?? {};
      const { email, password } = body;

      if (!email || !password) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Missing required login fields' }),
        };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Login successful',
          accessToken: 'placeholder_token',
          idToken: 'placeholder_id_token',
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
