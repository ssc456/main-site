// src/components/AboutSection.jsx
import { LightBulbIcon } from '@heroicons/react/24/solid'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

function AboutSection({ title, description, primaryColor }) {
  return (
    <section id='about' className='bg-white py-20 px-6'>
      <motion.div className='max-w-4xl mx-auto text-center' initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
        <LightBulbIcon className={`h-12 w-12 text-${primaryColor}-500 mx-auto mb-4`} />
        <h2 className='text-3xl font-bold mb-4'>{title}</h2>
        <p className='text-lg text-gray-700'>{description}</p>
        <motion.button
          onClick={() => {
            const servicesSection = document.querySelector('#services');
            if (servicesSection) {
              const headerHeight = 80;
              const elementPosition = servicesSection.offsetTop - headerHeight;
              window.scrollTo({
                top: elementPosition,
                behavior: 'smooth'
              });
            }
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
          className={`px-6 py-3 text-${primaryColor}-500 bg-white border border-${primaryColor}-500 rounded-lg font-medium mt-6 inline-flex items-center`}
        >
          <span>Learn More</span>
          <ChevronRight className="ml-2 h-5 w-5" />
        </motion.button>
      </motion.div>
    </section>
  )
}

export default AboutSection
