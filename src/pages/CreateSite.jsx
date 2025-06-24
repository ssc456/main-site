import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

export default function CreateSite() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [buildStatus, setBuildStatus] = useState(null);
  const [error, setError] = useState(null);
  
  // Form data
  const [formData, setFormData] = useState({
    businessName: '',
    businessType: '',
    businessDescription: '',
    siteId: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  
  // Generated site info after creation
  const [createdSite, setCreatedSite] = useState(null);

  // Handle form changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // If changing business name, suggest a site ID if not already manually set
    if (name === 'businessName' && !formData.siteId) {
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
  
  // Validate current step
  const validateCurrentStep = () => {
    setError(null);
    
    if (step === 1) {
      if (!formData.businessName.trim()) {
        setError("Business name is required");
        return false;
      }
      if (!formData.businessType.trim()) {
        setError("Business type is required");
        return false;
      }
      if (!formData.businessDescription.trim() || formData.businessDescription.length < 20) {
        setError("Please provide a detailed business description (at least 20 characters)");
        return false;
      }
    } 
    else if (step === 2) {
      if (!formData.siteId.trim()) {
        setError("Site ID is required");
        return false;
      }
      if (!/^[a-z0-9-]+$/.test(formData.siteId)) {
        setError("Site ID must contain only lowercase letters, numbers, and hyphens");
        return false;
      }
    }
    else if (step === 3) {
      if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        setError("Valid email is required");
        return false;
      }
      if (!formData.password.trim() || formData.password.length < 6) {
        setError("Password must be at least 6 characters");
        return false;
      }
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords don't match");
        return false;
      }
    }
    
    return true;
  };
  
  // Handle next step
  const nextStep = () => {
    if (validateCurrentStep()) {
      setStep(step + 1);
    }
  };
  
  // Handle previous step
  const prevStep = () => {
    setStep(step - 1);
  };
  
  // Handle submit
  const handleSubmit = async () => {
    // First, actively blur any focused element to dismiss mobile keyboard
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    
    // Add a small delay to ensure all state updates have completed
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (!validateCurrentStep()) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/create-site', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer public-website'
        },
        body: JSON.stringify({
          businessName: formData.businessName,
          businessType: formData.businessType,
          businessDescription: formData.businessDescription,
          siteId: formData.siteId,
          email: formData.email,
          password: formData.password
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'An error occurred');
      }
      
      const data = await response.json();
      setCreatedSite(data);
      setStep(4); // Move to success step
      
      // Begin polling for build status
      pollBuildStatus(data.siteId);
      
    } catch (err) {
      console.error('Form submission error:', err);
      setError(err.message || 'Failed to create site');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Poll build status
  const pollBuildStatus = async (siteId) => {
    setBuildStatus('building');
    
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/site-status?siteId=${siteId}`);
        if (!response.ok) throw new Error('Failed to check status');
        
        const data = await response.json();
        
        if (data.status === 'ready') {
          setBuildStatus('ready');
          return true;
        }
        
        return false;
      } catch (err) {
        console.error('Error checking site status:', err);
        return false;
      }
    };
    
    // Check immediately first
    const isReady = await checkStatus();
    if (!isReady) {
      // If not ready, set up interval to check every 10 seconds
      const interval = setInterval(async () => {
        const ready = await checkStatus();
        if (ready) {
          clearInterval(interval);
        }
      }, 10000);
      
      // Clean up interval after 5 minutes as failsafe
      setTimeout(() => {
        clearInterval(interval);
        if (buildStatus === 'building') {
          setBuildStatus('unknown');
        }
      }, 5 * 60 * 1000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Create Your Business Website</h1>
          <p className="text-lg text-gray-600">Get your professional website up and running in minutes</p>
        </div>
        
        {/* Progress Bar */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-2">
            {['Business Info', 'Site Details', 'Account Setup', 'Complete'].map((label, i) => (
              <div 
                key={i}
                className={`text-sm font-medium ${step > i + 1 ? 'text-blue-600' : i + 1 === step ? 'text-blue-800' : 'text-gray-400'}`}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="h-2 bg-gray-200 rounded-full">
            <div 
              className="h-full bg-blue-600 rounded-full transition-all duration-500" 
              style={{ width: `${(step / 4) * 100}%` }}
            ></div>
          </div>
        </div>
        
        {/* Form Content */}
        <div className="bg-white rounded-lg shadow-xl p-8 mb-10">
          <AnimatePresence mode="wait">
            {/* Step 1: Business Information */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                className="space-y-6"
              >
                <h2 className="text-2xl font-bold text-gray-800">Tell us about your business</h2>
                <p className="text-gray-600">We'll use this information to customize your website content.</p>
                
                <div>
                  <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1">
                    Business Name *
                  </label>
                  <input
                    type="text"
                    id="businessName"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="e.g. Coastal Breeze Spa"
                  />
                </div>
                
                <div>
                  <label htmlFor="businessType" className="block text-sm font-medium text-gray-700 mb-1">
                    Business Type/Industry *
                  </label>
                  <input
                    type="text"
                    id="businessType"
                    name="businessType"
                    value={formData.businessType}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="e.g. Spa, Restaurant, Law Firm, etc."
                  />
                </div>
                
                <div>
                  <label htmlFor="businessDescription" className="block text-sm font-medium text-gray-700 mb-1">
                    Business Description *
                  </label>
                  <textarea
                    id="businessDescription"
                    name="businessDescription"
                    value={formData.businessDescription}
                    onChange={handleChange}
                    rows={5}
                    className="w-full border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Describe your services, target customers, unique selling points, etc. The more detail you provide, the better your website will be!"
                  />
                </div>
              </motion.div>
            )}
            
            {/* Step 2: Site Details */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                className="space-y-6"
              >
                <h2 className="text-2xl font-bold text-gray-800">Set up your website address</h2>
                <p className="text-gray-600">Choose a unique site ID for your website URL.</p>
                
                <div>
                  <label htmlFor="siteId" className="block text-sm font-medium text-gray-700 mb-1">
                    Site ID *
                  </label>
                  <div className="mt-1 flex rounded-md shadow-sm">
                    <input
                      type="text"
                      id="siteId"
                      name="siteId"
                      value={formData.siteId}
                      onChange={handleChange}
                      className="flex-grow min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md border border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                      .vercel.app
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Only use lowercase letters, numbers, and hyphens
                  </p>
                </div>
              </motion.div>
            )}
            
            {/* Step 3: Account Setup */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                className="space-y-6"
              >
                <h2 className="text-2xl font-bold text-gray-800">Set up your admin account</h2>
                <p className="text-gray-600">Create credentials to manage your website after it's built.</p>
                
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="At least 6 characters"
                  />
                </div>
                
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </motion.div>
            )}
            
            {/* Step 4: Success */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Your website is being built!</h2>
                
                {buildStatus === 'building' && (
                  <div className="mb-8">
                    <div className="flex items-center justify-center space-x-3 mb-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-4 border-blue-500 border-t-transparent"></div>
                      <p className="text-lg text-gray-600">Building your website...</p>
                    </div>
                    <p className="text-gray-500">This typically takes 2-3 minutes.</p>
                  </div>
                )}
                
                {buildStatus === 'ready' && (
                  <div className="mb-8">
                    <p className="text-lg text-gray-600 mb-4">Your website is now ready!</p>
                    <div className="flex flex-col space-y-4 items-center">
                      <a 
                        href={`https://${createdSite.siteId}.vercel.app`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Visit Your Website
                      </a>
                      <a 
                        href={`https://${createdSite.siteId}.vercel.app/admin`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-3 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                      >
                        Go to Admin Panel
                      </a>
                    </div>
                  </div>
                )}
                
                {buildStatus === 'unknown' && (
                  <div className="mb-8">
                    <p className="text-lg text-gray-600 mb-4">
                      Your website is taking longer than expected to build, but it should be ready soon.
                    </p>
                    <div className="flex flex-col space-y-4 items-center">
                      <a 
                        href={`https://${createdSite.siteId}.vercel.app`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Check Your Website
                      </a>
                    </div>
                  </div>
                )}
                
                <div className="mt-6 border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Your website details</h3>
                  <div className="bg-gray-50 rounded-md p-4 text-left">
                    <p><span className="font-medium">Website URL:</span> https://{createdSite?.siteId}.vercel.app</p>
                    <p><span className="font-medium">Admin URL:</span> https://{createdSite?.siteId}.vercel.app/admin</p>
                    <p><span className="font-medium">Email:</span> {formData.email}</p>
                    <p className="text-sm text-gray-500 mt-2">Bookmark these links for easy access!</p>
                  </div>
                </div>
              </motion.div>
            )}
            
            {/* Error Display */}
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
                {error}
              </div>
            )}
            
            {/* Navigation Buttons */}
            {step < 4 && (
              <div className="flex justify-between mt-8">
                {step > 1 ? (
                  <button
                    onClick={prevStep}
                    className="px-5 py-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50"
                  >
                    Back
                  </button>
                ) : (
                  <div></div> /* Empty div for flex spacing */
                )}
                
                {step < 3 ? (
                  <button
                    onClick={nextStep}
                    className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-70 flex items-center"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                        Creating...
                      </>
                    ) : (
                      'Create Website'
                    )}
                  </button>
                )}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}