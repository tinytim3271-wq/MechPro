import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/awsClient';
import { useAuth } from '../context/AuthContext';

interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
}

export const CustomersPage: React.FC = () => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '' });

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getCustomers();
      setCustomers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.createCustomer(formData);
      setFormData({ name: '', email: '', phone: '', address: '' });
      setShowForm(false);
      await loadCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer');
    }
  };

  const handleDeleteCustomer = async (id: number) => {
    if (confirm('Are you sure?')) {
      try {
        await apiClient.deleteCustomer(String(id));
        await loadCustomers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete customer');
      }
    }
  };

  if (loading) return <div>Loading customers...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Customers</h1>
      {error && <div style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}

      <button onClick={() => setShowForm(!showForm)} style={{ marginBottom: '20px' }}>
        {showForm ? 'Cancel' : 'Add Customer'}
      </button>

      {showForm && (
        <form onSubmit={handleAddCustomer} style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            type="text"
            placeholder="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
          <input
            type="tel"
            placeholder="Phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
          <textarea
            placeholder="Address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
          <button type="submit">Save Customer</button>
        </form>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: '#f0f0f0' }}>
            <th style={{ padding: '10px', textAlign: 'left' }}>Name</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Email</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Phone</th>
            <th style={{ padding: '10px', textAlign: 'left' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.id} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '10px' }}>{customer.name}</td>
              <td style={{ padding: '10px' }}>{customer.email}</td>
              <td style={{ padding: '10px' }}>{customer.phone}</td>
              <td style={{ padding: '10px' }}>
                <button onClick={() => handleDeleteCustomer(customer.id)} style={{ color: 'red' }}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {customers.length === 0 && !loading && <p>No customers found. Add one to get started!</p>}
    </div>
  );
};

export default CustomersPage;
