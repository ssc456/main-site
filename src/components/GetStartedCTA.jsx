import { Link } from 'react-router-dom';

export default function GetStartedCTA() {
  return (
    <section className="py-20 bg-gradient-to-br from-blue-500 to-blue-700 text-white">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Create Your Business Website Today</h2>
          <p className="text-xl mb-10 opacity-90">
            Launch your professional business website in minutes, powered by AI.
            No coding required. Just answer a few questions about your business.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link 
              to="/create" 
              className="px-8 py-3 bg-white text-blue-700 rounded-lg font-medium text-lg hover:bg-blue-50 transition-colors shadow-lg"
            >
              Get Started for Free
            </Link>
            <a 
              href="#features" 
              className="px-8 py-3 border-2 border-white text-white rounded-lg font-medium text-lg hover:bg-white/10 transition-colors"
            >
              Learn More
            </a>
          </div>
          <p className="mt-6 text-sm opacity-80">
            No credit card required. Create and publish your site in minutes.
          </p>
        </div>
      </div>
    </section>
  );
}

// Import in your main page component
import GetStartedCTA from './components/GetStartedCTA';

// Add it after your hero section
{config.showHero && (
  <HeroSection key='hero' {...content.hero} primaryColor={config.primaryColor} secondaryColor={config.secondaryColor} animations={config.animations} />
)}
<GetStartedCTA />
{config.showAbout && <AboutSection key='about' {...content.about} primaryColor={config.primaryColor} />}