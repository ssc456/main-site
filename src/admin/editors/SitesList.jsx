import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

export default function SitesList() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSite, setExpandedSite] = useState(null);
  const [siteToDelete, setSiteToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  // New state for create site functionality
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    siteId: '',
    businessName: '',
    businessType: '',
    email: '',
    password: '',
  });
  
  useEffect(() => {
    fetchSites();
  }, []);
  
  const fetchSites = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        setError('Not authenticated');
        return;
      }
      
      const response = await fetch('/api/sites', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch sites: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Fetched sites data:', data);
      setSites(data.sites || []);
    } catch (err) {
      console.error('Error fetching sites:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('URL copied to clipboard');
  };
  
  const toggleSiteExpanded = (siteId) => {
    setExpandedSite(expandedSite === siteId ? null : siteId);
  };
  
  const openDeleteConfirmation = (site) => {
    setSiteToDelete(site);
    setShowConfirmDialog(true);
  };
  
  const closeDeleteConfirmation = () => {
    setShowConfirmDialog(false);
    setSiteToDelete(null);
  };
  
  const deleteSite = async () => {
    if (!siteToDelete) return;
    
    setIsDeleting(true);
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/delete-site?siteId=${siteToDelete.siteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete site');
      }
      
      toast.success(`Site "${siteToDelete.businessName || siteToDelete.siteId}" deleted successfully`);
      
      // Update the sites list by removing the deleted site
      setSites(sites.filter(site => site.siteId !== siteToDelete.siteId));
    } catch (err) {
      console.error('Error deleting site:', err);
      toast.error(`Failed to delete site: ${err.message}`);
    } finally {
      setIsDeleting(false);
      closeDeleteConfirmation();
    }
  };
  
  // New functions for site creation
  const openCreateForm = () => {
    setShowCreateForm(true);
  };
  
  const closeCreateForm = () => {
    setShowCreateForm(false);
    setFormData({
      siteId: '',
      businessName: '',
      businessType: '',
      email: '',
      password: '',
    });
  };
  
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    
    // If changing siteId, convert to lowercase, remove spaces, and replace special chars with hyphens
    if (name === 'siteId') {
      const formattedValue = value
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      
      setFormData({ ...formData, [name]: formattedValue });
    } else if (name === 'businessName' && !formData.siteId) {
      // Auto-generate siteId from businessName if siteId is empty
      const suggestedSiteId = value
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      
      setFormData({ 
        ...formData, 
        [name]: value,
        siteId: suggestedSiteId 
      });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };
  
  const createSite = async (e) => {
    e.preventDefault();
    
    // Form validation
    if (!formData.siteId || !formData.businessName || !formData.password) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    setIsCreating(true);
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/create-site', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create site');
      }
      
      if (data.vercelError) {
        // Site created in Redis but Vercel deployment failed
        toast.warning('Site created but deployment failed. Manual deployment required.');
      } else {
        toast.success(`Site "${formData.businessName}" created successfully!`);
      }
      
      // Add the new site to the list
      const newSite = {
        siteId: formData.siteId,
        businessName: formData.businessName,
        businessType: formData.businessType,
        email: formData.email,
        createdAt: new Date().toISOString()
      };
      
      setSites([...sites, newSite]);
      closeCreateForm();
      
      // Refresh the full list to get complete data
      setTimeout(fetchSites, 1000);
    } catch (err) {
      console.error('Error creating site:', err);
      toast.error(`Failed to create site: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };
  
  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-sm">
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <span className="ml-3 text-gray-600">Loading sites...</span>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-6 bg-white rounded-lg shadow-sm">
        <div className="text-red-500 font-medium mb-3">Error loading sites</div>
        <p className="text-gray-700">{error}</p>
        <button 
          onClick={fetchSites}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Create Button */}
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold">All Business Websites</h2>
            <p className="text-gray-600">
              Manage all the business websites in your platform.
            </p>
          </div>
          <button
            onClick={openCreateForm}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Create New Site
          </button>
        </div>
        
        {sites.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">No sites have been created yet.</p>
            <p className="text-gray-600 mb-6">Click "Create New Site" to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Site Details
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    URL
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sites.map((site) => (
                  <tr key={site.siteId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div>
                          <div className="font-medium text-gray-900">{site.businessName}</div>
                          <div className="text-gray-500 text-sm">ID: {site.siteId}</div>
                          {site.businessType && (
                            <div className="text-gray-500 text-sm">Type: {site.businessType}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {site.createdAt ? new Date(site.createdAt).toLocaleString() : 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <a 
                        href={`https://${site.siteId}.vercel.app`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {site.siteId}.vercel.app
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                      <div className="flex justify-center space-x-3">
                        <button
                          onClick={() => copyToClipboard(`https://${site.siteId}.vercel.app`)}
                          className="text-gray-500 hover:text-gray-700"
                          title="Copy URL"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
                            <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM15 11h2a1 1 0 110 2h-2v-2z" />
                          </svg>
                        </button>                      
                        {/* Delete Button */}
                        <button
                          onClick={() => openDeleteConfirmation(site)}
                          className="text-red-500 hover:text-red-700"
                          title="Delete Site"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Dialog - Your existing code */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirm Deletion</h3>
            <p className="mb-6 text-gray-600">
              Are you sure you want to delete the site <span className="font-semibold">{siteToDelete?.businessName || siteToDelete?.siteId}</span>? 
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={closeDeleteConfirmation}
                disabled={isDeleting}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteSite}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center"
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Deleting...
                  </>
                ) : (
                  'Delete Site'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Create Site Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Create New Site</h3>
            
            <form onSubmit={createSite}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1">
                    Business Name *
                  </label>
                  <input
                    type="text"
                    id="businessName"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleFormChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="siteId" className="block text-sm font-medium text-gray-700 mb-1">
                    Site ID * <span className="text-xs text-gray-500">(URL will be https://[site-id].vercel.app)</span>
                  </label>
                  <input
                    type="text"
                    id="siteId"
                    name="siteId"
                    value={formData.siteId}
                    onChange={handleFormChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="lowercase-with-hyphens"
                    pattern="[a-z0-9-]+"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Lowercase letters, numbers, and hyphens only
                  </p>
                </div>
                
                <div>
                  <label htmlFor="businessType" className="block text-sm font-medium text-gray-700 mb-1">
                    Business Type
                  </label>
                  <select
                    id="businessType"
                    name="businessType"
                    value={formData.businessType}
                    onChange={handleFormChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a type</option>
                    <option value="Restaurant">Restaurant</option>
                    <option value="Cafe">Cafe</option>
                    <option value="Retail">Retail</option>
                    <option value="Professional Services">Professional Services</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Fitness">Fitness</option>
                    <option value="Education">Education</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Admin Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleFormChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Admin Password *
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleFormChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    minLength={6}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Minimum 6 characters
                  </p>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={closeCreateForm}
                  disabled={isCreating}
                  className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center"
                >
                  {isCreating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                      Creating...
                    </>
                  ) : (
                    'Create Site'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}