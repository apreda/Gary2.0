import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import '../assets/css/animations.css';
import '../styles/dimensional.css';
import Gary20 from '../assets/images/Gary20.png';
import newspaperBg from '../assets/images/newspaper.png';

// Fade-in animation variants for Framer Motion
const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8 } }
};

// Stagger children animation variants
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
};

// Component for section headers with pretitle and title
const SectionHeader = ({ pretitle, title, description }) => {
  return (
    <motion.div 
      className="text-center mb-8"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      viewport={{ once: true, margin: "-50px" }}
    >
      {pretitle && (
        <p className="text-sm uppercase tracking-widest text-[#b8953f] mb-2">{pretitle}</p>
      )}
      <h2 className="text-3xl md:text-4xl font-bold mb-4">
        {title}
      </h2>
      {description && (
        <p className="text-gray-300 max-w-2xl mx-auto">{description}</p>
      )}
      <div className="w-16 h-1 bg-[#b8953f] mx-auto mt-6"></div>
    </motion.div>
  );
};

// Component for showing step cards
const StepCard = ({ number, title, description, image, reverse = false }) => {
  return (
    <motion.div 
      className={`grid grid-cols-1 ${reverse ? 'lg:grid-cols-12' : 'lg:grid-cols-12'} gap-6 lg:gap-10 items-center mb-12`}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true, margin: "-50px" }}
    >
      <div className={`${reverse ? 'lg:col-span-7 lg:order-2' : 'lg:col-span-7 lg:order-1'}`}>
        <div className="flex items-center mb-4">
          <div className="w-12 h-12 rounded-full bg-[#b8953f] flex items-center justify-center text-black text-xl font-bold mr-4">{number}</div>
          <h3 className="text-2xl font-bold">{title}</h3>
        </div>
        <p className="text-gray-300 mb-6 text-lg">{description}</p>
      </div>
      
      <div className={`${reverse ? 'lg:col-span-5 lg:order-1' : 'lg:col-span-5 lg:order-2'}`}>
        <div className="aspect-video rounded-lg overflow-hidden border-2 border-gray-800 shadow-xl">
          <img 
            src={image} 
            alt={title}
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </motion.div>
  );
};

