import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

export default function CreateFromFacescrape() {
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
    confirmPassword: '',
    includeAppointments: false,
  });
  
  // Generated site info after creation
  const [createdSite, setCreatedSite] = useState(null);

  // Add a new state for logo upload
  const [logo, setLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');

  // Add state for progress indicator
  const [progress, setProgress] = useState(0);

  // Add a new state for the countdown
  const [countdown, setCountdown] = useState(0);

  // Check for FACESCRAPE data on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('source');
    
    if (source === 'facescrape') {
      console.log('[CreateFromFacescrape] FACESCRAPE data detected, pre-populating form...');
      
      // Extract data from URL parameters
      const facescrapeData = {
        businessName: urlParams.get('businessName') || '',
        businessDescription: urlParams.get('businessDescription') || '',
        businessType: urlParams.get('businessType') || '',
        email: urlParams.get('email') || '',
        phone: urlParams.get('phone') || '',
        website: urlParams.get('website') || '',
        location: urlParams.get('location') || '',
        logoUrl: urlParams.get('logoUrl') || ''
      };

      // Generate site ID from business name
      const suggestedSiteId = facescrapeData.businessName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .substring(0, 30); // Limit length
        
      // Pre-populate form
      setFormData(prev => ({
        ...prev,
        businessName: facescrapeData.businessName,
        businessDescription: facescrapeData.businessDescription,
        businessType: facescrapeData.businessType || 'Other',
        siteId: suggestedSiteId,
        email: facescrapeData.email
      }));

      // Set logo preview if available
      if (facescrapeData.logoUrl) {
        setLogoPreview(facescrapeData.logoUrl);
      }
    } else {
      // If no FACESCRAPE source, redirect to regular create site page
      navigate('/create-site');
    }
  }, [navigate]);

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
  
  // Add a logo upload handler
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogo(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  // Handle submit - uses the same API as the regular create-site
  const handleSubmit = async () => {
    // First, actively blur any focused element to dismiss mobile keyboard
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    
    // Add a small delay to ensure all state updates have completed
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (!validateCurrentStep()) return;

    // Start the submission process immediately
    setIsSubmitting(true);
    
    // Move to step 4 immediately to show the loading state
    setStep(4);
    setBuildStatus('initializing');
    
    // Start a countdown just for visual feedback
    setCountdown(20);
    const countdownInterval = setInterval(() => {
      setCountdown(prevCount => {
        if (prevCount <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prevCount - 1;
      });
    }, 1000);
    
    // Execute the form submission right away
    try {
      // First, upload the logo if one was selected
      let logoUrl = '';
      
      if (logo) {
        const uploadFormData = new FormData();
        uploadFormData.append('file', logo);
        uploadFormData.append('siteId', formData.siteId);
        uploadFormData.append('type', 'logo'); // Specify this is a logo upload
        
        const logoResponse = await fetch('/api/upload', {
          method: 'POST',
          body: uploadFormData,
        });
        
        if (logoResponse.ok) {
          const logoData = await logoResponse.json();
          logoUrl = logoData.url;
          console.log("Logo uploaded successfully:", logoUrl);
        }
      } else if (logoPreview && logoPreview.startsWith('http')) {
        // Use the existing logo URL from FACESCRAPE
        logoUrl = logoPreview;
      }
      
      // Now proceed with site creation, including the logo URL
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
          password: formData.password,
          includeAppointments: formData.includeAppointments || false,
          logoUrl: logoUrl // Include the logo URL
        })
      });
      
      // Rest of your existing error handling
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'An error occurred');
      }
      
      const data = await response.json();
      console.log("API response:", data);

      if (!data || !data.siteId) {
        console.error("Invalid API response - missing siteId:", data);
        setError("Created site successfully, but couldn't start build monitoring");
        setCreatedSite({ siteId: formData.siteId }); // Fallback to form data
        setBuildStatus('building');
        return;
      }

      setCreatedSite(data);
      console.log("Starting polling with siteId:", data.siteId);
      
      // NOW start the progress animation and video after API completes
      setBuildStatus('building');
      setProgress(0);
      let progressInterval = setInterval(() => {
        setProgress(current => {
          // Cap at 95% - the final 5% happens when build is complete
          return Math.min(current + 1, 95);
        });
      }, 1200); // Takes ~2 minutes to reach 95%
      
      // Start the actual polling
      pollBuildStatusCheck(data.siteId, progressInterval);
      
    } catch (err) {
      console.error('Form submission error:', err);
      setError(err.message || 'Failed to create site');
      setBuildStatus('error');
      // No progressInterval to clear here since it's only created after API success
    } finally {
      // Clear countdown if still running
      clearInterval(countdownInterval);
      setIsSubmitting(false);
    }
  };

  // Separate function for just checking status (used when progress already started)
  const pollBuildStatusCheck = async (siteId, existingProgressInterval) => {
    const checkStatus = async () => {
      try {
        console.log(`Making status check request for: ${siteId}`);
        const response = await fetch(`/api/sites?siteId=${siteId}&action=status`);
        console.log("Status response:", response.status);
        
        if (!response.ok) throw new Error('Failed to check status');
        const data = await response.json();
        console.log("Status data:", data);
        
        if (data.status === 'ready') {
          clearInterval(existingProgressInterval);
          setProgress(100);
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
      // Poll every 10 seconds
      const interval = setInterval(async () => {
        const ready = await checkStatus();
        if (ready) {
          clearInterval(interval);
          clearInterval(existingProgressInterval);
          setProgress(100);
        }
      }, 10000);
      
      // Failsafe - clear interval after 5 minutes
      setTimeout(() => {
        clearInterval(interval);
        clearInterval(existingProgressInterval);
        if (buildStatus === 'building') {
          setBuildStatus('unknown');
          setProgress(99); // Show nearly complete
        }
      }, 5 * 60 * 1000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="bg-green-100 p-2 rounded-full">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-gray-900">Create Website from FACESCRAPE</h1>
          </div>
          <p className="text-lg text-gray-600">Your business data has been imported from Facebook. Review and complete the details below.</p>
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
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2 text-green-800 font-medium mb-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Data Imported from FACESCRAPE
                  </div>
                  <p className="text-green-700 text-sm">
                    We've pre-filled this form with the business information found on Facebook. Please review and adjust as needed.
                  </p>
                </div>

                <h2 className="text-2xl font-bold text-gray-800">Review your business information</h2>
                <p className="text-gray-600">We've pre-filled this information from Facebook. Please review and edit as needed.</p>
                
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
                
                {/* New Appointment Booking Option */}
                <div className="mt-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="includeAppointments"
                      checked={formData.includeAppointments}
                      onChange={(e) => setFormData({...formData, includeAppointments: e.target.checked})}
                      className="form-checkbox h-5 w-5 text-blue-600"
                    />
                    <span className="ml-2 text-gray-700">Include appointment booking system</span>
                  </label>
                  <p className="mt-1 text-sm text-gray-500">
                    Allow customers to book appointments on your website
                  </p>
                </div>
                
                {/* Logo section */}
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Logo
                  </label>
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <input
                        type="file"
                        id="logo"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="sr-only"
                      />
                      <label
                        htmlFor="logo"
                        className="cursor-pointer px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                      >
                        {logoPreview ? 'Change Logo' : 'Upload Logo'}
                      </label>
                    </div>
                    {logoPreview && (
                      <div className="h-16 w-16 overflow-hidden rounded-md border">
                        <img 
                          src={logoPreview} 
                          alt="Logo preview" 
                          className="h-full w-full object-contain bg-gray-50"
                        />
                      </div>
                    )}
                  </div>
                  {logoPreview && logoPreview.startsWith('http') && (
                    <p className="mt-2 text-sm text-green-600">
                      ✅ Logo imported from Facebook profile
                    </p>
                  )}
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
                      .entrynets.com
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
                  {formData.email && (
                    <p className="mt-1 text-sm text-green-600">
                      ✅ Email imported from Facebook
                    </p>
                  )}
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
                className="text-center py-4"
              >
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                
                <h2 className="text-3xl font-bold text-gray-900 mb-2">
                  {buildStatus === 'initializing' ? 'Setting up your website...' : 'Your website is being built!'}
                </h2>
                
                {buildStatus === 'initializing' && (
                  <div className="mb-6">
                    <div className="flex items-center justify-center space-x-3 mb-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-4 border-blue-500 border-t-transparent"></div>
                      <p className="text-lg text-gray-600">Generating your content with AI...</p>
                    </div>
                    
                    <p className="text-gray-500 text-center mb-4">
                      This may take a moment while we create customized content for your business
                    </p>
                  </div>
                )}
                
                {(buildStatus === 'building' || buildStatus === 'ready') && (
                  <div className="mb-4">
                    {buildStatus === 'building' && (
                      <>
                        <div className="flex items-center justify-center space-x-3 mb-3">
                          <div className="animate-spin rounded-full h-5 w-5 border-4 border-blue-500 border-t-transparent"></div>
                          <p className="text-lg text-gray-600">Building your website...</p>
                        </div>
                        
                        {/* Progress bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                          <div 
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                        
                        <p className="text-gray-500 text-center mb-4">
                          {progress < 30 ? 'Setting up your site...' : 
                           progress < 60 ? 'Configuring your website...' :
                           progress < 90 ? 'Almost ready...' : 'Finalizing...'}
                        </p>
                      </>
                    )}
                    
                    {buildStatus === 'ready' && (
                      <div className="text-center mb-4">
                        <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-full mb-2">
                          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Your website is ready!
                        </div>
                        <p className="text-gray-600">Continue watching the tutorial below to learn how to customize it</p>
                      </div>
                    )}

                    {/* Admin Tutorial Video - only show when building or ready */}
                    <div className="bg-white rounded-lg shadow-lg p-3 sm:p-4 max-w-5xl mx-auto">
                      <div className="text-center mb-2">
                        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-1">
                          {buildStatus === 'building' ? 
                            'Learn How to Customize Your Website While You Wait' : 
                            'How to Customize Your New Website'
                          }
                        </h3>
                        <p className="text-sm sm:text-base text-gray-600">
                          Watch this quick tutorial to see how easy it is to customize your website using our admin panel
                        </p>
                      </div>
                      
                      <div className="relative bg-gray-900 rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                        {/* Unmute hint */}
                        <div className="absolute top-4 right-4 z-10 bg-black bg-opacity-75 text-white text-sm px-3 py-2 rounded-lg flex items-center hover:bg-opacity-90 transition-opacity">
                          <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.793L4.525 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.525l3.858-3.793a1 1 0 011.617.793zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.983 5.983 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.984 3.984 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                          </svg>
                          Click to unmute
                        </div>
                        
                        <video
                          className="w-full h-full object-cover"
                          controls
                          autoPlay
                          muted
                          playsInline
                          preload="metadata"
                          onError={(e) => {
                            console.log('Video failed to load:', e);
                            e.target.style.display = 'none';
                            e.target.nextElementSibling.style.display = 'flex';
                          }}
                        >
                          <source src="/Entry Nets Adminv2.mp4" type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                        
                        {/* Fallback content if video fails to load */}
                        <div className="hidden items-center justify-center absolute inset-0 bg-gray-100">
                          <div className="text-center p-6">
                            <div className="text-gray-400 mb-3">
                              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <p className="text-base text-gray-600">Tutorial video will be available shortly</p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Action buttons when site is ready - prominently placed */}
                      {buildStatus === 'ready' && (
                        <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                          <div className="text-center mb-3">
                            <div className="inline-flex items-center px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              🎉 Your website is live!
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <a 
                              href={`https://${createdSite?.siteId}.entrynets.com`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center font-semibold text-base shadow-md hover:shadow-lg transform hover:scale-105"
                            >
                              🌐 Visit Your Website
                            </a>
                            <a 
                              href={`https://${createdSite?.siteId}.entrynets.com/admin`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-6 py-3 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-center font-semibold text-base shadow-md hover:shadow-lg transform hover:scale-105"
                            >
                              ⚙️ Customize in Admin Panel
                            </a>
                          </div>
                        </div>
                      )}
                      
                      <div className="mt-3 text-center">
                        <p className="text-sm text-gray-500">
                          💡 <strong>Pro tip:</strong> Bookmark your admin panel: yoursite.entrynets.com/admin
                        </p>
                      </div>
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
                        href={`https://${createdSite?.siteId}.entrynets.com`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Check Your Website
                      </a>
                    </div>
                  </div>
                )}
                
                {/* Customer Outreach Message for FACESCRAPE */}
                {buildStatus === 'ready' && (
                  <div className="mt-6 border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.001 8.001 0 01-7.003-4.165L2 20l4.165-2.997A8.001 8.001 0 1121 12z" />
                      </svg>
                      Customer Outreach Message
                    </h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-800 mb-3">
                        Copy this message to reach out to the business owner:
                      </p>
                      <div className="bg-white border rounded-lg p-4 text-sm relative">
                        <div className="text-gray-800 leading-relaxed whitespace-pre-line" id="customerMessage">
{`I noticed you didn't have a website listed on your page.

I have mocked up a website for you so you can see what this could look like: https://${createdSite?.siteId}.entrynets.com

Everything is customisable on your admin panel: https://${createdSite?.siteId}.entrynets.com/admin

Login with password: ${formData.password}

Let me know if you are interested, no worries if not, I wish you all the best.`}
                        </div>
                        <button
                          onClick={() => {
                            const message = document.getElementById('customerMessage').textContent;
                            navigator.clipboard.writeText(message).then(() => {
                              // Show success feedback
                              const button = event.target;
                              const originalText = button.textContent;
                              button.textContent = '✓ Copied!';
                              button.classList.add('bg-green-600');
                              setTimeout(() => {
                                button.textContent = originalText;
                                button.classList.remove('bg-green-600');
                              }, 2000);
                            });
                          }}
                          className="absolute top-2 right-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                        >
                          Copy Message
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-6 border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Your website details</h3>
                  <div className="bg-gray-50 rounded-md p-4 text-left">
                    <p><span className="font-medium">Website URL:</span> https://{createdSite?.siteId}.entrynets.com</p>
                    <p><span className="font-medium">Admin URL:</span> https://{createdSite?.siteId}.entrynets.com/admin</p>
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
                    disabled={isSubmitting || countdown > 0}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-70 flex items-center"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                        Creating...
                      </>
                    ) : countdown > 0 ? (
                      <>
                        Creating in {countdown}s...
                      </>
                    ) : (
                      "Create Website"
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
