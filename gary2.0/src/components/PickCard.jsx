import React from 'react';
import UniformPickCard from './UniformPickCard';

/**
 * PickCard component - Wrapper around UniformPickCard for backward compatibility
 */
const PickCard = (props) => {
  return <UniformPickCard {...props} />;
};

export default PickCard;
