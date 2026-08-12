/**
 * AWS API Client for MechPro
 * Replaces Hercules SDK with native AWS API calls via API Gateway
 */

interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
}

class AWSAPIClient {
  private apiGatewayUrl: string;
  private authTokens: AuthTokens | null = null;

  constructor(apiGatewayUrl: string) {
    this.apiGatewayUrl = apiGatewayUrl;
    // Load tokens from localStorage
    const stored = localStorage.getItem('mechpro_auth_tokens');
    if (stored) {
      this.authTokens = JSON.parse(stored);
    }
  }

  setAuthTokens(tokens: AuthTokens) {
    this.authTokens = tokens;
    localStorage.setItem('mechpro_auth_tokens', JSON.stringify(tokens));
  }

  clearAuthTokens() {
    this.authTokens = null;
    localStorage.removeItem('mechpro_auth_tokens');
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authTokens) {
      headers['Authorization'] = `Bearer ${this.authTokens.accessToken}`;
    }

    return headers;
  }

  private async request(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<any> {
    const url = `${this.apiGatewayUrl}${endpoint}`;
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: { ...this.getHeaders(), ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `API Error: ${response.status}`);
    }

    return response.json();
  }

  // ============ CUSTOMERS ============
  async getCustomers() {
    return this.request('/customers');
  }

  async getCustomer(id: string) {
    return this.request(`/customers/${id}`);
  }

  async createCustomer(data: {
    name: string;
    email: string;
    phone: string;
    address: string;
  }) {
    return this.request('/customers', {
      method: 'POST',
      body: data,
    });
  }

  async updateCustomer(
    id: string,
    data: Partial<{
      name: string;
      email: string;
      phone: string;
      address: string;
    }>
  ) {
    return this.request(`/customers/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteCustomer(id: string) {
    return this.request(`/customers/${id}`, {
      method: 'DELETE',
    });
  }

  // ============ BOOKINGS ============
  async getBookings() {
    return this.request('/bookings');
  }

  async createBooking(data: {
    customer_id: number;
    employee_id: number;
    booking_date: string;
    service_type: string;
    notes: string;
  }) {
    return this.request('/bookings', {
      method: 'POST',
      body: data,
    });
  }

  // ============ INVOICES ============
  async getInvoices() {
    return this.request('/invoices');
  }

  async createInvoice(data: {
    customer_id: number;
    booking_id: number;
    total_amount: number;
    items: Array<{ description: string; quantity: number; unit_price: number }>;
    payment_method: string;
  }) {
    return this.request('/invoices', {
      method: 'POST',
      body: data,
    });
  }

  // ============ INSPECTIONS ============
  async getInspections() {
    return this.request('/inspections');
  }

  async createInspection(data: {
    customer_id: number;
    vehicle_vin: string;
    findings: string;
  }) {
    return this.request('/inspections', {
      method: 'POST',
      body: data,
    });
  }

  // ============ EMPLOYEES ============
  async getEmployees() {
    return this.request('/employees');
  }

  async createEmployee(data: {
    name: string;
    email: string;
    phone: string;
    role: string;
    salary: number;
  }) {
    return this.request('/employees', {
      method: 'POST',
      body: data,
    });
  }

  // ============ AUTH ============
  async register(data: {
    email: string;
    password: string;
    shopName: string;
  }) {
    return this.request('/auth/register', {
      method: 'POST',
      body: data,
    });
  }

  async login(email: string, password: string) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    this.setAuthTokens(response);
    return response;
  }

  async logout() {
    this.clearAuthTokens();
  }
}

// Export singleton instance
export const apiClient = new AWSAPIClient(
  process.env.REACT_APP_API_GATEWAY_URL || 'https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/production'
);

export default AWSAPIClient;
