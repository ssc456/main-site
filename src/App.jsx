// src/App.jsx
import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header'
import { getThemedComponent } from './themes';
import AdminLogin from './admin/AdminLogin';
import AdminDashboard from './admin/AdminDashboard';
import CreateSite from './pages/CreateSite';
import { extractSiteId } from './utils/siteId';
import { initializePreviewDebugging, updatePreviewTitle } from './utils/previewHelpers';
import { Analytics } from '@vercel/analytics/react';

function App() {
  const [content, setContent] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [siteId, setSiteId] = useState('');
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    initializePreviewDebugging();
  }, []);

  // Function to update meta tags dynamically
  const updateMetaTags = (clientData) => {
    if (!clientData) return;
    
    const siteTitle = clientData.siteTitle || 'EntryNets Website';
    const description = clientData.about?.description || clientData.hero?.subheadline || 'Professional business website powered by EntryNets';
    const logoUrl = clientData.logoUrl || '';
    const siteUrl = window.location.href;
    
    // Clean description
    const cleanDescription = description
      .replace(/<[^>]*>/g, '')
      .replace(/\n/g, ' ')
      .trim()
      .substring(0, 160);
    
    // Update document title
    document.title = siteTitle;
    
    // Update or create meta tags
    const updateOrCreateMeta = (property, content, isOG = false) => {
      if (!content) return;
      
      const selector = isOG ? `meta[property="${property}"]` : `meta[name="${property}"]`;
      let meta = document.querySelector(selector);
      
      if (!meta) {
        meta = document.createElement('meta');
        if (isOG) {
          meta.setAttribute('property', property);
        } else {
          meta.setAttribute('name', property);
        }
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };
    
    // Standard meta tags
    updateOrCreateMeta('description', cleanDescription);
    updateOrCreateMeta('title', siteTitle);
    
    // Open Graph tags
    updateOrCreateMeta('og:title', siteTitle, true);
    updateOrCreateMeta('og:description', cleanDescription, true);
    updateOrCreateMeta('og:url', siteUrl, true);
    updateOrCreateMeta('og:site_name', siteTitle, true);
    updateOrCreateMeta('og:type', 'website', true);
    if (logoUrl) {
      updateOrCreateMeta('og:image', logoUrl, true);
      updateOrCreateMeta('og:image:width', '1200', true);
      updateOrCreateMeta('og:image:height', '630', true);
    }
    
    // Twitter tags
    updateOrCreateMeta('twitter:card', logoUrl ? 'summary_large_image' : 'summary', true);
    updateOrCreateMeta('twitter:title', siteTitle, true);
    updateOrCreateMeta('twitter:description', cleanDescription, true);
    updateOrCreateMeta('twitter:url', siteUrl, true);
    if (logoUrl) {
      updateOrCreateMeta('twitter:image', logoUrl, true);
    }
    
    // LinkedIn tags
    updateOrCreateMeta('linkedin:title', siteTitle, true);
    updateOrCreateMeta('linkedin:description', cleanDescription, true);
    if (logoUrl) {
      updateOrCreateMeta('linkedin:image', logoUrl, true);
    }
  };

  useEffect(() => {
    // Check if we're in preview mode
    const previewMode = window.location.search.includes('preview=true');
    setIsPreview(previewMode);
    
    if (previewMode) {
      console.log('[App] Running in preview mode');
      setLoading(false);
      
      // Function to notify parent that the preview is ready
      const notifyReady = () => {
        try {
          window.parent.postMessage('PREVIEW_LOADED', '*');
          console.log('[App] Preview ready message sent');
        } catch (err) {
          console.error('[App] Failed to send ready message:', err);
        }
      };
      
      // Set up listener for content updates
      const handleMessage = (event) => {
        if (event.data?.type === 'UPDATE_CLIENT_DATA' && event.data?.clientData) {
          console.log('[App] Received client data in preview mode');
          
          const newData = event.data.clientData;
          
          // Important: Create brand new object references to force re-render
          setContent({...newData});
          
          // Make sure config is properly updated as well
          if (newData.config) {
            setConfig({...newData.config});
          }
          
          // Update meta tags and document title
          updateMetaTags(newData);
          
          setLoading(false);
          console.log('[App] Preview content updated successfully');
        }
      };
      
      // Register the event listener
      window.addEventListener('message', handleMessage);
      
      // Send initial ready notification
      notifyReady();
      
      // Also try again shortly in case the parent wasn't ready
      setTimeout(notifyReady, 500);
      
      return () => {
        window.removeEventListener('message', handleMessage);
      };
    }
    
    const extractedSiteId = extractSiteId();
    setSiteId(extractedSiteId);
    
    console.log('App loading data for site ID:', extractedSiteId);

    // First try API endpoint with Redis data
    fetch(`/api/client-data?siteId=${extractedSiteId}`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Remote data not available');
        }
        return response.json();
      })
      .then(data => {
        setContent(data);
        if (data.config) {
          setConfig(data.config);
        }
        setLoading(false);
        
        // Update meta tags with loaded content
        updateMetaTags(data);
      })
      .catch(error => {
        console.warn('API data fetch failed, falling back to local file:', error);
        // Fall back to local client.json
        fetch('/client.json')
          .then(r => r.json())
          .then(client => {
            setContent(client);
            if (client.config) {
              setConfig(client.config);
            }
            setLoading(false);
            
            // Update meta tags with fallback content
            updateMetaTags(client);
          })
          .catch(err => {
            console.error('Failed to load content:', err);
            setLoading(false);
          });
      });
  }, []);
  
  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-16 w-16 border-4 border-pink-200 border-t-pink-600 mx-auto mb-4' />
          <p className='text-gray-600 text-lg'>Loading…</p>
        </div>
      </div>
    )
  }

  if (!content || !config) return null

  // Get theme from config
  const theme = config.theme || 'default';

  // Get themed components
  const ThemedHeroSection = getThemedComponent('HeroSection', theme);
  const ThemedAboutSection = getThemedComponent('AboutSection', theme);
  const ThemedServicesSection = getThemedComponent('ServicesSection', theme);
  const ThemedFeaturesSection = getThemedComponent('FeaturesSection', theme);
  const ThemedGallerySection = getThemedComponent('GallerySection', theme);
  const ThemedTestimonialsSection = getThemedComponent('TestimonialsSection', theme);
  const ThemedFAQSection = getThemedComponent('FAQSection', theme);
  const ThemedContactSection = getThemedComponent('ContactSection', theme);
  
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/dashboard/*" element={<AdminDashboard />} />
        <Route path="/create" element={<CreateSite />} />
        <Route path="/" element={
          <div className='min-h-screen bg-white scroll-smooth'>
            <Header siteTitle={content.siteTitle} logoUrl={content.logoUrl} config={config} primaryColor={config.primaryColor} />
            <AnimatePresence mode='wait'>
              {config.showHero && <ThemedHeroSection key='hero' {...content.hero} primaryColor={config.primaryColor} />}
              {config.showAbout && <ThemedAboutSection key='about' {...content.about} primaryColor={config.primaryColor} logoUrl={content.logoUrl} />}
              {config.showServices && <ThemedServicesSection key='services' {...content.services} primaryColor={config.primaryColor} secondaryColor={config.secondaryColor} />}
              {config.showFeatures && <ThemedFeaturesSection key='features' {...content.features} primaryColor={config.primaryColor} />}
              {config.showGallery && <ThemedGallerySection key='gallery' {...content.gallery} primaryColor={config.primaryColor} />}
              {config.showTestimonials && <ThemedTestimonialsSection key='testimonials' {...content.testimonials} primaryColor={config.primaryColor} />}
              {config.showFAQ && <ThemedFAQSection key='faq' {...content.faq} primaryColor={config.primaryColor} />}
              {config.showContact && <ThemedContactSection key='contact' {...content.contact} primaryColor={config.primaryColor} />}
            </AnimatePresence>
          </div>
        } />
      </Routes>
      
      <Analytics />
    </BrowserRouter>
  )
}

export default App
