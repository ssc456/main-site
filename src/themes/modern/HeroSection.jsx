import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, PlayCircle, Sparkles } from 'lucide-react';

function HeroSection({
  headline,
  subheadline,
  ctaText,
  ctaLink,
  primaryColor,
  secondaryColor,
  backgroundImage
}) {
  const navigate = useNavigate();
  const howItWorksVideo = encodeURI('/EntrySiteCreation Final.mp4');
  
  // Color mapping
  const colorClasses = {
    pink: {
      gradient: 'from-pink-500 to-rose-400',
      button: 'bg-gradient-to-r from-pink-500 to-rose-400',
      text: 'text-pink-500'
    },
    purple: {
      gradient: 'from-purple-500 to-indigo-400',
      button: 'bg-gradient-to-r from-purple-500 to-indigo-400',
      text: 'text-purple-500'
    },
    blue: {
      gradient: 'from-blue-500 to-cyan-400',
      button: 'bg-gradient-to-r from-blue-500 to-cyan-400',
      text: 'text-blue-500'
    },
    green: {
      gradient: 'from-green-500 to-emerald-400',
      button: 'bg-gradient-to-r from-green-500 to-emerald-400',
      text: 'text-green-500'
    }
  }[primaryColor] || colorClasses.blue;

  return (
    <section id="hero" className="relative min-h-screen flex items-center">
      {/* Background with blur effect */}
      <div className="absolute inset-0 bg-gray-900 opacity-80 z-0"></div>
      
      {/* Background pattern */}
      <div className="absolute inset-0 z-0 opacity-20" 
        style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%239C92AC" fill-opacity="0.4"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'}}
      ></div>
      
      {/* Content */}
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left column with text content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-white"
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100px" }}
              transition={{ duration: 1, delay: 0.2 }}
              className={`h-1 bg-gradient-to-r ${colorClasses.gradient} mb-8`}
            ></motion.div>
            
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              {headline}
            </h1>
            
            <p className="text-xl text-gray-300 mb-10">
              {subheadline}
            </p>
            
            <div className="flex flex-wrap gap-4">
              {/* Primary CTA - Get Started button to site creation page */}
              <motion.button
                onClick={() => navigate('/create')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                className={`${colorClasses.button} px-8 py-4 rounded-lg font-medium flex items-center space-x-2`}
              >
                <span>Get Started</span>
                <ChevronRight size={20} />
              </motion.button>
              
              {/* Secondary CTA - Learn More scrolls to About section */}
              <motion.button
                onClick={() => {
                  const aboutSection = document.querySelector('#about');
                  if (aboutSection) {
                    const headerHeight = 80;
                    const elementPosition = aboutSection.offsetTop - headerHeight;
                    window.scrollTo({
                      top: elementPosition,
                      behavior: 'smooth'
                    });
                  }
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                className="bg-white bg-opacity-10 backdrop-blur-sm border border-white border-opacity-20 text-white px-8 py-4 rounded-lg font-medium hover:bg-opacity-20 transition-all"
              >
                Learn More
              </motion.button>
            </div>
          </motion.div>
          
          {/* How it Works video section with enhanced styling */}
          <div className="relative mt-8 lg:mt-0">
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative z-10"
            >
              {/* Section header with icon and effects */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm">
                    <Sparkles className="w-4 h-4 text-white/80" />
                  </div>
                  <h3 className="text-xl font-bold text-white">How It Works</h3>
                </div>
                <p className="text-white/70 text-sm">See our platform in action</p>
              </div>

              {/* Video container with glass morphism and glow effects */}
              <div className="relative group">
                {/* Animated glow background */}
                <div className={`absolute -inset-1 bg-gradient-to-r ${colorClasses.gradient} rounded-3xl blur-lg opacity-60 group-hover:opacity-80 transition-opacity duration-500`}></div>
                
                {/* Glass container */}
                <div className="relative backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-4 shadow-2xl">
                  <div className="relative w-full rounded-xl overflow-hidden bg-black/50">
                    {/* 16:9 aspect ratio */}
                    <div className="pt-[56.25%]" />
                    
                    {/* Video element */}
                    <video
                      src={howItWorksVideo}
                      controls
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 w-full h-full object-contain bg-black rounded-xl"
                      poster="/social-preview.png"
                    />
                  </div>
                  
                  {/* Bottom stats/info bar */}
                  <div className="flex items-center justify-between mt-4 text-white/60 text-xs">
                    <span>🎥 Tutorial Video</span>
                    <span>⏱️ 2 min watch</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
      
      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent"></div>
    </section>
  );
}

export default HeroSection;