// Component for testimonial cards
const TestimonialCard = ({ quote, author, rating }) => {
  return (
    <motion.div 
      className="bg-black/40 border border-gray-800 rounded-xl p-6 hover:border-[#b8953f]/50 transition-all duration-300"
      variants={fadeIn}
    >
      {/* Gold quotes */}
      <div className="text-[#b8953f] text-4xl font-serif mb-4">"</div>
      
      <p className="text-gray-200 mb-4">{quote}</p>
      
      <div className="flex justify-between items-center">
        <p className="font-semibold">{author}</p>
        <div className="flex">
          {[...Array(rating)].map((_, i) => (
            <span key={i} className="text-[#b8953f]">★</span>
          ))}
          {[...Array(5-rating)].map((_, i) => (
            <span key={i} className="text-gray-600">★</span>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

// Stats display component
const StatsDisplay = () => {
  return (
    <motion.div 
      className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.4 }}
    >
      <StatItem value="67%" label="Win Rate" />
      <StatItem value="15.2%" label="ROI" />
      <StatItem value="4.3k+" label="Users" />
      <StatItem value="24/7" label="Analysis" />
    </motion.div>
  );
};

// Individual stat item
const StatItem = ({ value, label }) => {
  return (
    <div className="bg-black/40 backdrop-blur-md rounded-lg border border-gray-800 p-6 text-center">
      <p className="text-3xl md:text-4xl font-bold text-[#b8953f] mb-1">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );
};

// Main component
export function HowItWorks() {
  return (
    <div className="bg-black min-h-screen pt-4">
      {/* Background elements */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        {/* Gold vignette corners */}
        <div className="absolute top-1/4 right-0 w-64 h-64 rounded-full bg-[#b8953f]/10 blur-xl opacity-60 z-0"></div>
        <div className="absolute bottom-1/4 left-0 w-80 h-80 rounded-full bg-[#b8953f]/10 blur-xl opacity-60 z-0"></div>
        {/* Subtle grid/noise overlay for texture */}
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-10 mix-blend-soft-light" />
        {/* Newspaper texture in background */}
        <div className="absolute inset-0" style={{
          backgroundImage: `url(${newspaperBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.05,
          filter: "brightness(0.5) contrast(1.2)"
        }}></div>
      </div>

      {/* Hero Section */}
      <section className="pt-16 pb-12 px-6 lg:px-8 relative overflow-hidden">
        <div className="container mx-auto max-w-6xl">
          <motion.div 
            className="text-center mb-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            {/* Gary 2.0 Logo */}
            <div className="mb-8 flex justify-center">
              <img src={Gary20} alt="Gary 2.0" className="h-16 md:h-20" />
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              How <span className="text-[#b8953f]">It Works</span>
            </h1>
            
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Meet Gary, the AI handicapper bringing you data-driven picks 
              with winning edge technology.
            </p>

            {/* Gold decorator line */}
            <div className="w-24 h-1 bg-[#b8953f] mx-auto mt-10"></div>
          </motion.div>

          {/* Stats highlight section */}
          <div className="mb-24">
            <StatsDisplay />
          </div>
        </div>
      </section>

      {/* Process Steps Section */}
      <section className="py-12 px-6 lg:px-8 relative">
        <div className="container mx-auto max-w-6xl relative z-10">
          <SectionHeader 
            pretitle="Our Process"
            title="How Gary Helps You Win"
            description="Gary's advanced AI combines deep sports knowledge, real-time data analysis, and betting expertise to generate high-confidence picks."
          />
          
          {/* Step 1 */}
          <StepCard 
            number="1"
            title="Data Analysis"
            description="Gary analyzes millions of data points across team stats, player performance, historical matchups, and betting trends to identify value opportunities that others miss."
            image="/img/gary-data-analysis.jpg"
          />
          
          {/* Step 2 */}
          <StepCard 
            number="2"
            title="Premium Pick Generation"
            description="Gary's proprietary algorithm calculates win probabilities and compares them against actual betting lines to identify the best value picks with the highest likelihood of success."
            image="/img/gary-picks.jpg"
            reverse={true}
          />
          
          {/* Step 3 */}
          <StepCard 
            number="3"
            title="Track Your Success"
            description="Every pick is tracked in your personal dashboard. Watch your wins accumulate in real-time as Gary's picks hit, and see detailed analytics on your betting performance."
            image="/img/gary-tracking.jpg"
          />
        </div>

        {/* Background elements - increased opacity */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[#b8953f]/10 blur-3xl opacity-70 z-0"></div>
      </section>

      {/* Testimonials Section */}
      <section className="py-12 px-6 lg:px-8">
        <div className="container mx-auto max-w-6xl">
          <SectionHeader 
            pretitle="Success Stories"
            title="What Our Winners Say"
          />
          
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
          >
            <TestimonialCard 
              quote="Gary's picks have consistently beaten the books. Up 17% in just my first month using the service."
              author="Mike T."
              rating={5}
            />
            
            <TestimonialCard 
              quote="The detailed analysis that comes with each pick helps me understand exactly why Gary is taking a certain side."
              author="Sarah K."
              rating={5}
            />
            
            <TestimonialCard 
              quote="After following Gary for a full season, I'm up over 22 units. The best investment I've made in my betting career."
              author="James R."
              rating={4}
            />
          </motion.div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-12 px-6 lg:px-8 bg-gray-900/50 relative">
        <div className="container mx-auto max-w-4xl relative z-10">
          <SectionHeader 
            pretitle="Questions"
            title="Frequently Asked Questions"
          />
          
          <motion.div className="space-y-6"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
          >
            <motion.div variants={fadeIn} className="bg-black/40 border border-gray-800 rounded-xl p-6">
              <h3 className="text-xl font-bold mb-3 text-[#b8953f]">How accurate are Gary's picks?</h3>
              <p className="text-gray-300">Gary maintains a documented success rate of 67% across all premium picks, with detailed performance analytics available in your dashboard.</p>
            </motion.div>
            
            <motion.div variants={fadeIn} className="bg-black/40 border border-gray-800 rounded-xl p-6">
              <h3 className="text-xl font-bold mb-3 text-[#b8953f]">When are picks released?</h3>
              <p className="text-gray-300">Premium picks are typically released 4-6 hours before game time to account for the latest data, injuries, and line movements.</p>
            </motion.div>
            
            <motion.div variants={fadeIn} className="bg-black/40 border border-gray-800 rounded-xl p-6">
              <h3 className="text-xl font-bold mb-3 text-[#b8953f]">What sports does Gary cover?</h3>
              <p className="text-gray-300">Gary provides premium picks for NBA, NFL, MLB, and NHL, with plans to expand to additional sports in the future.</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 px-6 lg:px-8 relative overflow-hidden">
        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to <span className="text-[#b8953f]">Win with Gary?</span>
            </h2>
            
            <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
              Join thousands of winners getting premium picks backed by 
              advanced AI technology and decades of betting expertise.
            </p>
            
            <Link 
              to="/real-gary-picks" 
              className="inline-flex items-center justify-center bg-[#b8953f] border-2 border-[#b8953f] text-[#232326] font-semibold px-8 py-4 rounded-lg hover:bg-[#a07a2d] transition duration-300 text-lg"
            >
              Get Today's Picks
            </Link>
            
            <div className="mt-6">
              <Link to="/pricing" className="text-[#b8953f] hover:underline font-medium">View pricing plans</Link>
            </div>
          </motion.div>
        </div>
        
        {/* Enhanced background effect for CTA */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-black/0 via-[#b8953f]/10 to-black/0 z-0"></div>
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#b8953f]/10 blur-2xl opacity-60 z-0"></div>
      </section>
    </div>
  );
}

export default HowItWorks;
