import updateExistingPicks from './updateExistingPicks';

// Directly run the update when this script is executed
console.log('Starting update of existing picks to add homeTeam and awayTeam fields...');
updateExistingPicks()
  .then(() => {
    console.log('Update process complete!');
  })
  .catch(err => {
    console.error('Error running update:', err);
  });

// Export the function in case we want to run it from elsewhere
export default updateExistingPicks;
